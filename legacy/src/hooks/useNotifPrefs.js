import { useCallback, useEffect, useState } from 'react'
import { AXIS_KEYS } from '../lib/planning'

/**
 * Préférences de rappels stockées en localStorage (par-device).
 *
 * Par défaut, 5 axes activés : Spiritualité, Santé, Personnel, Business,
 * Finances — Famille et Social laissés OFF (rappels moins pertinents).
 *
 * On garde localStorage (pas de table Supabase) parce que ces préférences
 * ont du sens par appareil : tu veux peut-être des notifs sur ton téléphone
 * mais pas sur ton PC de travail.
 */
const KEY = 'budget-app.notif-axes'

const DEFAULTS = {
  spiritualite: true,
  sante: true,
  personnel: true,
  business: true,
  finances: true,
  famille: false,
  social: false,
}

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw)
    const merged = { ...DEFAULTS }
    for (const k of AXIS_KEYS) {
      if (typeof parsed[k] === 'boolean') merged[k] = parsed[k]
    }
    return merged
  } catch {
    return { ...DEFAULTS }
  }
}

export function useNotifPrefs() {
  const [prefs, setPrefs] = useState(read)

  // Sync entre onglets/fenêtres du même navigateur.
  useEffect(() => {
    function onStorage(e) {
      if (e.key === KEY) setPrefs(read())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setAxis = useCallback((axisKey, enabled) => {
    setPrefs((prev) => {
      const next = { ...prev, [axisKey]: !!enabled }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // localStorage plein ou refusé : les préférences ne survivent pas au refresh,
        // mais l'état React reste correct pour cette session.
      }
      return next
    })
  }, [])

  return { prefs, setAxis }
}
