/**
 * La cadence d'une tâche — ce que l'ancienne app ne savait pas exprimer.
 *
 * Une habitude y était forcément quotidienne, donc « sport 4 fois par
 * semaine » était inexprimable et sa série structurellement fausse.
 * Les règles de cadence vivent ici et nulle part ailleurs ; la base les
 * applique de son côté (life.f_day_expected), et les deux doivent dire
 * la même chose — c'est ce que les tests vérifient.
 */
import { isoWeekday, startOfWeek, daysBetween, addDays, type DateKey } from '@/lib/date'

export type Cadence =
  | { type: 'daily' }
  | { type: 'weekly'; times: number }
  | { type: 'weekdays'; days: number[] }   // 1 = lundi … 7 = dimanche
  | { type: 'monthly'; day: number }
  | { type: 'once' }

/**
 * Ce jour-là, la tâche est-elle attendue ?
 *
 * `weekly` renvoie false : sa cible porte sur la semaine, pas sur le jour.
 * Une tâche « 3 fois par semaine » n'est en retard aucun jour précis — elle
 * l'est seulement si la semaine se termine en dessous de 3. C'est
 * `expectedCount` qui en tient compte.
 */
export function isExpectedOn(cadence: Cadence, key: DateKey): boolean {
  switch (cadence.type) {
    case 'daily':    return true
    case 'weekdays': return cadence.days.includes(isoWeekday(key))
    case 'monthly':  return Number(key.slice(8)) === cadence.day
    case 'weekly':   return false
    case 'once':     return false
  }
}

/** Combien d'occurrences la cadence attend sur [from, to], bornes incluses. */
export function expectedCount(cadence: Cadence, from: DateKey, to: DateKey): number {
  const days = daysBetween(from, to) + 1
  if (days <= 0) return 0

  if (cadence.type === 'weekly') {
    // Nombre de semaines ISO entamées, fois le nombre de fois visé.
    const firstWeek = startOfWeek(from)
    const lastWeek = startOfWeek(to)
    const weeks = daysBetween(firstWeek, lastWeek) / 7 + 1
    return weeks * cadence.times
  }
  if (cadence.type === 'once') return 0

  let n = 0
  for (let i = 0; i < days; i++) {
    if (isExpectedOn(cadence, addDays(from, i))) n++
  }
  return n
}

/** Libellé lisible, pour les listes de tâches et les réglages. */
export function describe(cadence: Cadence): string {
  switch (cadence.type) {
    case 'daily':    return 'chaque jour'
    case 'weekly':   return `${cadence.times} fois par semaine`
    case 'weekdays': return cadence.days.length === 5 && !cadence.days.includes(6) && !cadence.days.includes(7)
      ? 'en semaine'
      : cadence.days.map((d) => ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].at(d - 1)).join(', ')
    case 'monthly':  return `le ${cadence.day} de chaque mois`
    case 'once':     return 'une fois'
  }
}

/** Garde-fou de lecture : la base peut contenir n'importe quel jsonb. */
export function parseCadence(value: unknown): Cadence {
  const c = value as Partial<Cadence> & { type?: string }
  if (c?.type === 'weekly' && typeof (c as { times?: number }).times === 'number') {
    return { type: 'weekly', times: (c as { times: number }).times }
  }
  if (c?.type === 'weekdays' && Array.isArray((c as { days?: number[] }).days)) {
    return { type: 'weekdays', days: (c as { days: number[] }).days }
  }
  if (c?.type === 'monthly' && typeof (c as { day?: number }).day === 'number') {
    return { type: 'monthly', day: (c as { day: number }).day }
  }
  if (c?.type === 'once') return { type: 'once' }
  return { type: 'daily' }
}
