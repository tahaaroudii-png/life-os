/**
 * Les séries.
 *
 * Trois règles, qui n'existent nulle part ailleurs dans le code :
 *   · `missed` casse la série ; `skipped` la traverse sans l'allonger ;
 *   · le jour en cours ne casse rien tant qu'il n'est pas clos — si
 *     aujourd'hui n'est pas fait, le décompte démarre à hier ;
 *   · au-delà d'un `skipped` par semaine, le deuxième compte comme un raté.
 *     Sans ce garde-fou, le mode « sauter » devient une porte de sortie
 *     permanente et la série ne mesure plus rien.
 *
 * La base applique les mêmes règles (life.f_task_streak_days) ; ces
 * fonctions servent à l'affichage optimiste, avant que le serveur réponde.
 */
import { addDays, startOfWeek, todayKey, type DateKey } from '@/lib/date'
import type { Cadence } from './cadence'

export type LogStatus = 'pending' | 'done' | 'missed' | 'skipped' | 'postponed'

/** Série en jours. `statusByDate` n'a besoin que des jours renseignés. */
export function streakDays(
  statusByDate: ReadonlyMap<DateKey, LogStatus>,
  upTo: DateKey = todayKey(),
): number {
  let cursor = upTo
  if (statusByDate.get(cursor) !== 'done') cursor = addDays(cursor, -1)

  let streak = 0
  let week = startOfWeek(cursor)
  let skipsThisWeek = 0

  for (let guard = 0; guard < 4000; guard++) {
    const w = startOfWeek(cursor)
    if (w !== week) {
      week = w
      skipsThisWeek = 0
    }
    const status = statusByDate.get(cursor)
    if (status === 'done') {
      streak++
    } else if (status === 'skipped') {
      skipsThisWeek++
      if (skipsThisWeek > 1) break
    } else {
      break
    }
    cursor = addDays(cursor, -1)
  }
  return streak
}

/**
 * Série en semaines, pour une cadence hebdomadaire : une semaine compte
 * si elle atteint son nombre de fois. La semaine en cours est tolérée,
 * comme le jour en cours l'est pour une cadence quotidienne.
 */
export function streakWeeks(
  statusByDate: ReadonlyMap<DateKey, LogStatus>,
  times: number,
  upTo: DateKey = todayKey(),
): number {
  const doneInWeek = (monday: DateKey): number => {
    let n = 0
    for (let i = 0; i < 7; i++) {
      if (statusByDate.get(addDays(monday, i)) === 'done') n++
    }
    return n
  }

  let week = startOfWeek(upTo)
  if (doneInWeek(week) < times) week = addDays(week, -7)

  let streak = 0
  for (let guard = 0; guard < 600; guard++) {
    if (doneInWeek(week) < times) break
    streak++
    week = addDays(week, -7)
  }
  return streak
}

/** La bonne série selon la cadence, avec son unité d'affichage. */
export function streakFor(
  cadence: Cadence,
  statusByDate: ReadonlyMap<DateKey, LogStatus>,
  upTo: DateKey = todayKey(),
): { value: number; unit: 'jours' | 'semaines' } {
  return cadence.type === 'weekly'
    ? { value: streakWeeks(statusByDate, cadence.times, upTo), unit: 'semaines' }
    : { value: streakDays(statusByDate, upTo), unit: 'jours' }
}
