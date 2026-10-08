// Formatage FR / devise DH (MAD).

const nf = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatDH(amount) {
  const n = Number(amount) || 0
  return `${nf.format(n)} DH`
}

export function formatPercent(value) {
  const n = Number(value) || 0
  return `${Math.round(n)} %`
}

export function formatDateFR(dateLike) {
  const d = new Date(dateLike)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatMonthLabel(year, month) {
  // month: 1-12
  const d = new Date(year, month - 1, 1)
  const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function monthKey(dateLike) {
  const d = new Date(dateLike)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
