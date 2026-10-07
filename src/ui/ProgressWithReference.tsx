interface Props {
  /** Avancement réel, 0..1 */
  ratio: number
  /** Où il faudrait être aujourd'hui, 0..1 */
  referenceRatio: number
  color: string
}

/**
 * La barre que l'ancienne app n'avait pas : le trait marque l'attendu à
 * date. Une barre seule ne dit rien — 40 % est bon en octobre pour un
 * objectif démarré en septembre, et catastrophique pour un objectif annuel.
 */
export function ProgressWithReference({ ratio, referenceRatio, color }: Props) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100
  const ref = Math.max(0, Math.min(1, referenceRatio)) * 100
  return (
    <div className="bar">
      <span className="fill" style={{ width: `${pct}%`, background: color }} />
      <span className="ref" style={{ left: `${ref}%` }}
            title={`Attendu à date : ${Math.round(ref)} %`} />
    </div>
  )
}
