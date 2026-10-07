import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAxes } from '@/data/useAxes'
import { useTasks } from '@/data/useTasks'
import { useStreaks } from '@/data/useGoals'
import { describe as describeCadence, type Cadence } from '@/domain/cadence'
import { qk } from '@/data/keys'

export function TasksScreen({ userId }: { userId: string }) {
  const { data: axes = [] } = useAxes(userId)
  const { data: tasks = [] } = useTasks(userId)
  const { data: streaks = [] } = useStreaks(userId)
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks')
        .update({ active: false, archived_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tasks(userId) }),
  })

  return (
    <div className="app">
      <header className="screen-head">
        <h1>Tâches</h1>
        <button className="btn" onClick={() => setAdding((v) => !v)}>{adding ? 'Annuler' : 'Nouvelle'}</button>
      </header>

      {adding && <NewTask userId={userId} axes={axes} onDone={() => setAdding(false)} />}

      {axes.map((a) => {
        const items = tasks.filter((t) => t.axis_key === a.key)
        if (items.length === 0) return null
        return (
          <section className="axis-group" key={a.key}>
            <header>
              <span className="axis-dot" style={{ background: a.color }} />
              <h3>{a.label}</h3>
            </header>
            {items.map((t) => {
              const s = streaks.find((x) => x.task_id === t.id)
              return (
                <div className="task" key={t.id}>
                  <div className="body">
                    <div className="title">{t.title_ar ?? t.title}</div>
                    <div className="meta">
                      <span>{describeCadence(t.cadence as Cadence)}</span>
                      {!!s?.streak && <span>{s.streak} {s.streak_unit}</span>}
                    </div>
                  </div>
                  <button className="btn compact" onClick={() => archive.mutate(t.id)}>Archiver</button>
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}

function NewTask({ userId, axes, onDone }: {
  userId: string
  axes: Array<{ key: string; label: string }>
  onDone: () => void
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [axisKey, setAxisKey] = useState(axes[0]?.key ?? '')
  const [kind, setKind] = useState<'daily' | 'weekly' | 'weekdays'>('daily')
  const [times, setTimes] = useState('4')
  const [time, setTime] = useState('')

  const create = useMutation({
    mutationFn: async () => {
      // La cadence est le champ qui rend « 4 fois par semaine » exprimable.
      const cadence: Cadence =
        kind === 'weekly' ? { type: 'weekly', times: Number(times) || 1 }
        : kind === 'weekdays' ? { type: 'weekdays', days: [1, 2, 3, 4, 5] }
        : { type: 'daily' }
      const { error } = await supabase.from('tasks').insert({
        user_id: userId, axis_key: axisKey, title: title.trim(),
        cadence, scheduled_time: time || null,
      })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.tasks(userId) }); onDone() },
  })

  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); if (title.trim()) create.mutate() }}>
      <input className="field" placeholder="Intitulé" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="row" style={{ marginTop: 8 }}>
        <select className="field" value={axisKey} onChange={(e) => setAxisKey(e.target.value)}>
          {axes.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
        </select>
        <select className="field" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="daily">Chaque jour</option>
          <option value="weekly">N fois par semaine</option>
          <option value="weekdays">En semaine</option>
        </select>
      </div>
      {kind === 'weekly' && (
        <input className="field" style={{ marginTop: 8 }} inputMode="numeric"
               value={times} onChange={(e) => setTimes(e.target.value)} placeholder="Combien de fois" />
      )}
      <input className="field" style={{ marginTop: 8 }} type="time" value={time}
             onChange={(e) => setTime(e.target.value)} />
      <button className="btn primary wide" style={{ marginTop: 12 }} disabled={!title.trim() || create.isPending}>
        Créer
      </button>
    </form>
  )
}
