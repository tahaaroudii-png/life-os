import { useCallback, useSyncExternalStore } from 'react'
import { KEY, buildSeed } from '../lib/goals'
import { todayKey } from '../lib/ecom'

/**
 * Applique une action du dashboard à l'état, en direction `done` (true = fait,
 * false = annuler). Une action peut viser plusieurs objectifs (ex. bas du corps
 * → body + santé) : chaque cible est traitée par son propre mode.
 */
function applyAction(state, action, done) {
  if (!action || !Array.isArray(action.targets)) return state
  const today = todayKey()
  const goals = state.goals.map((g) => {
    const target = action.targets.find((t) => t.goalId === g.id)
    if (!target) return g
    if (target.mode === 'toggle-daily') {
      const entries = { ...(g.entries || {}) }
      if (done) entries[today] = Number(g.target) || 1
      else delete entries[today]
      return { ...g, entries }
    }
    if (target.mode === 'toggle-embedded' && g.habit) {
      const entries = { ...(g.habit.entries || {}) }
      if (done) entries[today] = Number(g.habit.target) || 1
      else delete entries[today]
      return { ...g, habit: { ...g.habit, entries } }
    }
    if (target.mode === 'increment') {
      const entries = { ...(g.entries || {}) }
      const cur = Number(entries[today]) || 0
      const delta = Number(target.delta) || 1
      const dailyMax = Number(target.maxPerDay || g.dailyMax) || Infinity
      const raw = done ? cur + delta : Math.max(0, cur - delta)
      const next = Math.min(dailyMax, raw)
      if (next <= 0) delete entries[today]
      else entries[today] = next
      let currentTotal = g.currentTotal
      if (g.cumulative) currentTotal = Object.values(entries).reduce((s, v) => s + (Number(v) || 0), 0)
      return { ...g, entries, currentTotal }
    }
    return g
  })
  return { ...state, goals }
}

/**
 * Migration goal_zawaj → goal_marti : renomme l'id, ajoute labelAr et le
 * bloc habit `hb_marti`. On préserve tout ce que l'utilisateur avait déjà
 * rempli (nextAction, checkpointAt, history).
 */
/**
 * Migration Hizb : passage de "0.25 hizb par pression" à "1 verset par
 * pression, 6 versets max/jour". Ancienne unité (hizb) × 60 = versets.
 */
function migrateHizbToVersets(state) {
  if (!state || !Array.isArray(state.goals)) return state
  const g = state.goals.find((gg) => gg.id === 'goal_hizb')
  if (!g) return state
  if (g.unit === 'verset') return state  // déjà migré
  const oldEntries = g.entries || {}
  const nextEntries = {}
  for (const [d, v] of Object.entries(oldEntries)) {
    // v est en hizb (0.25 fois nombre de pressions) → × 60 = versets
    const versets = Math.round(Number(v) * 60)
    if (versets > 0) nextEntries[d] = versets
  }
  const currentTotal = Object.values(nextEntries).reduce((s, v) => s + (Number(v) || 0), 0)
  const goals = state.goals.map((gg) => (
    gg.id === 'goal_hizb'
      ? { ...gg, unit: 'verset', targetTotal: 1800, currentTotal, increment: 1, dailyMax: 6, versesPerHizb: 60, entries: nextEntries, subtitle: '6 versets max par jour — 30 hizb (~1 800 versets)' }
      : gg
  ))
  return { ...state, goals }
}

/** Ajoute linkedTaskIds vide sur toutes les habitudes (top-level et embarquées). */
function migrateLinkedTaskIds(state) {
  if (!state || !Array.isArray(state.goals)) return state
  let changed = false
  const goals = state.goals.map((g) => {
    let next = g
    if ((g.type === 'habit' || g.type === 'milestone') && !Array.isArray(g.linkedTaskIds)) {
      next = { ...next, linkedTaskIds: [] }; changed = true
    }
    if (g.habit && !Array.isArray(g.habit.linkedTaskIds)) {
      next = { ...next, habit: { ...next.habit, linkedTaskIds: [] } }; changed = true
    }
    return next
  })
  return changed ? { ...state, goals } : state
}

/** Ajoute les champs de la refonte tableau de bord aux states existants. */
function migrateToDashboard(state) {
  if (!state || !Array.isArray(state.goals)) return state
  const DEFAULTS = {
    goal_salat: { domain: 'spiritual', short: 'Prières',    symbol: '☪', target: 1, unit: 'jour' },
    goal_marti: { domain: 'personal',  short: 'Marti',      symbol: '❤' },
    goal_body:  { domain: 'body',      short: 'Corps',      symbol: '⚡' },
    goal_10k:   { domain: 'business',  short: 'Profit/mois', symbol: '◆' },
    goal_50k:   { domain: 'business',  short: 'CA 2026',    symbol: '◆' },
    goal_hizb:  { domain: 'spiritual', short: 'Hizb',       symbol: '☪', increment: 0.25 },
    goal_sante: { domain: 'body',      short: 'Santé',      symbol: '⚡' },
  }
  let changed = false
  const goals = state.goals.map((g) => {
    const patch = DEFAULTS[g.id]
    if (!patch) return g
    const next = { ...g }
    for (const [k, v] of Object.entries(patch)) {
      if (next[k] == null) { next[k] = v; changed = true }
    }
    // Injecte hb_seances sur santé si absent
    if (g.id === 'goal_sante' && !next.habit) {
      next.habit = {
        id: 'hb_seances', cadence: 'daily', unit: 'séance', target: 1,
        label: 'Séance physique', entries: {}, notes: {},
      }
      changed = true
    }
    return next
  })
  return changed ? { ...state, goals } : state
}

function migrateZawajToMarti(state) {
  if (!state || !Array.isArray(state.goals)) return state
  let changed = false
  const goals = state.goals.map((g) => {
    if (g?.id !== 'goal_zawaj' && g?.id !== 'goal_marti') return g
    if (g.id === 'goal_marti' && g.habit) return g   // déjà migré
    changed = true
    return {
      ...g,
      id: 'goal_marti',
      type: 'milestone',
      label: 'Marti',
      labelAr: 'مرتي',
      subtitle: 'نلقى المرا اللي غنتزوج بيها',
      state: g.state === 'done' ? 'done' : 'in_progress',
      private: true,
      habit: g.habit || {
        id: 'hb_marti',
        cadence: 'daily',
        unit: 'binary',
        target: 1,
        label: "Marti — une action aujourd'hui",
        remindAt: '18:00',
        note: 'free',
        entries: {},
        notes: {},
        linkedTaskId: null,
      },
    }
  })
  // Ajoute rm_marti dans les rappels s'il manque
  const reminders = Array.isArray(state.reminders) ? [...state.reminders] : []
  if (!reminders.some((r) => r?.id === 'rm_marti')) {
    reminders.push({
      id: 'rm_marti', at: '18:00', days: 'daily',
      condition: 'habit_undone:hb_marti',
      text: "Marti — une action aujourd'hui",
    })
    changed = true
  }
  return changed ? { ...state, goals, reminders } : state
}

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return buildSeed()
    const parsed = JSON.parse(raw)
    const base = (!parsed || parsed.version !== 1) ? { ...buildSeed(), ...parsed, version: 1 } : parsed
    return migrateLinkedTaskIds(migrateHizbToVersets(migrateToDashboard(migrateZawajToMarti(base))))
  } catch {
    return buildSeed()
  }
}

function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* silencieux */ }
}

// Store partagé : toutes les instances de useGoals (Layout/Sync, Planning,
// Objectifs) lisent et écrivent le MÊME état. Avant, chaque composant avait
// sa propre copie en useState, et chacune écrasait localStorage avec sa
// version périmée → la progression calculée par la sync disparaissait.
let current = null
const listeners = new Set()

function getState() {
  if (current === null) current = load()
  return current
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function setSharedState(updater) {
  const prev = getState()
  const next = typeof updater === 'function' ? updater(prev) : updater
  if (next === prev) return
  current = next
  save(next)
  listeners.forEach((fn) => fn())
}

export function useGoals() {
  const state = useSyncExternalStore(subscribe, getState, getState)
  const setState = setSharedState

  // -- Habit ---------------------------------------------------
  const setHabitEntry = useCallback((goalId, date, value) => {
    setState((s) => ({
      ...s,
      goals: s.goals.map((g) => {
        if (g.id !== goalId || g.type !== 'habit') return g
        const entries = { ...(g.entries || {}) }
        if (value == null || value === '' || Number(value) === 0) delete entries[date]
        else entries[date] = Number(value)
        // Cumulatif : recalcul du currentTotal
        let currentTotal = g.currentTotal
        if (g.cumulative) {
          currentTotal = Object.values(entries).reduce((sum, v) => sum + (Number(v) || 0), 0)
        }
        return { ...g, entries, currentTotal }
      }),
    }))
  }, [])

  const incrementHabit = useCallback((goalId, delta = 1) => {
    const d = todayKey()
    setState((s) => ({
      ...s,
      goals: s.goals.map((g) => {
        if (g.id !== goalId || g.type !== 'habit') return g
        const entries = { ...(g.entries || {}) }
        const next = Math.max(0, (Number(entries[d]) || 0) + delta)
        if (next === 0) delete entries[d]; else entries[d] = next
        let currentTotal = g.currentTotal
        if (g.cumulative) currentTotal = Object.values(entries).reduce((sum, v) => sum + (Number(v) || 0), 0)
        return { ...g, entries, currentTotal }
      }),
    }))
  }, [])

  // -- Milestone -----------------------------------------------
  const updateMilestone = useCallback((goalId, patch) => {
    setState((s) => ({
      ...s,
      goals: s.goals.map((g) => (g.id === goalId && g.type === 'milestone') ? { ...g, ...patch } : g),
    }))
  }, [])

  // Habit embarqué sur un milestone (ex. hb_marti sur goal_marti).
  const setEmbeddedHabitEntry = useCallback((goalId, date, value) => {
    setState((s) => ({
      ...s,
      goals: s.goals.map((g) => {
        if (g.id !== goalId || g.type !== 'milestone' || !g.habit) return g
        const entries = { ...(g.habit.entries || {}) }
        if (value == null || value === '' || Number(value) === 0) delete entries[date]
        else entries[date] = Number(value)
        return { ...g, habit: { ...g.habit, entries } }
      }),
    }))
  }, [])

  /**
   * Bascule un id de tâche Planning dans la liste `linkedTaskIds` d'un
   * objectif (top-level ou embedded).
   */
  const toggleLinkedTaskId = useCallback((goalId, taskId, embedded = false) => {
    setState((s) => ({
      ...s,
      goals: s.goals.map((g) => {
        if (g.id !== goalId) return g
        if (embedded) {
          if (!g.habit) return g
          const cur = g.habit.linkedTaskIds || []
          const nextIds = cur.includes(taskId) ? cur.filter((id) => id !== taskId) : [...cur, taskId]
          return { ...g, habit: { ...g.habit, linkedTaskIds: nextIds } }
        }
        const cur = g.linkedTaskIds || []
        const nextIds = cur.includes(taskId) ? cur.filter((id) => id !== taskId) : [...cur, taskId]
        return { ...g, linkedTaskIds: nextIds }
      }),
    }))
  }, [])

  const setHabitLinkedTask = useCallback((goalId, taskId) => {
    setState((s) => ({
      ...s,
      goals: s.goals.map((g) => (g.id === goalId ? { ...g, linkedTaskId: taskId } : g)),
    }))
  }, [])

  const setEmbeddedHabitLinkedTask = useCallback((goalId, taskId) => {
    setState((s) => ({
      ...s,
      goals: s.goals.map((g) => (
        g.id === goalId && g.habit ? { ...g, habit: { ...g.habit, linkedTaskId: taskId } } : g
      )),
    }))
  }, [])

  const setEmbeddedHabitNote = useCallback((goalId, date, text) => {
    setState((s) => ({
      ...s,
      goals: s.goals.map((g) => {
        if (g.id !== goalId || !g.habit) return g
        const notes = { ...(g.habit.notes || {}) }
        if (!text || !text.trim()) delete notes[date]
        else notes[date] = text
        return { ...g, habit: { ...g.habit, notes } }
      }),
    }))
  }, [])

  const addMilestoneHistory = useCallback((goalId, note) => {
    setState((s) => ({
      ...s,
      goals: s.goals.map((g) => {
        if (g.id !== goalId || g.type !== 'milestone') return g
        const history = [...(g.history || []), { date: todayKey(), note }]
        return { ...g, history }
      }),
    }))
  }, [])

  // -- Gates manuels -------------------------------------------
  const setGateManual = useCallback((goalId, gateId, open) => {
    setState((s) => ({
      ...s,
      goals: s.goals.map((g) => {
        if (g.id !== goalId) return g
        const gates = (g.gates || []).map((gt) => gt.id === gateId ? { ...gt, state: !!open } : gt)
        return { ...g, gates }
      }),
    }))
  }, [])

  // -- Congrats / advice ---------------------------------------
  const markCelebrated = useCallback((key) => {
    setState((s) => ({ ...s, celebrated: { ...(s.celebrated || {}), [key]: todayKey() } }))
  }, [])

  const setAdviceCache = useCallback((cache) => {
    setState((s) => ({ ...s, adviceCache: cache }))
  }, [])

  // -- Export sanitized (§critique : jamais de milestone) -----
  const exportSanitized = useCallback(() => {
    const clone = JSON.parse(JSON.stringify(state))
    clone.goals = clone.goals.filter((g) => g.type !== 'milestone')
    return clone
  }, [state])

  // -- Actions du dashboard -----------------------------------
  const performAction = useCallback((action, done) => {
    setState((s) => applyAction(s, action, done))
  }, [])

  const importJson = useCallback((data) => {
    if (!data || typeof data !== 'object') throw new Error('JSON invalide')
    // Sécurité : on refuse d'importer des milestones (données strictement locales)
    const goals = (data.goals || []).filter((g) => g.type !== 'milestone')
    setState((s) => ({
      ...s,
      ...data,
      goals: [
        ...s.goals.filter((g) => g.type === 'milestone'),  // on garde les milestones existants
        ...goals,
      ],
      version: 1,
    }))
  }, [])

  return {
    state,
    setState,
    setHabitEntry,
    incrementHabit,
    setEmbeddedHabitEntry,
    toggleLinkedTaskId,
    setHabitLinkedTask,
    setEmbeddedHabitLinkedTask,
    setEmbeddedHabitNote,
    updateMilestone,
    addMilestoneHistory,
    setGateManual,
    markCelebrated,
    setAdviceCache,
    performAction,
    exportSanitized,
    importJson,
  }
}

/** Est-ce que l'action a été faite aujourd'hui, à partir d'un state donné. */
export function isActionDoneToday(action, state) {
  if (!action || !Array.isArray(action.targets) || action.targets.length === 0) return false
  const today = todayKey()
  return action.targets.some((t) => {
    const g = state.goals.find((gg) => gg.id === t.goalId)
    if (!g) return false
    if (t.mode === 'toggle-daily') return (Number(g.entries?.[today]) || 0) >= (Number(g.target) || 1)
    if (t.mode === 'toggle-embedded') return (Number(g.habit?.entries?.[today]) || 0) >= (Number(g.habit?.target) || 1)
    if (t.mode === 'increment') {
      const cur = Number(g.entries?.[today]) || 0
      const cap = Number(t.maxPerDay || g.dailyMax) || Infinity
      return cur >= cap
    }
    return false
  })
}

/** Décompte agrégé de l'action pour aujourd'hui (utilisé par les pastilles à compteur). */
export function actionCountToday(action, state) {
  if (!action || !Array.isArray(action.targets) || action.targets.length === 0) return 0
  const today = todayKey()
  let count = 0
  for (const t of action.targets) {
    const g = state.goals.find((gg) => gg.id === t.goalId)
    if (!g) continue
    if (t.mode === 'increment') count = Math.max(count, Number(g.entries?.[today]) || 0)
  }
  return count
}
