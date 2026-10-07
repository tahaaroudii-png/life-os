import { useState } from 'react'
import { useCloseDay } from '@/data/useRituals'
import { addDays, todayKey } from '@/lib/date'
import type { Axis, Task, TaskLog } from '@/db/types'

interface Props {
  userId: string
  axes: Axis[]
  openTasks: Task[]
  logByTask: Map<string, TaskLog>
  onClose: () => void
}

type Decision = 'missed' | 'skipped' | 'postponed'

/**
 * La clôture du soir.
 *
 * Elle force un arbitrage par tâche non faite — reportée, sautée, ou
 * ratée. C'est le point sur lequel l'ancien bilan s'arrêtait trop tôt :
 * il demandait une raison, pas une décision, et une tâche sans décision
 * reste ouverte pour toujours.
 *
 * Elle ne peut pas être annulée sans trancher : le bouton de sortie
 * existe, mais ce qui reste ouvert sera compté comme raté à minuit.
 */
export function CloseDayModal({ userId, axes, openTasks, logByTask, onClose }: Props) {
  const day = todayKey()
  const close = useCloseDay(userId)
  const [energy, setEnergy] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [minutes, setMinutes] = useState<Record<string, number>>({})

  const undecided = openTasks.filter((t) => !decisions[t.id])
  const canSubmit = energy !== null && undecided.length === 0

  function bumpMinutes(axisKey: string, delta: number) {
    setMinutes((m) => {
      const next = Math.max(0, (m[axisKey] ?? 0) + delta)
      return { ...m, [axisKey]: next }
    })
  }

  async function submit() {
    const payload: Record<string, string> = {}
    for (const [taskId, d] of Object.entries(decisions)) {
      payload[taskId] = d === 'postponed' ? `postponed:${addDays(day, 1)}` : d
    }
    await close.mutateAsync({
      day,
      energy,
      reason: reason.trim() || null,
      minutes,
      decisions: payload,
    })
    onClose()
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Clôture de la journée">
      <div className="sheet">
        <header className="sheet-head">
          <h2>Clôture de la journée</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">✕</button>
        </header>

        <section className="sheet-section">
          <h3>Ton énergie aujourd’hui</h3>
          <div className="scale">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={`scale-btn ${energy === n ? 'is-on' : ''}`}
                      onClick={() => setEnergy(n)} aria-pressed={energy === n}>
                {n}
              </button>
            ))}
          </div>
          <p className="xs muted">1 = vidé · 5 = en pleine forme. C’est la variable qui explique les trous partout ailleurs.</p>
        </section>

        <section className="sheet-section">
          <h3>Temps par axe</h3>
          <div className="minutes-grid">
            {axes.map((a) => (
              <div className="minutes-row" key={a.key}>
                <span className="axis-dot" style={{ background: a.color }} />
                <span className="minutes-label">{a.label}</span>
                <button className="icon-btn" onClick={() => bumpMinutes(a.key, -15)} aria-label={`Moins 15 minutes ${a.label}`}>−</button>
                <span className="minutes-value">{fmtMinutes(minutes[a.key] ?? 0)}</span>
                <button className="icon-btn" onClick={() => bumpMinutes(a.key, 15)} aria-label={`Plus 15 minutes ${a.label}`}>+</button>
              </div>
            ))}
          </div>
          <p className="xs muted">Par quarts d’heure, à la louche. Une estimation suffit.</p>
        </section>

        {openTasks.length > 0 && (
          <section className="sheet-section">
            <h3>{openTasks.length} tâche{openTasks.length > 1 ? 's' : ''} encore ouverte{openTasks.length > 1 ? 's' : ''}</h3>
            <p className="xs muted">Rien ne traverse la nuit sans décision.</p>
            {openTasks.map((t) => (
              <div className="arbitrate" key={t.id}>
                <span className="arbitrate-title">{t.title_ar ?? t.title}</span>
                <div className="arbitrate-choices">
                  {([['postponed', 'Demain'], ['skipped', 'Sauté'], ['missed', 'Raté']] as const).map(([d, label]) => (
                    <button key={d}
                            className={`chip ${decisions[t.id] === d ? 'is-on' : ''}`}
                            onClick={() => setDecisions((s) => ({ ...s, [t.id]: d }))}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {logByTask.size === 0 && null}
          </section>
        )}

        <section className="sheet-section">
          <h3>En une phrase</h3>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                    placeholder="Ce qui a bloqué, ou RAS."
                    className="field" />
        </section>

        <footer className="sheet-foot">
          {!canSubmit && (
            <p className="xs muted" style={{ margin: 0 }}>
              {energy === null ? 'Note ton énergie. ' : ''}
              {undecided.length > 0 ? `${undecided.length} tâche${undecided.length > 1 ? 's' : ''} à arbitrer.` : ''}
            </p>
          )}
          <button className="btn primary" disabled={!canSubmit || close.isPending} onClick={submit}>
            {close.isPending ? 'Enregistrement…' : 'Clôturer'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function fmtMinutes(m: number): string {
  if (m === 0) return '—'
  const h = Math.floor(m / 60)
  const r = m % 60
  return h > 0 ? `${h} h${r ? ` ${r}` : ''}` : `${r} min`
}
