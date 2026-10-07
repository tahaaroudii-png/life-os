/** Les formats d'affichage, au même endroit. */

export function money(n: number, currency = 'USD'): string {
  const sign = n < 0 ? '−' : ''
  const abs = Math.abs(n)
  const body = abs >= 1000
    ? abs.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
    : abs.toFixed(abs < 10 ? 2 : 0)
  return `${sign}${body} ${currency === 'USD' ? '$' : currency === 'MAD' ? 'DH' : currency}`
}

export function pct(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)} %`
}

export function num(n: number, digits = 0): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: digits })
}
