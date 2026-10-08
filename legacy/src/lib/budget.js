import { ENVELOPES, TX_COLS } from './schema'

/**
 * Préfixe de note qui marque une dépense comme "prêt sur salaire du mois
 * suivant". Simple, sans schéma additionnel : la transaction est comptée
 * normalement dans le mois courant, mais listée à part comme "à rembourser
 * au prochain salaire".
 */
export const LOAN_PREFIX = '[PRÊT] '

export function isLoan(tx) {
  return typeof tx?.note === 'string' && tx.note.startsWith(LOAN_PREFIX)
}

export function loanNote(userNote) {
  const clean = (userNote || '').trim()
  return `${LOAN_PREFIX}${clean}`.trim()
}

/** Total des prêts sur le mois courant (ou une période) — en DH. */
export function totalLoans(transactions, from, to) {
  return transactions.reduce((sum, tx) => {
    if (!isLoan(tx)) return sum
    const t = new Date(tx[TX_COLS.occurredAt])
    if (from && t < from) return sum
    if (to && t >= to) return sum
    return sum + (Number(tx.amount) || 0)
  }, 0)
}

/** Début (1er jour, 00:00 local) du mois contenant `date`. */
export function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
}

/** Début du mois suivant celui de `date`. */
export function startOfNextMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0)
}

/** Nombre de mois entre `start` (1er du mois) et `date` (1er du mois), bornes incluses. */
export function monthsBetweenInclusive(start, date = new Date()) {
  const s = new Date(start)
  const months =
    (date.getFullYear() - s.getFullYear()) * 12 + (date.getMonth() - s.getMonth()) + 1
  return Math.max(1, months)
}

/** Montant alloué à une enveloppe pour un mois, selon les settings courants. */
export function allocationFor(settings, envelopeKey) {
  if (!settings) return 0
  const env = ENVELOPES.find((e) => e.key === envelopeKey)
  if (!env) return 0
  const income = Number(settings.monthly_income) || 0
  const pct = Number(settings[env.pctField]) || 0
  return (income * pct) / 100
}

/**
 * Calcule, pour les 3 enveloppes qui repartent à zéro chaque mois, l'état
 * (alloué / dépensé / restant) sur le mois en cours à partir de la liste de
 * transactions du mois (déjà filtrée côté appelant, ou filtrée ici via `now`).
 */
export function computeMonthlyEnvelopeStates(settings, transactions, now = new Date()) {
  const monthStart = startOfMonth(now)
  const nextMonthStart = startOfNextMonth(now)

  const spentByEnvelope = {}
  for (const tx of transactions) {
    const d = new Date(tx[TX_COLS.occurredAt])
    if (d >= monthStart && d < nextMonthStart) {
      spentByEnvelope[tx.envelope] = (spentByEnvelope[tx.envelope] || 0) + Number(tx.amount || 0)
    }
  }

  return ENVELOPES.filter((e) => e.resets).map((e) => {
    const allocated = allocationFor(settings, e.key)
    const spent = spentByEnvelope[e.key] || 0
    return {
      key: e.key,
      label: e.label,
      allocated,
      spent,
      remaining: allocated - spent,
      ratio: allocated > 0 ? spent / allocated : spent > 0 ? Infinity : 0,
    }
  })
}

/**
 * Fond d'urgence : cumule depuis `settings.start_month` (allocation mensuelle
 * pct_urgence % du revenu, chaque mois écoulé depuis le début) moins toutes les
 * dépenses taguées 'urgence' (tout l'historique, puisque ça ne repart jamais à zéro).
 */
export function computeEmergencyFundState(settings, allUrgenceTransactions, now = new Date()) {
  if (!settings) {
    return { cumulated: 0, goal: 0, percent: 0, monthsRemaining: null, monthlyAllocation: 0 }
  }
  const goal = Number(settings.emergency_goal) || 0
  const monthlyAllocation = allocationFor(settings, 'urgence')
  const start = settings.start_month ? new Date(settings.start_month) : startOfMonth(now)

  const monthsElapsed = monthsBetweenInclusive(start, now)
  const totalAllocated = monthsElapsed * monthlyAllocation
  const totalSpent = allUrgenceTransactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0)

  const cumulated = Math.max(0, totalAllocated - totalSpent)
  const percent = goal > 0 ? Math.min(100, (cumulated / goal) * 100) : 0

  let monthsRemaining = null
  if (goal > 0 && cumulated < goal && monthlyAllocation > 0) {
    monthsRemaining = Math.ceil((goal - cumulated) / monthlyAllocation)
  } else if (cumulated >= goal) {
    monthsRemaining = 0
  }

  return { cumulated, goal, percent, monthsRemaining, monthlyAllocation }
}

/**
 * Historique mois par mois du cumul du fond d'urgence, pour la courbe de progression.
 * Simplification assumée : le % d'allocation courant s'applique aussi rétroactivement
 * (settings n'a pas d'historique de versions).
 */
export function computeEmergencyFundHistory(settings, allUrgenceTransactions, monthsToShow = 12, now = new Date()) {
  if (!settings) return []
  const start = settings.start_month ? new Date(settings.start_month) : startOfMonth(now)
  const monthlyAllocation = allocationFor(settings, 'urgence')
  const totalMonths = monthsBetweenInclusive(start, now)
  const firstShown = Math.max(1, totalMonths - monthsToShow + 1)

  const history = []
  for (let m = firstShown; m <= totalMonths; m++) {
    const cursor = new Date(start.getFullYear(), start.getMonth() + m - 1, 1)
    const nextCursor = new Date(start.getFullYear(), start.getMonth() + m, 1)
    const allocatedSoFar = m * monthlyAllocation
    const spentSoFar = allUrgenceTransactions
      .filter((tx) => new Date(tx[TX_COLS.occurredAt]) < nextCursor)
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0)
    history.push({
      month: cursor,
      cumulated: Math.max(0, allocatedSoFar - spentSoFar),
    })
  }
  return history
}

/**
 * Série mensuelle des dépenses par enveloppe sur les `monthsToShow` derniers mois
 * (le mois en cours inclus), pour les graphiques de tendance / budget vs réel.
 */
export function computeMonthlySeries(transactions, monthsToShow = 6, now = new Date()) {
  const months = []
  for (let i = monthsToShow - 1; i >= 0; i--) {
    months.push(new Date(now.getFullYear(), now.getMonth() - i, 1))
  }

  return months.map((monthStart) => {
    const nextMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
    const byEnvelope = Object.fromEntries(ENVELOPES.map((e) => [e.key, 0]))
    let total = 0
    for (const tx of transactions) {
      const d = new Date(tx[TX_COLS.occurredAt])
      if (d >= monthStart && d < nextMonthStart) {
        byEnvelope[tx.envelope] = (byEnvelope[tx.envelope] || 0) + Number(tx.amount || 0)
        total += Number(tx.amount || 0)
      }
    }
    return { month: monthStart, byEnvelope, total }
  })
}

/** Progression 0..100+ pour la barre : vert < 80%, orange 80-100%, rouge >= 100%. */
export function progressColor(ratio) {
  if (!Number.isFinite(ratio)) return 'red'
  if (ratio >= 1) return 'red'
  if (ratio >= 0.8) return 'orange'
  return 'green'
}
