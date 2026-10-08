import { useState } from 'react'
import { formatDH, formatPercent } from '../lib/format'
import { progressColor } from '../lib/budget'

/**
 * Carte enveloppe avec jauge circulaire.
 *
 * Trois faces d'un même chiffre :
 *   - au centre du cercle : gros % (consommé par défaut ; "restant" quand
 *     on tape la carte, pour voir l'autre face du budget instantanément),
 *   - sous le cercle : "Dépensé XX DH / Alloué YY DH",
 *   - encore en dessous, avec accent visuel : "Restant ZZ DH".
 *
 * La couleur du trait suit `progressColor(ratio)` : vert < 80 %, orange
 * 80–100 %, rouge à partir de 100 %.
 */
const RING_COLORS = {
  green:  '#16a34a',
  orange: '#ea580c',
  red:    '#dc2626',
}

const SIZE_DEFAULT = 148
const STROKE_DEFAULT = 14

export default function BudgetRing({ label, allocated, spent, remaining, ratio, size = SIZE_DEFAULT, stroke = STROKE_DEFAULT }) {
  const [showRemaining, setShowRemaining] = useState(false)
  const tone = progressColor(ratio)
  const color = RING_COLORS[tone]

  // Le remplissage plafonne à 100 % (esthétique) même si le ratio dépasse ;
  // le pourcentage textuel, lui, montre la vraie valeur (peut afficher 137 %).
  const filled = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 1))
  const percentSpent = Number.isFinite(ratio) ? Math.round(ratio * 100) : 100
  const percentRemaining = Math.max(0, 100 - percentSpent)

  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - filled)

  const displayed = showRemaining
    ? { big: percentRemaining, small: 'restant' }
    : { big: percentSpent, small: 'consommé' }

  return (
    <button
      type="button"
      className={`budget-ring budget-ring--${tone}`}
      style={{ '--ring-color': color }}
      onClick={() => setShowRemaining((v) => !v)}
      aria-label={`Enveloppe ${label} — tap pour basculer consommé/restant`}
    >
      <div className="budget-ring__label">{label}</div>

      <div className="budget-ring__svg-wrap" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="currentColor"
            strokeOpacity="0.13"
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="currentColor"
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease' }}
          />
        </svg>
        <div className="budget-ring__center">
          <div className="budget-ring__pct">
            {displayed.big}<span>%</span>
          </div>
          <div className="budget-ring__pct-caption">{displayed.small}</div>
        </div>
      </div>

      <div className="budget-ring__amounts">
        <div className="budget-ring__row">
          <span className="budget-ring__row-label">Dépensé</span>
          <strong className="budget-ring__row-val">{formatDH(spent)}</strong>
        </div>
        <div className="budget-ring__row">
          <span className="budget-ring__row-label">Alloué</span>
          <strong className="budget-ring__row-val">{formatDH(allocated)}</strong>
        </div>
        <div className={`budget-ring__row budget-ring__row--remaining ${remaining < 0 ? 'budget-ring__row--negative' : ''}`}>
          <span className="budget-ring__row-label">Restant</span>
          <strong className="budget-ring__row-val">{formatDH(remaining)}</strong>
        </div>
      </div>

      {ratio >= 1 && (
        <div className="budget-ring__flag">
          Dépassé de {formatPercent((ratio - 1) * 100)}
        </div>
      )}
    </button>
  )
}
