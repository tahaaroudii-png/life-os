import { describe, it, expect } from 'vitest'
import { addDays, daysBetween, isoWeekday, startOfWeek, range, asKey, formatShort } from '@/lib/date'

describe('dates', () => {
  it('décale sans dépendre du fuseau ni de l’heure d’été', () => {
    expect(addDays('2026-10-07', 1)).toBe('2026-10-08')
    expect(addDays('2026-10-07', -1)).toBe('2026-10-06')
    // Changement d'heure en Europe fin octobre : aucun jour sauté ni répété.
    expect(addDays('2026-10-24', 3)).toBe('2026-10-27')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('compte les jours entre deux clés', () => {
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364)
    expect(daysBetween('2026-10-07', '2026-10-07')).toBe(0)
    expect(daysBetween('2026-10-08', '2026-10-07')).toBe(-1)
  })

  it('donne le jour ISO, lundi = 1', () => {
    expect(isoWeekday('2026-10-05')).toBe(1)   // lundi
    expect(isoWeekday('2026-10-11')).toBe(7)   // dimanche
  })

  it('remonte au lundi de la semaine', () => {
    expect(startOfWeek('2026-10-07')).toBe('2026-10-05')
    expect(startOfWeek('2026-10-05')).toBe('2026-10-05')
    expect(startOfWeek('2026-10-11')).toBe('2026-10-05')
  })

  it('énumère une plage bornes incluses', () => {
    expect(range('2026-10-05', '2026-10-08')).toHaveLength(4)
  })

  it('normalise ce qui vient de la base', () => {
    expect(asKey('2026-10-07T00:00:00+00:00')).toBe('2026-10-07')
    expect(asKey('2026-10-07')).toBe('2026-10-07')
  })

  it('formate court', () => {
    expect(formatShort('2026-10-07')).toBe('mer 7 oct')
  })
})
