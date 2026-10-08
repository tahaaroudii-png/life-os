import { formatDH, formatPercent } from '../lib/format'
import { progressColor } from '../lib/budget'

export default function EnvelopeCard({ label, allocated, spent, remaining, ratio }) {
  const pct = Math.min(100, Number.isFinite(ratio) ? ratio * 100 : 100)
  const color = progressColor(ratio)

  return (
    <div className={`envelope-card envelope-card--${color}`}>
      <div className="envelope-card__header">
        <span className="envelope-card__label">{label}</span>
        <span className={`envelope-card__pct envelope-card__pct--${color}`}>
          {formatPercent(ratio * 100)}
        </span>
      </div>

      <div className="envelope-card__bar-track">
        <div
          className={`envelope-card__bar-fill envelope-card__bar-fill--${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="envelope-card__figures">
        <div>
          <span className="muted">Alloué</span>
          <strong>{formatDH(allocated)}</strong>
        </div>
        <div>
          <span className="muted">Dépensé</span>
          <strong>{formatDH(spent)}</strong>
        </div>
        <div>
          <span className="muted">Restant</span>
          <strong className={remaining < 0 ? 'text-red' : ''}>{formatDH(remaining)}</strong>
        </div>
      </div>
    </div>
  )
}
