import { describe, it, expect } from 'vitest'
import { streakDays, streakWeeks, type LogStatus } from '@/domain/streak'
import { addDays, type DateKey } from '@/lib/date'

const TODAY: DateKey = '2026-10-07'   // mercredi

/** Construit la carte des statuts en remontant depuis `TODAY`. */
function build(entries: Array<[number, LogStatus]>): Map<DateKey, LogStatus> {
  return new Map(entries.map(([offset, s]) => [addDays(TODAY, offset), s]))
}

describe('série en jours', () => {
  it('compte les jours faits d’affilée', () => {
    const m = build([[0, 'done'], [-1, 'done'], [-2, 'done']])
    expect(streakDays(m, TODAY)).toBe(3)
  })

  it('tolère le jour en cours tant qu’il n’est pas fait', () => {
    // Hier et avant-hier faits, aujourd'hui pas encore : la série d'hier tient.
    const m = build([[-1, 'done'], [-2, 'done']])
    expect(streakDays(m, TODAY)).toBe(2)
  })

  it('un raté casse la série', () => {
    const m = build([[0, 'done'], [-1, 'missed'], [-2, 'done'], [-3, 'done']])
    expect(streakDays(m, TODAY)).toBe(1)
  })

  it('un saut traverse sans allonger', () => {
    const m = build([[0, 'done'], [-1, 'skipped'], [-2, 'done'], [-3, 'done']])
    expect(streakDays(m, TODAY)).toBe(3)
  })

  it('le deuxième saut de la semaine compte comme un raté', () => {
    // Mercredi fait, mardi sauté, lundi sauté : le second saut referme.
    const m = build([[0, 'done'], [-1, 'skipped'], [-2, 'skipped'], [-3, 'done']])
    expect(streakDays(m, TODAY)).toBe(1)
  })

  it('le compteur de sauts repart à chaque semaine', () => {
    // Un saut cette semaine (mardi), un saut la semaine d'avant (vendredi) :
    // les deux sont tolérés car ils tombent dans des semaines différentes.
    const m = build([
      [0, 'done'], [-1, 'skipped'], [-2, 'done'],          // mer, mar, lun
      [-3, 'done'], [-4, 'skipped'], [-5, 'done'], [-6, 'done'], [-7, 'done'],
    ])
    expect(streakDays(m, TODAY)).toBe(6)
  })

  it('un jour sans ligne du tout casse la série', () => {
    const m = build([[0, 'done'], [-2, 'done'], [-3, 'done']])
    expect(streakDays(m, TODAY)).toBe(1)
  })

  it('série vide', () => {
    expect(streakDays(new Map(), TODAY)).toBe(0)
  })

  it('un report ne compte pas', () => {
    const m = build([[0, 'done'], [-1, 'postponed'], [-2, 'done']])
    expect(streakDays(m, TODAY)).toBe(1)
  })
})

describe('série en semaines', () => {
  it('compte les semaines qui atteignent leur nombre de fois', () => {
    // Semaine en cours : lun, mar, mer faits → 3 sur 3.
    // Semaine d'avant : lun, mer, ven faits → 3 sur 3.
    const m = build([
      [0, 'done'], [-1, 'done'], [-2, 'done'],
      [-5, 'done'], [-7, 'done'], [-9, 'done'],
    ])
    expect(streakWeeks(m, 3, TODAY)).toBe(2)
  })

  it('tolère la semaine en cours encore incomplète', () => {
    // Cette semaine : 1 sur 3 seulement. La semaine passée est complète.
    const m = build([[0, 'done'], [-5, 'done'], [-7, 'done'], [-9, 'done']])
    expect(streakWeeks(m, 3, TODAY)).toBe(1)
  })

  it('une semaine manquée casse la série', () => {
    const m = build([[0, 'done'], [-1, 'done'], [-2, 'done'], [-5, 'done']])
    expect(streakWeeks(m, 3, TODAY)).toBe(1)
  })
})
