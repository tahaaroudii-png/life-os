import { useEffect, useMemo, useState } from 'react'

/**
 * Bandeau fin dans le très haut de l'app : temps restant avant le 31 décembre
 * de l'année en cours, en "N mois M jours", avec une barre de progression fine
 * de l'année écoulée.
 *
 * Rafraîchi toutes les 15 minutes — la valeur est au jour près, aucune
 * précipitation nécessaire. Assez tolérant pour rester correct après une nuit
 * de navigateur en veille.
 *
 * Deux seuils sémantiques :
 *   - < 30 j : ton "warn" (ambre)
 *   - < 7 j  : ton "crit" (rouge)
 * Sinon : ton neutre discret (ne dérange pas la lecture du reste).
 */
function monthsAndDaysUntil(target) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const end = new Date(target)
  end.setHours(0, 0, 0, 0)
  if (end <= now) return { months: 0, days: 0, totalDays: 0 }

  let months = 0
  const cursor = new Date(now)
  // On avance mois par mois tant qu'on ne dépasse pas la cible.
  // Robuste aux longueurs de mois variables (janvier=31, février=28/29…).
  while (true) {
    const next = new Date(cursor)
    next.setMonth(next.getMonth() + 1)
    if (next > end) break
    cursor.setTime(next.getTime())
    months++
  }
  const days = Math.round((end - cursor) / 86_400_000)
  const totalDays = Math.round((end - now) / 86_400_000)
  return { months, days, totalDays }
}

function yearProgress() {
  const now = new Date()
  const year = now.getFullYear()
  const start = new Date(year, 0, 1).getTime()
  const end = new Date(year + 1, 0, 1).getTime()
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)))
}

export default function YearCountdown() {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const { months, days, totalDays, year, progress, tone } = useMemo(() => {
    const y = new Date().getFullYear()
    const target = new Date(y, 11, 31)
    const { months: m, days: d, totalDays: total } = monthsAndDaysUntil(target)
    let t = 'ok'
    if (total <= 7) t = 'crit'
    else if (total <= 30) t = 'warn'
    return { months: m, days: d, totalDays: total, year: y, progress: yearProgress(), tone: t }
  }, [])

  // Formulaire naturel : "3 mois 24 jours", "0 mois 12 jours" → "12 jours".
  const label =
    totalDays === 0
      ? 'C\'est aujourd\'hui'
      : months === 0
        ? `${days} jour${days > 1 ? 's' : ''}`
        : `${months} mois ${days} jour${days > 1 ? 's' : ''}`

  return (
    <div className={`year-countdown year-countdown--${tone}`} role="status" aria-live="polite">
      <span className="year-countdown__icon" aria-hidden="true">⏳</span>
      <span className="year-countdown__label">
        Fin {year} · <strong>{label}</strong>
      </span>
      <div className="year-countdown__bar" aria-hidden="true">
        <div className="year-countdown__bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <span className="year-countdown__pct">{Math.round(progress * 100)} %</span>
    </div>
  )
}
