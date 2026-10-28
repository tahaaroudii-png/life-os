/**
 * L'analyse du budget : non pas montrer des données, mais répondre.
 *
 * Quatre questions, et rien d'autre :
 *   1. Quel est mon plancher — ce qui part chaque mois quoi qu'il arrive ?
 *   2. Combien me reste-t-il par jour jusqu'au prochain salaire ?
 *   3. Où part l'argent, et quels postes montent ?
 *   4. Combien ai-je perdu pour rien — amendes, frais, sommes égarées ?
 */

import { TX_COLS } from './schema'
import {
  spendValue, isDeposit, startOfMonth, startOfNextMonth,
  periodKey, formatPeriod, allocationFor,
} from './budget'
import { categoryOf, isLeak, NATURES } from './categories'

/** Les transactions d'une période budgétaire donnée (bornes 20 → 19). */
function inPeriod(transactions, start, end) {
  return transactions.filter((tx) => {
    const d = new Date(tx[TX_COLS.occurredAt])
    return d >= start && d < end
  })
}

/** Totaux par catégorie sur un lot de transactions, du plus gros au plus petit. */
export function byCategory(transactions, overrides) {
  const map = new Map()
  for (const tx of transactions) {
    // Un apport au fond d'urgence n'est pas une dépense : c'est de l'épargne.
    if (isDeposit(tx)) continue
    const cat = categoryOf(tx, overrides)
    const value = spendValue(tx)
    if (!map.has(cat.key)) map.set(cat.key, { ...cat, total: 0, count: 0, items: [] })
    const row = map.get(cat.key)
    row.total += value
    row.count += 1
    row.items.push(tx)
  }
  return [...map.values()].filter((r) => r.total !== 0).sort((a, b) => b.total - a.total)
}

/** Totaux par nature : fixe, variable, exceptionnel. */
export function byNature(rows) {
  const out = Object.keys(NATURES).map((key) => ({
    key, label: NATURES[key].label, help: NATURES[key].help, total: 0,
  }))
  for (const r of rows) {
    const slot = out.find((o) => o.key === r.nature)
    if (slot) slot.total += r.total
  }
  return out
}

/**
 * Le plancher : la moyenne du fixe sur les périodes RÉVOLUES.
 *
 * On exclut la période en cours, forcément incomplète — l'y inclure
 * ferait baisser le plancher le 21 du mois et le ferait remonter le 19,
 * c'est-à-dire mentirait précisément les jours où l'on s'y fie.
 */
export function computeFloor(transactions, overrides, now = new Date()) {
  const currentKey = periodKey(now)
  const buckets = new Map()
  for (const tx of transactions) {
    if (isDeposit(tx)) continue
    const key = periodKey(tx[TX_COLS.occurredAt])
    if (key === currentKey) continue
    const cat = categoryOf(tx, overrides)
    if (cat.nature !== 'fixe') continue
    buckets.set(key, (buckets.get(key) || 0) + spendValue(tx))
  }
  const periods = [...buckets.values()]
  if (periods.length === 0) return { floor: 0, basedOn: 0 }
  const floor = periods.reduce((a, b) => a + b, 0) / periods.length
  return { floor, basedOn: periods.length }
}

/** Ce qui reste à dépenser par jour jusqu'au prochain salaire. */
export function computeDailyLeft(settings, transactions, now = new Date()) {
  const start = startOfMonth(now)
  const end = startOfNextMonth(now)
  // Les enveloppes qui repartent à zéro et qui servent à vivre.
  const keys = ['vie', 'divertissement']
  const budget = keys.reduce((s, k) => s + allocationFor(settings, k), 0)
  const spent = inPeriod(transactions, start, end)
    .filter((tx) => keys.includes(tx.envelope))
    .reduce((s, tx) => s + spendValue(tx), 0)

  const msPerDay = 86400000
  const daysLeft = Math.max(1, Math.ceil((end - now) / msPerDay))
  const daysTotal = Math.max(1, Math.round((end - start) / msPerDay))
  const remaining = budget - spent
  return {
    budget, spent, remaining, daysLeft, daysTotal,
    perDay: remaining / daysLeft,
    // Au rythme tenu jusqu'ici, où finit-on le 19 ?
    projected: daysTotal > 0 ? (spent / Math.max(1, daysTotal - daysLeft + 1)) * daysTotal : 0,
    periodLabel: formatPeriod(now),
  }
}

/** Ce que l'argent n'a pas acheté : amendes, frais, pertes. */
export function computeLeaks(transactions, overrides, now = new Date()) {
  const start = startOfMonth(now)
  const end = startOfNextMonth(now)
  let period = 0
  let total = 0
  const items = []
  for (const tx of transactions) {
    const cat = categoryOf(tx, overrides)
    if (!isLeak(cat)) continue
    const v = spendValue(tx)
    total += v
    const d = new Date(tx[TX_COLS.occurredAt])
    if (d >= start && d < end) period += v
    items.push({ tx, cat })
  }
  items.sort((a, b) => new Date(b.tx[TX_COLS.occurredAt]) - new Date(a.tx[TX_COLS.occurredAt]))
  return { period, total, items }
}

/**
 * Les postes de la période courante, comparés à la précédente.
 * C'est la comparaison qui informe : un montant seul ne dit pas s'il monte.
 */
export function comparePeriods(transactions, overrides, now = new Date()) {
  const start = startOfMonth(now)
  const end = startOfNextMonth(now)
  const prevEnd = start
  const prevStart = startOfMonth(new Date(start.getTime() - 1))

  const current = byCategory(inPeriod(transactions, start, end), overrides)
  const previous = byCategory(inPeriod(transactions, prevStart, prevEnd), overrides)
  const prevByKey = Object.fromEntries(previous.map((r) => [r.key, r.total]))

  const rows = current.map((r) => {
    const before = prevByKey[r.key]
    const delta = before === undefined ? null : r.total - before
    return {
      ...r,
      previous: before ?? null,
      delta,
      deltaPct: before ? (delta / before) * 100 : null,
    }
  })
  const totalCurrent = rows.reduce((s, r) => s + r.total, 0)
  const totalPrevious = previous.reduce((s, r) => s + r.total, 0)
  return {
    rows, totalCurrent, totalPrevious,
    currentLabel: formatPeriod(now),
    previousLabel: formatPeriod(prevStart),
    hasPrevious: previous.length > 0,
  }
}

/** Historique par catégorie sur les N dernières périodes, pour la tendance. */
export function categoryHistory(transactions, overrides, periodsToShow = 4, now = new Date()) {
  const periods = []
  let cursorEnd = startOfNextMonth(now)
  let cursorStart = startOfMonth(now)
  for (let i = 0; i < periodsToShow; i++) {
    periods.unshift({
      start: cursorStart,
      label: cursorStart.toLocaleDateString('fr-FR', { month: 'short' }),
      rows: byCategory(inPeriod(transactions, cursorStart, cursorEnd), overrides),
    })
    cursorEnd = cursorStart
    cursorStart = startOfMonth(new Date(cursorStart.getTime() - 1))
  }
  return periods.filter((p) => p.rows.length > 0)
}
