/**
 * Anneau de progression circulaire pour un axe : gros cercle avec la couleur
 * de l'axe qui se remplit selon le taux de complétion du jour, pourcentage
 * en gros au centre, nom de l'axe en dessous.
 *
 * SVG pur — aucune dépendance. L'anneau se dessine avec le trick classique
 * stroke-dasharray + stroke-dashoffset, rotation de -90° pour partir du haut.
 *
 * Taille par défaut (100 px) pensée pour rester très lisible sur mobile.
 * `size` et `stroke` sont exposés pour un usage éventuel plus compact.
 */
export default function AxisRing({ axis, done, total, size = 100, stroke = 10, onClick, selected = false, dimmed = false }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - pct / 100)

  const Tag = onClick ? 'button' : 'div'
  const clickProps = onClick ? { type: 'button', onClick, 'aria-pressed': selected } : {}

  return (
    <Tag
      className={`axis-ring ${selected ? 'axis-ring--selected' : ''} ${dimmed ? 'axis-ring--dimmed' : ''} ${onClick ? 'axis-ring--clickable' : ''}`}
      style={{ '--axis-color': axis.color }}
      {...clickProps}
    >
      <div className="axis-ring__svg-wrap" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
        >
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
            style={{ transition: 'stroke-dashoffset 0.4s ease' }}
          />
        </svg>
        <div className="axis-ring__center">
          <div className="axis-ring__pct">{pct}<span>%</span></div>
          <div className="axis-ring__count">{done}/{total}</div>
        </div>
      </div>
      <div className="axis-ring__label">
        <span className="axis-ring__icon" aria-hidden="true">{axis.icon}</span>
        <span className="axis-ring__name">{axis.label}</span>
      </div>
    </Tag>
  )
}
