import { useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { useGoals } from '../../hooks/useGoals'
import { useTasks } from '../../hooks/useTasks'
import { useTaskLogs } from '../../hooks/useTaskLogs'
import { PLANNING_TABLES, addDays, todayKey } from '../../lib/planning'

/**
 * Sync Objectifs ↔ Planning — approche liaison manuelle.
 *
 * Chaque objectif habit (top-level ou embarqué) porte `linkedTaskIds: string[]`
 * qui liste les tâches Planning qui l'alimentent. La sync recalcule
 * `goal.entries` à partir des logs Planning de ces tâches — Planning est
 * la source de vérité.
 *
 * - Aucune création automatique de tâche.
 * - Aucune boucle de duplication : on lit, on ne crée rien.
 * - Fenêtre : 120 jours en arrière pour couvrir séries et bandes.
 */
const WINDOW_DAYS = 120

/**
 * Table de matching auto : chaque objectif habit s'alimente
 * automatiquement des tâches Planning qui matchent (axe + regex de titre).
 * Aucune saisie manuelle nécessaire — l'utilisateur crée ses tâches
 * comme il veut, les objectifs se remplissent.
 *
 * `titlePatterns` : mot-clé (ou regex) recherché insensible à la casse
 * dans le titre de la tâche. Si vide, tout l'axe est matché.
 * `contribution` : ce que chaque tâche done ce jour contribue
 *    - 'full'         → entries[d] = target (une tâche done = objectif du jour atteint)
 *    - 'fractional'   → chaque tâche done compte pour 1/N (N = tâches matchantes actives)
 *    - 'increment'    → chaque tâche done ajoute `increment` unités (cumulatif)
 */
const AUTO_LINKS = [
  { goalId: 'goal_salat', embedded: false, axes: ['spiritualite'],
    titlePatterns: [/pri[eè]re/i, /salat|salât|salah/i, /fajr|dohr|dhohr|asr|maghrib|isha|ish[âa]/i],
    contribution: 'fractional' },
  { goalId: 'goal_hizb',  embedded: false, axes: ['spiritualite'],
    titlePatterns: [/hizb|hezb|حزب/i, /verset|ayah|آية|ayat/i, /coran|qur[âa]n|quran|قرآن/i, /m[ée]moris/i],
    contribution: 'increment' },
  { goalId: 'goal_body',  embedded: false, axes: ['sante'],
    titlePatterns: [/sport|s[éeè]ance|gym|muscul|pompe|abdo|squat|corps|bas du corps|training|workout/i],
    contribution: 'full' },
  { goalId: 'goal_marti', embedded: true,  axes: ['personnel'],
    titlePatterns: [/marti|femme|mariage|zawaj/i],
    contribution: 'full' },
  { goalId: 'goal_sante', embedded: true,  axes: ['sante'],
    titlePatterns: [/sport|s[éeè]ance|gym|muscul|pompe|abdo|marche|entrainement|training|workout|santé|corps/i],
    contribution: 'full' },
]

/** Trouve les tâches Planning qui matchent une règle d'auto-link. */
function autoMatchedTaskIds(rule, tasks) {
  const out = []
  for (const t of tasks) {
    if (t.active === false) continue
    if (rule.axes.length && !rule.axes.includes(t.axis)) continue
    if (rule.titlePatterns.length > 0) {
      const title = t.title || ''
      const ok = rule.titlePatterns.some((rx) => rx.test(title))
      if (!ok) continue
    }
    out.push(t.id)
  }
  return out
}

export default function GoalsPlanningSync() {
  const { user } = useAuth()
  const goals = useGoals()
  const { tasks, isLoading: tasksLoading } = useTasks()
  const queryClient = useQueryClient()
  const to = todayKey()
  // Fenêtre annuelle : du 1er janvier (ou 120 j si plus long) pour que la
  // progression annuelle reflète toute l'année, pas seulement 4 mois.
  const yearStart = `${to.slice(0, 4)}-01-01`
  const rolling = addDays(to, -(WINDOW_DAYS - 1))
  const from = yearStart < rolling ? yearStart : rolling
  const { logs, isLoading: logsLoading } = useTaskLogs(from, to)
  const dedupDone = useRef(false)

  // Suppression en masse (bypass useTasks pour un seul aller-retour)
  const bulkDelete = useMutation({
    mutationFn: async (ids) => {
      if (!ids?.length) return
      const { error } = await supabase.from(PLANNING_TABLES.tasks).delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', user?.id] }),
  })

  /**
   * Dédoublonnage automatique : détecte les groupes de tâches ayant
   * exactement le même titre + même axe, garde la plus ancienne, supprime
   * le reste. S'exécute une seule fois par session, dès que `tasks` est
   * chargé. Corrige les duplications héritées d'une ancienne version qui
   * en créait automatiquement à chaque render.
   */
  useEffect(() => {
    if (!user || tasks.length === 0 || dedupDone.current) return
    const groups = new Map()  // key = title|axis → tâches triées par created_at asc
    for (const t of tasks) {
      const key = `${t.title}|${t.axis}`
      const arr = groups.get(key) || []
      arr.push(t)
      groups.set(key, arr)
    }
    const toDelete = []
    const rebindings = []  // [{ taskIdBefore, taskIdKeep }]
    for (const arr of groups.values()) {
      if (arr.length < 2) continue
      arr.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
      const keeper = arr[0]
      for (let i = 1; i < arr.length; i++) {
        toDelete.push(arr[i].id)
        rebindings.push({ taskIdBefore: arr[i].id, taskIdKeep: keeper.id })
      }
    }
    dedupDone.current = true
    if (toDelete.length === 0) return

    // Recolle les linkedTaskIds pointant sur un doublon supprimé vers le keeper
    const remap = new Map(rebindings.map((r) => [r.taskIdBefore, r.taskIdKeep]))
    const nextGoals = goals.state.goals.map((g) => {
      let ng = g
      const rewire = (list) => {
        if (!Array.isArray(list) || list.length === 0) return list
        const seen = new Set()
        const out = []
        for (const id of list) {
          const target = remap.get(id) || id
          if (seen.has(target)) continue
          seen.add(target); out.push(target)
        }
        return out
      }
      const t1 = rewire(g.linkedTaskIds || [])
      if (t1 !== g.linkedTaskIds) ng = { ...ng, linkedTaskIds: t1 }
      if (g.habit) {
        const t2 = rewire(g.habit.linkedTaskIds || [])
        if (t2 !== g.habit.linkedTaskIds) ng = { ...ng, habit: { ...ng.habit, linkedTaskIds: t2 } }
      }
      return ng
    })
    goals.setState((s) => ({ ...s, goals: nextGoals }))
    bulkDelete.mutate(toDelete)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tasks])

  // Nettoyage des ids orphelins : si une tâche Planning est supprimée, on
  // retire sa reference des linkedTaskIds des objectifs (une seule fois).
  const orphanCleaned = useRef(false)
  useEffect(() => {
    if (!user || tasks.length === 0 || orphanCleaned.current) return
    const known = new Set(tasks.map((t) => t.id))
    let mutated = false
    const nextGoals = goals.state.goals.map((g) => {
      let ng = g
      if (Array.isArray(g.linkedTaskIds) && g.linkedTaskIds.length > 0) {
        const kept = g.linkedTaskIds.filter((id) => known.has(id))
        if (kept.length !== g.linkedTaskIds.length) { ng = { ...ng, linkedTaskIds: kept }; mutated = true }
      }
      if (g.habit && Array.isArray(g.habit.linkedTaskIds) && g.habit.linkedTaskIds.length > 0) {
        const kept = g.habit.linkedTaskIds.filter((id) => known.has(id))
        if (kept.length !== g.habit.linkedTaskIds.length) {
          ng = { ...ng, habit: { ...ng.habit, linkedTaskIds: kept } }; mutated = true
        }
      }
      return ng
    })
    orphanCleaned.current = true
    if (mutated) goals.setState((s) => ({ ...s, goals: nextGoals }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tasks])

  // Reconstruction des entries à chaque changement de logs OU de tasks
  // (l'auto-match dépend des titres des tâches).
  // Signature des liaisons manuelles : recalcul immédiat quand l'utilisateur
  // coche/décoche une tâche dans « Liaisons Planning » (avant, rien ne se
  // recalculait tant qu'un log ne changeait pas).
  const linkSig = goals.state.goals
    .map((g) => `${g.id}:${(g.linkedTaskIds || []).join(',')}:${(g.habit?.linkedTaskIds || []).join(',')}`)
    .join('|')

  useEffect(() => {
    // Ne rien écrire tant que tâches ET logs ne sont pas chargés : sinon des
    // logs encore vides effaceraient la progression existante.
    if (!user || tasksLoading || logsLoading) return
    const logsByTask = new Map()
    for (const l of logs) {
      const arr = logsByTask.get(l.task_id) || []
      arr.push(l)
      logsByTask.set(l.task_id, arr)
    }

    // Index des règles auto-link par goalId
    const rulesByGoal = new Map(AUTO_LINKS.map((r) => [r.goalId, r]))

    goals.setState((s) => {
    let mutated = false
    const nextGoals = s.goals.map((g) => {
      let ng = g

      // -- top-level habit -------------------------------------------------
      if (g.type === 'habit') {
        const rule = rulesByGoal.get(g.id)
        const autoIds = rule ? autoMatchedTaskIds(rule, tasks) : []
        const explicitIds = g.linkedTaskIds || []
        const effectiveIds = Array.from(new Set([...explicitIds, ...autoIds]))
        if (effectiveIds.length > 0) {
          const entries = computeEntries({
            habit: g, ids: effectiveIds, logsByTask, tasksList: tasks, rule,
          })
          if (!entriesEqual(entries, g.entries)) {
            let currentTotal = g.currentTotal
            if (g.cumulative) currentTotal = Object.values(entries).reduce((s, v) => s + (Number(v) || 0), 0)
            ng = { ...ng, entries, currentTotal }
            mutated = true
          }
        }
      }

      // -- embedded habit (milestone.habit) --------------------------------
      if (g.habit) {
        const rule = rulesByGoal.get(g.id)
        const autoIds = rule ? autoMatchedTaskIds(rule, tasks) : []
        const explicitIds = g.habit.linkedTaskIds || []
        const effectiveIds = Array.from(new Set([...explicitIds, ...autoIds]))
        if (effectiveIds.length > 0) {
          const entries = computeEntries({
            habit: g.habit, ids: effectiveIds, logsByTask, tasksList: tasks, rule,
          })
          if (!entriesEqual(entries, g.habit.entries)) {
            ng = { ...ng, habit: { ...ng.habit, entries } }
            mutated = true
          }
        }
      }

      return ng
    })
    return mutated ? { ...s, goals: nextGoals } : s
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, tasks, tasksLoading, logsLoading, linkSig])

  return null
}

/**
 * Construit un dict { date: valeur } pour un habit, selon la contribution :
 *  - 'full'       → entries[d] = target dès qu'AU MOINS un log est done ce jour
 *  - 'fractional' → entries[d] = (nb done ce jour / total tâches matchantes actives) × target
 *  - 'increment'  → entries[d] = nb done ce jour × increment (capé à dailyMax)
 * Par défaut : 'full'.
 */
function computeEntries({ habit, ids, logsByTask, tasksList, rule }) {
  const target = Number(habit.target) || 1
  const contribution = rule?.contribution || (habit.cumulative ? 'increment' : 'full')
  const dailyMax = Number(habit.dailyMax) || Infinity

  // Total de tâches matchantes actives, pour la fractionnelle
  const totalActive = rule && contribution === 'fractional'
    ? autoMatchedTaskIds(rule, tasksList).length
    : ids.length

  const taskById = new Map(tasksList.map((t) => [t.id, t]))
  const dateCounts = {}
  const dateAmounts = {}  // pour 'increment' : quantité réelle (tâches progressives)
  for (const id of ids) {
    const arr = logsByTask.get(id) || []
    const task = taskById.get(id)
    for (const l of arr) {
      if (!l.done) continue
      const d = String(l.log_date).slice(0, 10)
      dateCounts[d] = (dateCounts[d] || 0) + 1
      // Tâche progressive cochée : sa valeur du jour (ex. 4 versets) compte
      // telle quelle au lieu de « 1 coche = 1 incrément ».
      const tv = Number(l.target_value)
      const amount = task?.type === 'progressive' && tv > 0 ? tv : (Number(habit.increment) || 1)
      dateAmounts[d] = (dateAmounts[d] || 0) + amount
    }
  }

  const entries = {}
  for (const [d, count] of Object.entries(dateCounts)) {
    let value
    if (contribution === 'fractional') {
      // Tout-ou-rien : l'objectif du jour ne s'active que si TOUTES les
      // tâches matchantes actives sont cochées ce jour.
      const denom = Math.max(1, totalActive)
      value = count >= denom ? target : 0
    } else if (contribution === 'increment') {
      value = Math.min(dailyMax, dateAmounts[d] || 0)
    } else {
      value = target
    }
    if (value > 0) entries[d] = value
  }
  return entries
}

function entriesEqual(a, b) {
  const ak = Object.keys(a || {})
  const bk = Object.keys(b || {})
  if (ak.length !== bk.length) return false
  for (const k of ak) if (Number(a[k]) !== Number((b || {})[k])) return false
  return true
}

// Exporté pour usage éventuel dans le dashboard
export const HABIT_TASK_LINKS = []
