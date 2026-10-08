import { useEffect, useMemo, useRef } from 'react'
import { useAuth } from './useAuth'
import { useTasks } from './useTasks'
import { useTaskLogs } from './useTaskLogs'
import { AXIS_BY_KEY, formatTimeHM, timeToMinutes, todayKey } from '../lib/planning'
import { useNotifPrefs } from './useNotifPrefs'

const FIRED_KEY = (date) => `budget-app.reminders-fired.${date}`

function loadFired(date) {
  try {
    const raw = localStorage.getItem(FIRED_KEY(date))
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr : [])
  } catch { return new Set() }
}
function saveFired(date, set) {
  try { localStorage.setItem(FIRED_KEY(date), JSON.stringify([...set])) } catch { /* silencieux */ }
}
function cleanupOldFiredKeys(currentDate) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (!k) continue
      if (!k.startsWith('budget-app.reminders-fired.')) continue
      const d = k.slice('budget-app.reminders-fired.'.length)
      if (d !== currentDate) localStorage.removeItem(k)
    }
  } catch { /* silencieux */ }
}

/**
 * Rappels locaux basés sur `scheduled_time` :
 *   - toutes les 30 s, on vérifie les tâches actives du jour,
 *   - si l'heure prévue est passée dans les 5 dernières minutes ET que l'axe
 *     est activé dans les préférences ET que la tâche n'est pas encore cochée,
 *     on tire une notification.
 *   - un rappel par (task, jour) — une clé `${task.id}-${date}` empêche les
 *     répétitions au cours des ticks suivants.
 *
 * Contrainte importante : ces notifs se déclenchent uniquement tant que l'app
 * tourne (onglet ouvert, ou PWA installée + processus vivant). Elles ne
 * remplacent pas une infra web push serveur.
 */
export function useTaskReminders() {
  const { user } = useAuth()
  const today = useMemo(() => todayKey(), [])
  const { tasks } = useTasks()
  const { logs } = useTaskLogs(today, today)
  const { prefs } = useNotifPrefs()

  // Set persistant à travers ticks + rechargements de page : quel (taskId,date)
  // a déjà notifié aujourd'hui. Vidé au changement de jour.
  const firedRef = useRef(loadFired(today))

  useEffect(() => {
    if (!user) return
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return

    async function fire(task) {
      const axis = AXIS_BY_KEY[task.axis]
      const title = `${axis?.icon || '🔔'} ${task.title}`
      const options = {
        body: task.scheduled_time
          ? `Prévu à ${formatTimeHM(task.scheduled_time)}${axis ? ` · ${axis.label}` : ''}`
          : axis?.label || '',
        tag: `task-${task.id}-${today}`, // remplace toute notif existante avec ce tag
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        renotify: false,
        data: { taskId: task.id, date: today },
      }
      try {
        const reg = await navigator.serviceWorker?.getRegistration?.()
        if (reg?.showNotification) {
          await reg.showNotification(title, options)
        } else {
          // eslint-disable-next-line no-new
          new Notification(title, options)
        }
      } catch (err) {
        console.warn('Notification KO (non bloquant) :', err?.message || err)
      }
    }

    function tick() {
      const now = new Date()
      const nowMin = now.getHours() * 60 + now.getMinutes()

      for (const t of tasks) {
        if (!t.active) continue
        if (!t.scheduled_time) continue
        if (!prefs[t.axis]) continue

        const taskMin = timeToMinutes(t.scheduled_time)
        // Fenêtre : de l'heure prévue jusqu'à +5 min. Évite les rappels prématurés
        // et rattrape un tick loupé (l'intervalle est de 30 s, on est safe).
        if (nowMin < taskMin || nowMin > taskMin + 5) continue

        // Déjà cochée aujourd'hui ? On ne dérange pas.
        const log = logs.find((l) => l.task_id === t.id && l.log_date === today)
        if (log?.done) continue

        const key = `${t.id}-${today}`
        if (firedRef.current.has(key)) continue
        firedRef.current.add(key)
        saveFired(today, firedRef.current)

        fire(t)
      }
    }

    tick() // check immédiat au montage
    const interval = setInterval(tick, 30_000)
    return () => clearInterval(interval)
  }, [user, tasks, logs, today, prefs])

  // Ménage nucléaire au montage : FERME toutes les notifs `task-*` et
  // `debrief-*` de TOUS les Service Workers enregistrés (pas seulement l'actif).
  // C'est ce qui manquait : les notifs anciennes viennent souvent d'un SW
  // périmé que `getRegistration()` seul n'atteint pas.
  useEffect(() => {
    if (!user) return
    if (typeof window === 'undefined') return
    cleanupOldFiredKeys(today)
    async function nukeAll() {
      try {
        const regs = (await navigator.serviceWorker?.getRegistrations?.()) || []
        for (const reg of regs) {
          if (!reg.getNotifications) continue
          const all = await reg.getNotifications()
          for (const n of all) {
            const tag = n.tag || ''
            if (tag.startsWith('task-') || tag.startsWith('debrief-')) n.close()
          }
        }
      } catch { /* silencieux */ }
    }
    nukeAll()
    // Refais un passage 2 secondes plus tard : parfois le SW n'a pas encore
    // exposé ses notifs au premier appel.
    const late = setTimeout(nukeAll, 2000)
    return () => clearTimeout(late)
  }, [user, today])

  // Refire le ménage quand la page redevient visible (retour d'onglet, resume)
  useEffect(() => {
    if (typeof document === 'undefined') return
    async function nuke() {
      try {
        const regs = (await navigator.serviceWorker?.getRegistrations?.()) || []
        for (const reg of regs) {
          if (!reg.getNotifications) continue
          const all = await reg.getNotifications()
          for (const n of all) {
            const tag = n.tag || ''
            if (tag.startsWith('task-') || tag.startsWith('debrief-')) n.close()
          }
        }
      } catch { /* silencieux */ }
    }
    function onVis() { if (document.visibilityState === 'visible') nuke() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Fermeture ciblée : quand un log passe à done, on ferme la notif du jour
  // sur tous les SWs.
  useEffect(() => {
    if (!user) return
    if (typeof window === 'undefined') return
    async function closeDone() {
      try {
        const regs = (await navigator.serviceWorker?.getRegistrations?.()) || []
        for (const l of logs) {
          if (!l.done) continue
          if (String(l.log_date).slice(0, 10) !== today) continue
          for (const reg of regs) {
            if (!reg.getNotifications) continue
            const list = await reg.getNotifications({ tag: `task-${l.task_id}-${today}` })
            for (const n of list) n.close()
          }
        }
      } catch { /* silencieux */ }
    }
    closeDone()
  }, [user, logs, today])
}
