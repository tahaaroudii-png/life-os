import { colorForProgress } from '../../lib/oncf'

/**
 * Jauge circulaire d'avancement. SVG pur, aucune dépendance.
 *
 * Trois usages typiques :
 *   - Sur une carte de modification : compact (52-60 px).
 *   - Dans le dashboard global : très visible (140-170 px).
 *   - `label` optionnel pour afficher un sous-titre en dessous
 *      (ex. "Avancement moyen", "Toutes actives").
 *
 * La couleur du trait suit `colorForProgress(pct)` — pas de prop couleur,
 * la sémantique est portée par la valeur elle-même.
 */
export default function ProgressRing({
  pct,
  size = 60,
  stroke = 8,
  showLabel = false,
  label,
  colorOverride,
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)))
  const color = colorOverride || colorForProgress(clamped)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - clamped / 100)

  // Taille de la police du pourcentage proportionnelle au diamètre.
  // Réglé pour rester lisible même à 52 px.
  const pctFont = Math.max(11, Math.round(size * 0.32))

  return (
    <div
      className={`progress-ring ${showLabel ? 'progress-ring--with-label' : ''}`}
      style={{ '--ring-color': color }}
    >
      <div className="progress-ring__svg-wrap" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="currentColor"
            strokeOpacity="0.15"
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
        <div className="progress-ring__center">
          <div className="progress-ring__pct" style={{ fontSize: pctFont }}>
            {clamped}<span>%</span>
          </div>
        </div>
      </div>
      {showLabel && label && <div className="progress-ring__label">{label}</div>}
    </div>
  )
}
