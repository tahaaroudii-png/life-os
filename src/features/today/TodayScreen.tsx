import { useMemo, useState } from 'react'
import { todayKey, formatLong, formatTime } from '@/lib/date'
import { useAxes } from '@/data/useAxes'
import { useTasks } from '@/data/useTasks'
import { useTaskLogs } from '@/data/useTaskLogs'
import { useStreaks } from '@/data/useGoals'
import { useDayState } from '@/data/useDayState'
import { useAdvice, useTodayFocus } from '@/data/useInsights'
import { isExpectedOn } from '@/domain/cadence'
import { Ring } from '@/ui/Ring'
import { CloseDayModal } from './CloseDayModal'
import type { Task, TaskLog } from '@/db/types'
import type { LogStatus } from '@/domain/streak'

/** L'ordre dans lequel une touche fait tourner le statut d'une tâche. */
const NEXT: Record<string, LogStatus> = {
  pending: 'done', done: 'skipped', skipped: 'missed', missed: 'pending', postponed: 'done',
}
const GLYPH: Record<LogStatus, string> = {
  pending: '·', done: '✓', skipped: '↷', missed: '✕', postponed: '→',
}

export function TodayScreen({ userId }: { userId: string }) {
  const day = todayKey()
  const { data: axes = [] } = useAxes(userId)
  const { data: tasks = [] } = useTasks(userId)
  const { logs, setStatus } = useTaskLogs(userId, day, day)
  const { data: streaks = [] } = useStreaks(userId)
  const { data: focus = [] } = useTodayFocus(userId)
  const { data: advice } = useAdvice(userId)
  const { dayState } = useDayState(userId, day)
  const [closing, setClosing] = useState(false)

  const logByTask = useMemo(() => new Map(logs.map((l: TaskLog) => [l.task_id, l])), [logs])
  const streakByTask = useMemo(() => new Map(streaks.map((s) => [s.task_id, s])), [streaks])

  /**
   * Ce qui s'affiche aujourd'hui :
   *   · les cadences qui désignent ce jour ;
   *   · les hebdomadaires, tous les jours — c'est à toi de choisir quand ;
   *   · les ponctuelles seulement si une occurrence a été posée ce jour.
   */
  const todays = useMemo(() => tasks.filter((t: Task) => {
    if (t.start_date && t.start_date > day) return false
    if (t.end_date && t.end_date < day) return false
    if (t.cadence.type === 'once') return logByTask.has(t.id)
    if (t.cadence.type === 'weekly') return true
    return isExpectedOn(t.cadence, day)
  }), [tasks, day, logByTask])

  const byAxis = useMemo(() => axes.map((a) => ({
    axis: a,
    items: todays.filter((t) => t.axis_key === a.key).sort((x, y) => {
      if (!!x.scheduled_time !== !!y.scheduled_time) return x.scheduled_time ? -1 : 1
      if (x.scheduled_time && y.scheduled_time) return x.scheduled_time.localeCompare(y.scheduled_time)
      return x.created_at.localeCompare(y.created_at)
    }),
  })).filter((g) => g.items.length > 0), [axes, todays])

  const doneCount = todays.filter((t) => logByTask.get(t.id)?.status === 'done').length
  const openTasks = todays.filter((t) => (logByTask.get(t.id)?.status ?? 'pending') === 'pending')
  const closed = !!dayState?.closed_at

  function cycle(task: Task) {
    const current = logByTask.get(task.id)?.status ?? 'pending'
    setStatus.mutate({ task_id: task.id, log_date: day, status: NEXT[current] ?? 'done' })
  }

  return (
    <div className="app">
      <header className="screen-head">
        <h1>Aujourd’hui</h1>
        <span className="date">{formatLong(day)}</span>
      </header>

      {advice && (
        <div className={`advice rank-${advice.rank}`}>
          <span className="advice-kind">{adviceLabel(advice.kind)}</span>
          <p>{advice.body}</p>
        </div>
      )}

      {focus.length > 0 && (
        <section className="focus">
          <h3>Les trois qui comptent</h3>
          {focus.map((f) => (
            <div className="focus-row" key={f.task_id}>
              <span className="focus-rank">{f.rank}</span>
              <span className="focus-title">{f.title}</span>
              <span className="xs muted">{f.goal_label}</span>
            </div>
          ))}
        </section>
      )}

      <div className="rings">
        {byAxis.map(({ axis, items }) => {
          const done = items.filter((t) => logByTask.get(t.id)?.status === 'done').length
          return (
            <Ring key={axis.key} ratio={items.length ? done / items.length : 0}
                  color={axis.color} label={axis.label}
                  caption={`${axis.label} — ${done} sur ${items.length}`} />
          )
        })}
      </div>

      <p className="small muted" style={{ marginTop: 0 }}>
        {doneCount} sur {todays.length} fait{doneCount > 1 ? 's' : ''}.
        {closed && ' Journée close.'}
      </p>

      {byAxis.length === 0 && (
        <div className="empty">
          <p>Aucune tâche pour aujourd’hui.</p>
          <p className="small">Crée tes habitudes dans Plus → Tâches.</p>
        </div>
      )}

      {byAxis.map(({ axis, items }) => (
        <section className="axis-group" key={axis.key}>
          <header>
            <span className="axis-dot" style={{ background: axis.color }} />
            <h3>{axis.label}</h3>
          </header>
          {items.map((task) => {
            const status = (logByTask.get(task.id)?.status ?? 'pending') as LogStatus
            const streak = streakByTask.get(task.id)
            return (
              <div key={task.id} className={`task ${status === 'done' ? 'is-done' : ''}`}>
                <button className="check" data-status={status} onClick={() => cycle(task)}
                        aria-label={`${task.title} — ${status}`}>
                  {GLYPH[status]}
                </button>
                <div className="body">
                  <div className="title">{task.title_ar ?? task.title}</div>
                  <div className="meta">
                    {task.scheduled_time && <span>{formatTime(task.scheduled_time)}</span>}
                    {task.cadence.type === 'weekly' && <span>{task.cadence.times}×/semaine</span>}
                  </div>
                </div>
                {!!streak?.streak && (
                  <span className="streak">{streak.streak} {streak.streak_unit === 'semaines' ? 'sem' : 'j'}</span>
                )}
              </div>
            )
          })}
        </section>
      ))}

      {!closed && todays.length > 0 && (
        <button className="btn primary wide" onClick={() => setClosing(true)}>
          Clôturer la journée
        </button>
      )}

      {closing && (
        <CloseDayModal userId={userId} axes={axes} openTasks={openTasks}
                       logByTask={logByTask} onClose={() => setClosing(false)} />
      )}
    </div>
  )
}

function adviceLabel(kind: string): string {
  const m: Record<string, string> = {
    cash: 'Trésorerie', stock: 'Stock', goal_unreachable: 'À renégocier',
    goal_pace: 'Rythme', product: 'Produit', hifz: 'Révision', insight: 'Observation',
  }
  return m[kind] ?? 'Conseil'
}
