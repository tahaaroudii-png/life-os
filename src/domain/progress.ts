/**
 * La progression annuelle.
 *
 * Règle du produit : jamais un chiffre sans sa référence. Une barre à 40 %
 * ne dit rien — 40 % en octobre est bon pour un objectif démarré en
 * septembre et catastrophique pour un objectif annuel. Les trois nombres
 * sortent donc toujours ensemble : réel, attendu à date, projeté à
 * l'échéance.
 *
 * Ces fonctions reproduisent life.v_goal_progress pour l'affichage
 * optimiste. Le serveur reste la référence ; les tests vérifient que les
 * deux donnent le même résultat sur les mêmes entrées.
 */
import { daysBetween, todayKey, type DateKey } from '@/lib/date'

export type PaceVerdict = 'on_track' | 'catch_up' | 'drifting' | 'unreachable' | 'unknown'

export interface Progress {
  realValue: number
  targetValue: number
  daysTotal: number
  daysElapsed: number
  daysLeft: number
  realRatio: number
  expectedRatio: number
  expectedValue: number
  projectedValue: number
  projectedRatio: number
  /** Par combien multiplier le rythme observé pour tenir la cible. */
  paceFactor: number | null
  /** Ce qu'il faut faire par jour, désormais, pour y arriver. */
  requiredPerDay: number
  verdict: PaceVerdict
}

export function computeProgress(input: {
  realValue: number
  targetValue: number
  startsOn: DateKey
  deadline: DateKey
  today?: DateKey
}): Progress {
  const today = input.today ?? todayKey()
  const daysTotal = Math.max(1, daysBetween(input.startsOn, input.deadline) + 1)
  const cappedToday = daysBetween(today, input.deadline) < 0 ? input.deadline : today
  const daysElapsed = Math.max(1, Math.min(daysTotal, daysBetween(input.startsOn, cappedToday) + 1))
  const daysLeft = daysTotal - daysElapsed

  const { realValue, targetValue } = input
  const expectedRatio = daysElapsed / daysTotal
  const expectedValue = targetValue * expectedRatio
  const projectedValue = (realValue / daysElapsed) * daysTotal

  const paceFactor = computePaceFactor({ realValue, targetValue, daysElapsed, daysLeft })

  return {
    realValue,
    targetValue,
    daysTotal,
    daysElapsed,
    daysLeft,
    realRatio: targetValue > 0 ? realValue / targetValue : 0,
    expectedRatio,
    expectedValue,
    projectedValue,
    projectedRatio: targetValue > 0 ? projectedValue / targetValue : 0,
    paceFactor,
    requiredPerDay: daysLeft > 0 ? Math.max(0, targetValue - realValue) / daysLeft : 0,
    verdict: paceVerdict(paceFactor),
  }
}

function computePaceFactor(a: {
  realValue: number; targetValue: number; daysElapsed: number; daysLeft: number
}): number | null {
  if (a.realValue >= a.targetValue) return 0      // déjà atteint
  if (a.daysLeft <= 0) return null                // échéance passée
  if (a.realValue <= 0) return null               // aucun rythme à multiplier
  const required = (a.targetValue - a.realValue) / a.daysLeft
  const observed = a.realValue / a.daysElapsed
  return required / observed
}

/**
 * Le quatrième cas est celui qui manquait à l'ancienne app : un objectif
 * devenu inatteignable doit être renégocié, pas affiché en rouge jusqu'en
 * décembre jusqu'à ce qu'on arrête de le regarder.
 */
export function paceVerdict(factor: number | null): PaceVerdict {
  if (factor === null) return 'unknown'
  if (factor <= 1.1) return 'on_track'
  if (factor <= 1.5) return 'catch_up'
  if (factor <= 3) return 'drifting'
  return 'unreachable'
}

export const VERDICT_LABEL: Record<PaceVerdict, string> = {
  on_track: 'À l’heure',
  catch_up: 'À rattraper',
  drifting: 'En dérive',
  unreachable: 'Hors d’atteinte',
  unknown: 'Pas encore mesurable',
}

export const VERDICT_TONE: Record<PaceVerdict, 'good' | 'warn' | 'crit' | 'neutral'> = {
  on_track: 'good',
  catch_up: 'warn',
  drifting: 'crit',
  unreachable: 'crit',
  unknown: 'neutral',
}
