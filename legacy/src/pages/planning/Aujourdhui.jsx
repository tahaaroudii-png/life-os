import { useEffect, useMemo, useState } from 'react'
import { useTasks } from '../../hooks/useTasks'
import { useTaskLogs } from '../../hooks/useTaskLogs'
import {
  addDays,
  buildDayTasks,
  groupByAxis,
  splitScheduledUnscheduled,
  completionRate,
  streakForTask,
  todayKey,
  AXIS_BY_KEY,
} from '../../lib/planning'
import { formatDateFR } from '../../lib/format'
import TaskLine from '../../components/planning/TaskLine'
import QuickAddTaskModal from '../../components/planning/QuickAddTaskModal'
import AxisRing from '../../components/planning/AxisRing'
import StreakBoard from '../../components/planning/StreakBoard'
import PostponeSheet from '../../components/planning/PostponeSheet'
import TimeEditSheet from '../../components/planning/TimeEditSheet'
import GoalsStrip from '../../components/planning/GoalsStrip'

// Fenêtre de fetch pour calculer les streaks (120 j en arrière) — largement
// de quoi calculer les paliers Or / Diamant sans requête supplémentaire.
const STREAK_WINDOW_DAYS = 120
// Fenêtre "à venir" : on remonte 30 jours en avant pour l'aperçu des tâches
// planifiées à des dates futures (préview en bas de page).
const UPCOMING_WINDOW_DAYS = 30

export default function Aujourdhui() {
  // `today` doit RESTER SYNCHRO avec la vraie date locale — sinon un onglet
  // ouvert de nuit continue d'afficher les oneoffs d'hier après minuit.
  const [today, setToday] = useState(() => todayKey())
  useEffect(() => {
    const id = setInterval(() => {
      const t = todayKey()
      if (t !== today) setToday(t)
    }, 60_000)
    return () => clearInterval(id)
  }, [today])

  const { tasks, isLoading: tasksLoading, createTask, updateTask, deleteTask, backfillHabit } = useTasks()
  // On fetch une fenêtre large (streak passé + preview futur) pour couvrir
  // tous les besoins de la page en une seule requête.
  const fromKey = useMemo(() => addDays(today, -STREAK_WINDOW_DAYS), [today])
  const toKey = useMemo(() => addDays(today, UPCOMING_WINDOW_DAYS), [today])
  const { logs, isLoading: logsLoading, upsertLog, postponeLog } = useTaskLogs(fromKey, toKey)
  const [addOpen, setAddOpen] = useState(false)
  const [postponeItem, setPostponeItem] = useState(null)
  const [editTimeTask, setEditTimeTask] = useState(null)

  // Map des logs strictement d'aujourd'hui.
  const logsByTaskId = useMemo(() => {
    const map = {}
    for (const l of logs) {
      const logDateKey = String(l.log_date).slice(0, 10)
      if (logDateKey === today) map[l.task_id] = l
    }
    return map
  }, [logs, today])

  const dayItems = useMemo(
    () => buildDayTasks(tasks, logsByTaskId, today),
    [tasks, logsByTaskId, today]
  )

  const byAxis = useMemo(() => groupByAxis(dayItems), [dayItems])

  const rate = completionRate(dayItems)
  const doneCount = dayItems.filter((it) => it.log?.done).length
  const total = dayItems.length

  const habitStreaks = useMemo(() => {
    return tasks
      .filter((t) => t.active && (t.type === 'habit' || t.type === 'progressive'))
      .map((t) => ({ task: t, streak: streakForTask(t.id, logs, today) }))
      .sort((a, b) => b.streak - a.streak)
  }, [tasks, logs, today])

  // Aperçu "à venir" : logs de type oneoff dont log_date > today, dans les
  // 30 jours suivants, groupés par date.
  const upcoming = useMemo(() => {
    const items = []
    const maxKey = addDays(today, UPCOMING_WINDOW_DAYS)
    const tasksById = Object.fromEntries(tasks.map((t) => [t.id, t]))
    for (const l of logs) {
      const dk = String(l.log_date).slice(0, 10)
      if (dk <= today || dk > maxKey) continue
      const task = tasksById[l.task_id]
      if (!task || task.type !== 'oneoff') continue
      if (!task.active) continue
      items.push({ log: l, task, dateKey: dk })
    }
    items.sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    // Groupe par date
    const byDate = {}
    for (const it of items) {
      if (!byDate[it.dateKey]) byDate[it.dateKey] = []
      byDate[it.dateKey].push(it)
    }
    return byDate
  }, [logs, tasks, today])

  const upcomingDates = useMemo(() => Object.keys(upcoming).sort(), [upcoming])

  // Filtre par axe.
  const [selectedAxis, setSelectedAxis] = useState(null)
  const filteredItems = useMemo(() => {
    if (!selectedAxis) return dayItems
    return dayItems.filter((it) => it.task.axis === selectedAxis)
  }, [dayItems, selectedAxis])
  const filteredScheduled = useMemo(
    () => splitScheduledUnscheduled(filteredItems).scheduled,
    [filteredItems]
  )
  const filteredUnscheduled = useMemo(
    () => splitScheduledUnscheduled(filteredItems).unscheduled,
    [filteredItems]
  )

  async function handleToggle(vars) {
    try {
      await upsertLog.mutateAsync(vars)
    } catch (err) {
      console.error('Toggle KO :', err?.message || err)
    }
  }

  async function handleAddTask(payload) {
    const task = await createTask.mutateAsync({
      title: payload.title,
      axis: payload.axis,
      type: payload.type || 'habit',
      scheduled_time: payload.scheduled_time || null,
      start_value: payload.start_value ?? null,
      daily_increment: payload.daily_increment ?? null,
      start_date: payload.start_date ?? null,
    })
    if (payload.type === 'oneoff') {
      // Le log_date colle à la date choisie dans le modal (par défaut : today,
      // sinon la date future sélectionnée par l'utilisateur).
      const targetDate = payload.oneoff_date || today
      await upsertLog.mutateAsync({
        task_id: task.id,
        log_date: targetDate,
        done: false,
        target_value: null,
      })
    }
    if (payload.type === 'habit' && payload.seed_days > 0) {
      await backfillHabit.mutateAsync({ taskId: task.id, days: payload.seed_days })
    }
  }

  async function handleDeleteOneoff(taskId) {
    if (!window.confirm('Supprimer cette tâche ?')) return
    await deleteTask.mutateAsync(taskId)
  }

  async function handlePostponePick(pick) {
    // pick peut être {date, time} (nouveau) ou une string date (rétrocompat)
    const newDate = typeof pick === 'string' ? pick : pick?.date
    const newTime = typeof pick === 'object' ? pick?.time : null
    if (!postponeItem?.log || !newDate) {
      setPostponeItem(null)
      return
    }
    try {
      await postponeLog.mutateAsync({
        logId: postponeItem.log.id,
        newDate,
      })
      // Si une heure a été choisie et diffère, mets à jour la tâche
      if (newTime !== undefined && newTime !== postponeItem.task?.scheduled_time) {
        try { await updateTask.mutateAsync({ id: postponeItem.task.id, scheduled_time: newTime || null }) }
        catch { /* silencieux */ }
      }
    } catch (err) {
      window.alert(`Report impossible : ${err?.message || 'erreur inconnue'}`)
    } finally {
      setPostponeItem(null)
    }
  }

  if (tasksLoading || logsLoading) return <p className="muted">Chargement…</p>

  return (
    <div className="page-aujourdhui">
      <GoalsStrip />

      <header className="today-header">
        <div className="today-header__intro">
          <h1 className="today-header__title">Aujourd'hui</h1>
          <p className="today-header__date">{formatDateFR(new Date())}</p>
        </div>
        <div className="today-header__stats">
          <div className="today-header__pct">{Math.round(rate * 100)}<span>%</span></div>
          <div className="today-header__side">
            <div className="today-header__count">
              <strong>{doneCount}</strong> / {total} {total > 1 ? 'faites' : 'faite'}
            </div>
            <div className="today-header__bar" aria-hidden="true">
              <div className="today-header__bar-fill" style={{ width: `${Math.round(rate * 100)}%` }} />
            </div>
          </div>
        </div>
      </header>

      {total === 0 && (
        <div className="card">
          <p style={{ margin: 0 }}>
            Aucune tâche pour aujourd'hui. Crée d'abord tes habitudes dans{' '}
            <strong>Tâches</strong>, ou ajoute une tâche du jour avec le bouton{' '}
            <strong>+</strong>.
          </p>
        </div>
      )}

      <StreakBoard streaks={habitStreaks} />

      <div className="axis-rings">
        {byAxis.map(({ axis, items }) => {
          if (!items.length) return null
          const doneA = items.filter((it) => it.log?.done).length
          const isSelected = selectedAxis === axis.key
          const hasSelection = selectedAxis !== null
          return (
            <AxisRing
              key={axis.key}
              axis={axis}
              done={doneA}
              total={items.length}
              selected={isSelected}
              dimmed={hasSelection && !isSelected}
              onClick={() => setSelectedAxis((prev) => (prev === axis.key ? null : axis.key))}
            />
          )
        })}
      </div>

      {selectedAxis && (
        <div className="filter-bar">
          <span className="filter-bar__label">
            Filtré sur <strong>{byAxis.find((g) => g.axis.key === selectedAxis)?.axis.label}</strong> — {filteredItems.length} tâche{filteredItems.length > 1 ? 's' : ''}
          </span>
          <button type="button" className="btn-link" onClick={() => setSelectedAxis(null)}>
            Tout afficher
          </button>
        </div>
      )}

      {filteredScheduled.length > 0 && (
        <section className="task-list">
          {filteredScheduled.map((it) => (
            <TaskLine
              key={it.task.id}
              item={it}
              dateKey={today}
              onToggle={handleToggle}
              onDelete={it.task.type === 'oneoff' ? handleDeleteOneoff : undefined}
              onPostpone={it.task.type === 'oneoff' ? setPostponeItem : undefined}
              onEditTime={setEditTimeTask}
            />
          ))}
        </section>
      )}

      {filteredUnscheduled.length > 0 && (
        <section>
          {filteredScheduled.length > 0 && (
            <h2 className="section-divider">Sans heure</h2>
          )}
          <div className="task-list">
            {filteredUnscheduled.map((it) => (
              <TaskLine
                key={it.task.id}
                item={it}
                dateKey={today}
                onToggle={handleToggle}
                onDelete={it.task.type === 'oneoff' ? handleDeleteOneoff : undefined}
                onPostpone={it.task.type === 'oneoff' ? setPostponeItem : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {/* -------- Aperçu des tâches planifiées à des dates futures -------- */}
      {upcomingDates.length > 0 && (
        <section className="upcoming">
          <h2 className="upcoming__title">📅 À venir</h2>
          <p className="muted small" style={{ margin: '0 0 0.75rem' }}>
            Tâches planifiées pour les prochains jours. Tape le 📅 pour les reprogrammer.
          </p>
          <div className="upcoming__groups">
            {upcomingDates.map((dk) => (
              <div key={dk} className="upcoming__group">
                <h3 className="upcoming__date">{formatDateFR(dk)}</h3>
                <ul className="upcoming__list">
                  {upcoming[dk].map(({ task, log }) => {
                    const axis = AXIS_BY_KEY[task.axis]
                    return (
                      <li key={log.id} className="upcoming__item" style={{ '--axis-color': axis?.color }}>
                        <span className="upcoming__dot" style={{ background: axis?.color }} aria-hidden="true" />
                        <span className="upcoming__task-title">{task.title}</span>
                        <span className="upcoming__axis">{axis?.label}</span>
                        <button
                          type="button"
                          className="upcoming__act"
                          onClick={() => setPostponeItem({ task, log })}
                          aria-label="Reprogrammer"
                          title="Reprogrammer"
                        >
                          📅
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <QuickAddTaskModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={handleAddTask}
      />

      <PostponeSheet
        open={postponeItem !== null}
        currentDate={postponeItem?.log?.log_date}
        currentTime={postponeItem?.task?.scheduled_time}
        taskTitle={postponeItem?.task?.title}
        onPick={handlePostponePick}
        onClose={() => setPostponeItem(null)}
      />

      <TimeEditSheet
        open={editTimeTask !== null}
        task={editTimeTask}
        onSave={async (time) => {
          if (!editTimeTask) return
          try { await updateTask.mutateAsync({ id: editTimeTask.id, scheduled_time: time }) }
          catch { /* silencieux */ }
        }}
        onClose={() => setEditTimeTask(null)}
      />

      <button
        type="button"
        className="fab"
        aria-label="Ajouter une tâche"
        onClick={() => setAddOpen(true)}
      >
        +
      </button>
    </div>
  )
}
