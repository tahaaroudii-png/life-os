import { describe, it, expect } from 'vitest'
import { computeProgress, paceVerdict } from '@/domain/progress'

const YEAR = { startsOn: '2026-01-01', deadline: '2026-12-31' }

describe('progression annuelle', () => {
  it('donne réel, attendu à date et projection', () => {
    // Au 1er juillet : 182 jours écoulés sur 365, soit presque la moitié.
    const p = computeProgress({ realValue: 900, targetValue: 1800, ...YEAR, today: '2026-07-01' })
    expect(p.daysTotal).toBe(365)
    expect(p.daysElapsed).toBe(182)
    expect(p.realRatio).toBeCloseTo(0.5, 3)
    expect(p.expectedRatio).toBeCloseTo(182 / 365, 3)
    expect(p.expectedValue).toBeCloseTo(897.5, 0)
    expect(p.projectedValue).toBeCloseTo(1804.9, 0)
    expect(p.verdict).toBe('on_track')
  })

  it('un retard donne un facteur de rattrapage et un rythme requis', () => {
    const p = computeProgress({ realValue: 450, targetValue: 1800, ...YEAR, today: '2026-07-01' })
    // Reste 1350 sur 183 jours = 7,38 par jour, contre 2,47 observés.
    expect(p.requiredPerDay).toBeCloseTo(7.38, 1)
    expect(p.paceFactor).toBeCloseTo(2.99, 1)
    expect(p.verdict).toBe('drifting')
  })

  it('un objectif atteint a un facteur nul', () => {
    const p = computeProgress({ realValue: 1800, targetValue: 1800, ...YEAR, today: '2026-07-01' })
    expect(p.paceFactor).toBe(0)
    expect(p.verdict).toBe('on_track')
    expect(p.requiredPerDay).toBe(0)
  })

  it('sans aucun rythme observé, aucun facteur ne peut être calculé', () => {
    const p = computeProgress({ realValue: 0, targetValue: 1800, ...YEAR, today: '2026-07-01' })
    expect(p.paceFactor).toBeNull()
    expect(p.verdict).toBe('unknown')
    // Mais le rythme requis, lui, reste affichable : c'est ce qu'on montre.
    expect(p.requiredPerDay).toBeCloseTo(9.84, 1)
  })

  it('après l’échéance, plus rien n’est projetable', () => {
    const p = computeProgress({ realValue: 900, targetValue: 1800, ...YEAR, today: '2027-02-01' })
    expect(p.daysElapsed).toBe(365)
    expect(p.daysLeft).toBe(0)
    expect(p.paceFactor).toBeNull()
  })

  it('ne divise jamais par zéro au premier jour', () => {
    const p = computeProgress({ realValue: 0, targetValue: 1800, ...YEAR, today: '2026-01-01' })
    expect(p.daysElapsed).toBe(1)
    expect(Number.isFinite(p.requiredPerDay)).toBe(true)
  })

  it('classe les verdicts aux bons seuils', () => {
    expect(paceVerdict(1)).toBe('on_track')
    expect(paceVerdict(1.1)).toBe('on_track')
    expect(paceVerdict(1.4)).toBe('catch_up')
    expect(paceVerdict(2)).toBe('drifting')
    expect(paceVerdict(3.01)).toBe('unreachable')
    expect(paceVerdict(null)).toBe('unknown')
  })
})
