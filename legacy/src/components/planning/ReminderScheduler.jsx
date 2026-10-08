import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useTasks } from '../../hooks/useTasks'
import { useTaskLogs } from '../../hooks/useTaskLogs'
import { useTaskReminders } from '../../hooks/useTaskReminders'
import { useDailyReview } from '../../hooks/useDailyReviews'
import { buildDayTasks, todayKey } from '../../lib/planning'
import DailyDebriefModal from './DailyDebriefModal'
import DebriefBanner from './DebriefBanner'

// Ouverture automatique du bilan à 21h30 heure locale.
const DEBRIEF_HOUR = 21
const DEBRIEF_MIN = 30
// Relance de la notif système toutes les 30 min tant que non fait, jusqu'à 23h59.
const NOTIF_REFIRE_MS = 30 * 60 * 1000
// Snooze de la modale = 15 min (pas de skip permanent).
const SNOOZE_MS = 15 * 60 * 1000

const skipKey = (date) => `budget-app.debrief-snooze.${date}`

function readSnoozeUntil(date) {
  const raw = localStorage.getItem(skipKey(date))
  if (!raw) return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}
function writeSnoozeUntil(date, until) {
  localStorage.setItem(skipKey(date), String(until))
}

/**
 * Orchestrateur des rappels + du bilan quotidien.
 * Monté une fois pour toute l'app dans Layout.
 *
 * Bilan du soir : "must" non-négociable.
 *   - À partir de 21h30, si des tâches restent non cochées et qu'aucun bilan
 *     n'existe encore pour aujourd'hui, la modale s'ouvre automatiquement.
 *   - Une notification système persistante est aussi tirée (requireInteraction
 *     là où supporté) et re-tirée toutes les 30 min tant qu'aucune réponse
 *     n'a été enregistrée.
 *   - Snooze = 15 min max (pas de "ne plus jamais me demander").
 *   - Une bannière rouge en haut de l'app rappelle que le bilan est à faire,
 *     tant qu'il n'est pas fait.
 */
export default function ReminderScheduler() {
  useTaskReminders()
  const { user } = useAuth()

  const [today, setToday] = useState(() => todayKey())
  useEffect(() => {
    const id = setInterval(() => {
      const t = todayKey()
      if (t !== today) setToday(t)
    }, 60_000)
    return () => clearInterval(id)
  }, [today])

  const { tasks } = useTasks()
  const { logs } = useTaskLogs(today, today)
  const { review, upsertReview } = useDailyReview(today)

  const [modalOpen, setModalOpen] = useState(false)
  const [snoozedUntil, setSnoozedUntil] = useState(() => readSnoozeUntil(todayKey()))
  const lastNotifFiredAt = useRef(0)

  const incompleteItems = useMemo(() => {
    const logsByTaskId = {}
    for (const l of logs) {
      const dk = String(l.log_date).slice(0, 10)
      if (dk === today) logsByTaskId[l.task_id] = l
    }
    const items = buildDayTasks(tasks, logsByTaskId, today)
    return items
      .filter((it) => !it.log?.done)
      .map((it) => ({ id: it.task.id, title: it.task.title, axis: it.task.axis }))
  }, [tasks, logs, today])

  const isPastDebriefHour = useMemo(() => {
    const now = new Date()
    return now.getHours() > DEBRIEF_HOUR
      || (now.getHours() === DEBRIEF_HOUR && now.getMinutes() >= DEBRIEF_MIN)
  }, [today, snoozedUntil, modalOpen])

  // Le bilan est "en attente" tant que :
  //   - l'heure est passée
  //   - il reste des tâches non cochées
  //   - aucun bilan n'a été enregistré en base
  const isDebriefPending = user && isPastDebriefHour && incompleteItems.length > 0 && !review

  // Ouverture auto de la modale (respect du snooze).
  useEffect(() => {
    if (!isDebriefPending) return
    if (modalOpen) return
    if (Date.now() < snoozedUntil) return
    setModalOpen(true)
  }, [isDebriefPending, modalOpen, snoozedUntil])

  // Notification système persistante — refire toutes les 30 min si nécessaire.
  useEffect(() => {
    if (!isDebriefPending) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return

    async function fireDebriefNotif() {
      try {
        const reg = await navigator.serviceWorker?.getRegistration?.()
        const title = '🌙 Bilan du soir à faire'
        const options = {
          body: `${incompleteItems.length} tâche${incompleteItems.length > 1 ? 's' : ''} non cochée${incompleteItems.length > 1 ? 's' : ''}. Deux minutes pour dire ce qui s'est passé.`,
          tag: `debrief-${today}`,
          renotify: true,
          requireInteraction: true, // La notif reste visible jusqu'au clic (Android/desktop).
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          data: { kind: 'debrief', date: today },
        }
        if (reg?.showNotification) {
          await reg.showNotification(title, options)
        } else {
          // eslint-disable-next-line no-new
          new Notification(title, options)
        }
        lastNotifFiredAt.current = Date.now()
      } catch (err) {
        console.warn('Notif bilan KO (non bloquant) :', err?.message || err)
      }
    }

    function maybeFire() {
      const now = Date.now()
      if (now < snoozedUntil) return
      if (now - lastNotifFiredAt.current < NOTIF_REFIRE_MS) return
      fireDebriefNotif()
    }

    maybeFire() // immédiat
    const id = setInterval(maybeFire, 60_000)
    return () => clearInterval(id)
  }, [isDebriefPending, today, incompleteItems.length, snoozedUntil])

  // Fermeture auto : si le bilan est sauvé OU s'il n'y a plus rien à cocher,
  // on ferme la notification système persistante du bilan.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isDebriefPending) return  // encore à faire → on laisse la notif
    async function closeDebriefNotif() {
      try {
        const reg = await navigator.serviceWorker?.getRegistration?.()
        if (!reg?.getNotifications) return
        const list = await reg.getNotifications({ tag: `debrief-${today}` })
        for (const n of list) n.close()
      } catch { /* silencieux */ }
    }
    closeDebriefNotif()
  }, [isDebriefPending, today])

  async function handleSave(reason) {
    try {
      await upsertReview.mutateAsync({
        reason,
        incompleteCount: incompleteItems.length,
        totalCount: buildDayTasks(tasks, {}, today).length,
      })
      setModalOpen(false)
    } catch (err) {
      console.warn('Bilan non persisté :', err?.message || err)
      // Fallback silencieux : localStorage snooze court pour éviter la re-relance
      // immédiate. La table n'existe probablement pas encore.
      const until = Date.now() + SNOOZE_MS
      writeSnoozeUntil(today, until)
      setSnoozedUntil(until)
      setModalOpen(false)
    }
  }

  function handleSnooze() {
    const until = Date.now() + SNOOZE_MS
    writeSnoozeUntil(today, until)
    setSnoozedUntil(until)
    setModalOpen(false)
  }

  function handleOpenFromBanner() {
    // Depuis la bannière : force l'ouverture même si snoozé.
    setModalOpen(true)
  }

  return (
    <>
      {isDebriefPending && !modalOpen && (
        <DebriefBanner
          count={incompleteItems.length}
          onOpen={handleOpenFromBanner}
        />
      )}
      <DailyDebriefModal
        open={modalOpen}
        dateKey={today}
        incompleteItems={incompleteItems}
        existingReason={review?.reason || ''}
        onSave={handleSave}
        onSnooze={handleSnooze}
      />
    </>
  )
}
