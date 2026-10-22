import { ENVELOPES, TX_COLS } from './schema'

/**
 * Préfixe de note qui marque une dépense comme "prêt sur salaire du mois
 * suivant". Simple, sans schéma additionnel : la transaction est comptée
 * normalement dans le mois courant, mais listée à part comme "à rembourser
 * au prochain salaire".
 */
export const LOAN_PREFIX = '[PRÊT] '

/**
 * Préfixe qui marque une transaction du fond d'urgence comme un APPORT et
 * non une dépense.
 *
 * Le fond était jusqu'ici une pure formule — mois écoulés × allocation
 * mensuelle, moins les retraits. Rien ne permettait d'y verser une somme :
 * une prime, un virement d'épargne, un mois où l'on met plus de côté
 * restaient invisibles, et le total ne bougeait qu'au changement de mois.
 * Un apport est donc une transaction 'urgence' comptée en positif.
 */
export const DEPOSIT_PREFIX = '[APPORT] '

export function isDeposit(tx) {
  return typeof tx?.note === 'string' && tx.note.startsWith(DEPOSIT_PREFIX)
}

export function depositNote(userNote) {
  const clean = (userNote || '').trim()
  return `${DEPOSIT_PREFIX}${clean}`.trim()
}

/** Le libellé sans son préfixe technique, pour l'affichage. */
export function cleanNote(note) {
  if (typeof note !== 'string') return ''
  return note.replace(DEPOSIT_PREFIX, '').replace(LOAN_PREFIX, '').trim()
}

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

/**
 * Jour du mois où tombe le salaire, et donc où le budget repart à zéro.
 *
 * Le mois budgétaire ne coïncide pas avec le mois du calendrier : il court
 * du 20 au 19. Une dépense du 25 octobre appartient à la période ouverte
 * par le salaire du 20 octobre, pas au mois d'octobre.
 *
 * Les mois courts décalent la borne : s'il n'existe pas de 20 dans le mois
 * visé (cas théorique ici, réel pour un jour ≥ 29), on prend le dernier
 * jour disponible.
 */
export const SALARY_DAY = 20

function clampToMonth(year, monthIndex, day) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  return new Date(year, monthIndex, Math.min(day, lastDay), 0, 0, 0, 0)
}

/** Début de la période budgétaire contenant `date` — le SALARY_DAY courant. */
export function startOfMonth(date = new Date()) {
  const d = new Date(date)
  const anchor = clampToMonth(d.getFullYear(), d.getMonth(), SALARY_DAY)
  // Avant le 20, on est encore dans la période ouverte le mois précédent.
  if (d < anchor) return clampToMonth(d.getFullYear(), d.getMonth() - 1, SALARY_DAY)
  return anchor
}

/** Début de la période budgétaire suivante. */
export function startOfNextMonth(date = new Date()) {
  const start = startOfMonth(date)
  return clampToMonth(start.getFullYear(), start.getMonth() + 1, SALARY_DAY)
}

/** Le mois civil que cette période couvre pour l'essentiel, pour l'étiqueter. */
export function periodLabel(date = new Date()) {
  const start = startOfMonth(date)
  return new Date(start.getFullYear(), start.getMonth(), 1)
}

/** Nombre de périodes entre `start` et `date`, bornes incluses. */
export function monthsBetweenInclusive(start, date = new Date()) {
  const s = startOfMonth(start)
  const d = startOfMonth(date)
  const months =
    (d.getFullYear() - s.getFullYear()) * 12 + (d.getMonth() - s.getMonth()) + 1
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

  let totalDeposited = 0
  let totalSpent = 0
  for (const tx of allUrgenceTransactions) {
    const amount = Number(tx.amount || 0)
    if (isDeposit(tx)) totalDeposited += amount
    else totalSpent += amount
  }

  const cumulated = Math.max(0, totalAllocated + totalDeposited - totalSpent)
  const percent = goal > 0 ? Math.min(100, (cumulated / goal) * 100) : 0

  let monthsRemaining = null
  if (goal > 0 && cumulated < goal && monthlyAllocation > 0) {
    monthsRemaining = Math.ceil((goal - cumulated) / monthlyAllocation)
  } else if (cumulated >= goal) {
    monthsRemaining = 0
  }

  return {
    cumulated, goal, percent, monthsRemaining, monthlyAllocation,
    totalAllocated, totalDeposited, totalSpent,
  }
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
    const cursor = clampToMonth(start.getFullYear(), start.getMonth() + m - 1, SALARY_DAY)
    const nextCursor = clampToMonth(start.getFullYear(), start.getMonth() + m, SALARY_DAY)
    const allocatedSoFar = m * monthlyAllocation
    let depositedSoFar = 0
    let spentSoFar = 0
    for (const tx of allUrgenceTransactions) {
      if (new Date(tx[TX_COLS.occurredAt]) >= nextCursor) continue
      const amount = Number(tx.amount || 0)
      if (isDeposit(tx)) depositedSoFar += amount
      else spentSoFar += amount
    }
    history.push({
      month: cursor,
      cumulated: Math.max(0, allocatedSoFar + depositedSoFar - spentSoFar),
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
    const anchor = startOfMonth(now)
    months.push(clampToMonth(anchor.getFullYear(), anchor.getMonth() - i, SALARY_DAY))
  }

  return months.map((monthStart) => {
    const nextMonthStart = clampToMonth(monthStart.getFullYear(), monthStart.getMonth() + 1, SALARY_DAY)
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
