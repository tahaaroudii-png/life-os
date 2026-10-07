import { describe, it, expect } from 'vitest'
import { isExpectedOn, expectedCount, describe as label, parseCadence, type Cadence } from '@/domain/cadence'

describe('cadence', () => {
  it('quotidien : tous les jours', () => {
    expect(isExpectedOn({ type: 'daily' }, '2026-10-10')).toBe(true)
  })

  it('jours choisis : seulement ceux-là', () => {
    const c: Cadence = { type: 'weekdays', days: [1, 2, 3, 4, 5] }
    expect(isExpectedOn(c, '2026-10-05')).toBe(true)   // lundi
    expect(isExpectedOn(c, '2026-10-10')).toBe(false)  // samedi
  })

  it('mensuel : le jour du mois', () => {
    expect(isExpectedOn({ type: 'monthly', day: 1 }, '2026-10-01')).toBe(true)
    expect(isExpectedOn({ type: 'monthly', day: 1 }, '2026-10-02')).toBe(false)
  })

  it('hebdomadaire : aucun jour n’est attendu en particulier', () => {
    // C'est la règle qui rend « 4 fois par semaine » exprimable : la tâche
    // n'est en retard aucun jour précis, seulement si la semaine échoue.
    expect(isExpectedOn({ type: 'weekly', times: 4 }, '2026-10-05')).toBe(false)
  })

  it('compte les occurrences attendues sur une période', () => {
    expect(expectedCount({ type: 'daily' }, '2026-10-05', '2026-10-11')).toBe(7)
    expect(expectedCount({ type: 'weekdays', days: [1, 3, 5] }, '2026-10-05', '2026-10-11')).toBe(3)
    // Du lundi 5 au dimanche 18 : deux semaines ISO, 4 fois chacune.
    expect(expectedCount({ type: 'weekly', times: 4 }, '2026-10-05', '2026-10-18')).toBe(8)
    // Une période à cheval sur deux semaines en compte bien deux.
    expect(expectedCount({ type: 'weekly', times: 3 }, '2026-10-08', '2026-10-13')).toBe(6)
    expect(expectedCount({ type: 'monthly', day: 1 }, '2026-10-01', '2026-12-31')).toBe(3)
  })

  it('lit sans crasher ce que la base contient', () => {
    expect(parseCadence(null)).toEqual({ type: 'daily' })
    expect(parseCadence({ type: 'nawak' })).toEqual({ type: 'daily' })
    expect(parseCadence({ type: 'weekly', times: 3 })).toEqual({ type: 'weekly', times: 3 })
    expect(parseCadence({ type: 'weekly' })).toEqual({ type: 'daily' })
  })

  it('se décrit en français', () => {
    expect(label({ type: 'weekly', times: 4 })).toBe('4 fois par semaine')
    expect(label({ type: 'weekdays', days: [1, 2, 3, 4, 5] })).toBe('en semaine')
  })
})
