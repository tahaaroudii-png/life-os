interface RingProps {
  ratio: number          // 0..1
  color: string
  label: string
  size?: number
  caption?: string
}

/** L'anneau de complétion d'un axe. Lisible d'un coup d'œil, c'est tout. */
export function Ring({ ratio, color, label, size = 44, caption }: RingProps) {
  const r = (size - 6) / 2
  const c = 2 * Math.PI * r
  const filled = Math.max(0, Math.min(1, ratio))
  return (
    <div className="ring" title={caption ?? label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} ${Math.round(filled * 100)} %`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke="var(--surface-2)" strokeWidth="4" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={color} strokeWidth="4" strokeLinecap="round"
                strokeDasharray={`${c * filled} ${c}`}
                transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
              fontSize="11" fill="var(--text-2)">
          {Math.round(filled * 100)}
        </text>
      </svg>
      <span className="label">{label}</span>
    </div>
  )
}
