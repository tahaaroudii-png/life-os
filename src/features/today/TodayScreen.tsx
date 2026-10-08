import { useMemo, useState } from 'react'
import { todayKey, formatLong, formatTime } from '@/lib/date'
import { useAxes } from '@/data/useAxes'
import { useTasks } from '@/data/useTasks'
import { useTaskLogs } from '@/data/useTaskLogs'
import { useStreaks } from '@/data/useGoals'
import { useDayState } from '@/data/useDayState'
import { useAdvice, useTodayFocus } from '@/data/useInsights'
import { isExpectedOn } from '@/domain/cadence'

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

  const doneCount = todays.filter((t) => logByTask.get(t.id)?.status === 'done').length
  const openTasks = todays.filter((t) => (logByTask.get(t.id)?.status ?? 'pending') === 'pending')
  const closed = !!dayState?.closed_at

  function cycle(task: Task) {
    const current = logByTask.get(task.id)?.status ?? 'pending'
    setStatus.mutate({ task_id: task.id, log_date: day, status: NEXT[current] ?? 'done' })
  }

  const axisByKey = useMemo(() => new Map(axes.map((a) => [a.key, a])), [axes])

  /* Un seul fil, trié par heure. Les tâches sans heure ferment la marche :
     elles n'ont pas de place dans l'horaire, elles se font quand ça vient. */
  const ordered = useMemo(() => [...todays].sort((x, y) => {
    if (!!x.scheduled_time !== !!y.scheduled_time) return x.scheduled_time ? -1 : 1
    if (x.scheduled_time && y.scheduled_time) return x.scheduled_time.localeCompare(y.scheduled_time)
    return x.title.localeCompare(y.title)
  }), [todays])

  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const nowLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  /* L'index devant lequel poser la ligne : la première tâche encore à venir. */
  const nowAt = ordered.findIndex((t) => t.scheduled_time && toMinutes(t.scheduled_time) > nowMin)

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

      <section className="daybar">
        <div className="daybar-top">
          <span className="daybar-count">{doneCount}<span> / {todays.length}</span></span>
          <span className="small muted">{closed ? 'Journée close' : `${openTasks.length} en attente`}</span>
        </div>
        <div className="daybar-track">
          {ordered.map((t) => {
            const st = logByTask.get(t.id)?.status ?? 'pending'
            const color = axisByKey.get(t.axis_key)?.color ?? 'var(--accent)'
            return <i key={t.id} className="daybar-seg" data-on={st === 'done' ? 1 : 0}
                      style={{ ['--seg' as string]: color }} />
          })}
        </div>
      </section>

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

      {ordered.length === 0 ? (
        <div className="empty">
          <p>Rien à l’horaire aujourd’hui.</p>
          <p className="small">Ajoute tes habitudes dans Plus → Tâches.</p>
        </div>
      ) : (
        <div className="timetable">
          {ordered.map((task, i) => {
            const status = (logByTask.get(task.id)?.status ?? 'pending') as LogStatus
            const streak = streakByTask.get(task.id)
            const axis = axisByKey.get(task.axis_key)
            const color = axis?.color ?? 'var(--text-3)'
            return (
              <div key={task.id}>
                {i === nowAt && (
                  <div className="tt-now" aria-hidden="true">
                    <span className="tt-now-time">{nowLabel}</span>
                    <span className="tt-now-rule" />
                  </div>
                )}
                <div className="tt-row" data-done={status === 'done' ? 1 : 0}
                     style={{ ['--axis' as string]: color }}>
                  <span className={`tt-time ${task.scheduled_time ? '' : 'is-unset'}`}>
                    {task.scheduled_time ? formatTime(task.scheduled_time) : '—'}
                  </span>
                  <span className="tt-axis" />
                  <div className="tt-main">
                    <button className="tt-check" data-status={status} onClick={() => cycle(task)}
                            aria-label={`${task.title} — ${status}`}>
                      {GLYPH[status]}
                    </button>
                    <div style={{ minWidth: 0 }}>
                      <div className="tt-title">{task.title_ar ?? task.title}</div>
                      <div className="tt-sub">
                        {axis?.label}
                        {task.cadence.type === 'weekly' && ` · ${task.cadence.times}×/semaine`}
                      </div>
                    </div>
                  </div>
                  {!!streak?.streak && (
                    <span className="tt-streak">
                      {streak.streak} {streak.streak_unit === 'semaines' ? 'sem' : 'j'}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

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

function toMinutes(t: string): number {
  const [h, m] = t.split(':')
  return Number(h) * 60 + Number(m)
}

function adviceLabel(kind: string): string {
  const m: Record<string, string> = {
    cash: 'Trésorerie', stock: 'Stock', goal_unreachable: 'À renégocier',
    goal_pace: 'Rythme', product: 'Produit', hifz: 'Révision', insight: 'Observation',
  }
  return m[kind] ?? 'Conseil'
}
