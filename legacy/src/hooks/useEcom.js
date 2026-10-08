import { useCallback, useEffect, useMemo, useState } from 'react'
import { KEY, KEY_V2, buildSeedState, migrateToV2 } from '../lib/ecom'

function readStorage() {
  try {
    // v2 en priorité
    const raw2 = localStorage.getItem(KEY_V2)
    if (raw2) {
      const parsed = JSON.parse(raw2)
      if (parsed && typeof parsed === 'object' && parsed.version >= 2) return parsed
    }
    // v1 → migre
    const raw1 = localStorage.getItem(KEY)
    if (raw1) {
      const parsed = JSON.parse(raw1)
      if (parsed && typeof parsed === 'object' && parsed.version === 1) {
        const migrated = migrateToV2(parsed)
        localStorage.setItem(KEY_V2, JSON.stringify(migrated))
        return migrated
      }
    }
  } catch { /* noop */ }
  return null
}

function writeStorage(state) {
  try { localStorage.setItem(KEY_V2, JSON.stringify(state)) } catch { /* noop */ }
}

let _lastRemoved = null
export function getLastRemoved() { return _lastRemoved }
export function setLastRemoved(v) { _lastRemoved = v }

const mkId = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`

/**
 * Hook local — pas de Supabase. Auto-seed au premier chargement, migration
 * automatique v1 → v2, sync entre onglets via l'event `storage`.
 */
export function useEcom() {
  const [state, setState] = useState(() => {
    const existing = readStorage()
    if (existing) return existing
    const seeded = buildSeedState()
    writeStorage(seeded)
    return seeded
  })

  useEffect(() => {
    function onStorage(e) {
      if ((e.key === KEY_V2 || e.key === KEY) && e.newValue) {
        try { setState(JSON.parse(e.newValue)) } catch { /* noop */ }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const commit = useCallback((next) => {
    setState(next)
    writeStorage(next)
  }, [])

  // -------- Mouvements
  const addMovement = useCallback((movement) => {
    const m = {
      id: mkId('mv'),
      createdAt: new Date().toISOString(),
      period: 'oneoff', undated: false,
      currency: state.settings.baseCurrency,
      ...movement,
    }
    commit({ ...state, movements: [m, ...state.movements] })
    return m
  }, [state, commit])

  const addMovements = useCallback((list) => {
    const now = new Date().toISOString()
    const enriched = list.map((m) => ({
      id: mkId('mv'), createdAt: now,
      period: 'oneoff', undated: false,
      currency: state.settings.baseCurrency,
      ...m,
    }))
    commit({ ...state, movements: [...enriched, ...state.movements] })
    return enriched
  }, [state, commit])

  const updateMovement = useCallback((id, patch) => {
    commit({ ...state, movements: state.movements.map((m) => m.id === id ? { ...m, ...patch } : m) })
  }, [state, commit])

  const removeMovement = useCallback((id) => {
    const target = state.movements.find((m) => m.id === id)
    if (target) setLastRemoved(target)
    commit({ ...state, movements: state.movements.filter((m) => m.id !== id) })
  }, [state, commit])

  const undoRemove = useCallback(() => {
    const t = getLastRemoved()
    if (!t) return
    setLastRemoved(null)
    commit({ ...state, movements: [t, ...state.movements] })
  }, [state, commit])

  // -------- Settings / positions
  const updateSettings = useCallback((patch) => {
    commit({ ...state, settings: { ...state.settings, ...patch } })
  }, [state, commit])
  const updatePositions = useCallback((patch) => {
    commit({ ...state, positions: { ...state.positions, ...patch } })
  }, [state, commit])

  // -------- Produits
  const addProduct = useCallback((p) => {
    const row = { id: mkId('prd'), status: 'testing', cogs: 0, sku: [], pricing: {}, ...p }
    commit({ ...state, products: [...(state.products || []), row] })
    return row
  }, [state, commit])
  const updateProduct = useCallback((id, patch) => {
    commit({ ...state, products: (state.products || []).map((p) => p.id === id ? { ...p, ...patch } : p) })
  }, [state, commit])
  const removeProduct = useCallback((id) => {
    commit({ ...state, products: (state.products || []).filter((p) => p.id !== id) })
  }, [state, commit])

  // -------- Campagnes
  const addCampaign = useCallback((c) => {
    const row = { id: mkId('cmp'), status: 'active', budgetCap: 0, ...c }
    commit({ ...state, campaigns: [...(state.campaigns || []), row] })
    return row
  }, [state, commit])
  const updateCampaign = useCallback((id, patch) => {
    commit({ ...state, campaigns: (state.campaigns || []).map((c) => c.id === id ? { ...c, ...patch } : c) })
  }, [state, commit])
  const removeCampaign = useCallback((id) => {
    commit({ ...state, campaigns: (state.campaigns || []).filter((c) => c.id !== id) })
  }, [state, commit])

  // -------- Creatives
  const addCreative = useCallback((c) => {
    const row = { id: mkId('crv'), format: 'faceless', ...c }
    commit({ ...state, creatives: [...(state.creatives || []), row] })
    return row
  }, [state, commit])
  const updateCreative = useCallback((id, patch) => {
    commit({ ...state, creatives: (state.creatives || []).map((c) => c.id === id ? { ...c, ...patch } : c) })
  }, [state, commit])
  const removeCreative = useCallback((id) => {
    commit({ ...state, creatives: (state.creatives || []).filter((c) => c.id !== id) })
  }, [state, commit])

  // -------- Angles
  const addAngle = useCallback((a) => {
    const row = { id: mkId('ang'), category: 'trust', markets: [], ...a }
    commit({ ...state, angles: [...(state.angles || []), row] })
    return row
  }, [state, commit])
  const updateAngle = useCallback((id, patch) => {
    commit({ ...state, angles: (state.angles || []).map((a) => a.id === id ? { ...a, ...patch } : a) })
  }, [state, commit])
  const removeAngle = useCallback((id) => {
    commit({ ...state, angles: (state.angles || []).filter((a) => a.id !== id) })
  }, [state, commit])

  // -------- Daily (saisie du soir)
  const upsertDaily = useCallback((rows) => {
    // Merge par (date, campaignId, creativeId)
    const existing = new Map((state.daily || []).map((d) => [`${d.date}|${d.campaignId}|${d.creativeId || ''}`, d]))
    for (const r of rows) {
      const key = `${r.date}|${r.campaignId}|${r.creativeId || ''}`
      const prev = existing.get(key)
      existing.set(key, { ...(prev || {}), ...r, id: prev?.id || mkId('d') })
    }
    commit({ ...state, daily: Array.from(existing.values()) })
  }, [state, commit])
  const removeDaily = useCallback((id) => {
    commit({ ...state, daily: (state.daily || []).filter((d) => d.id !== id) })
  }, [state, commit])

  // -------- Backup
  const replaceAll = useCallback((newState) => {
    if (!newState || typeof newState !== 'object') return
    commit(migrateToV2(newState))
  }, [commit])

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ecom-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [state])

  return useMemo(() => ({
    state,
    settings: state.settings,
    movements: state.movements || [],
    positions: state.positions || { platformBalances: [], stock: [] },
    products: state.products || [],
    campaigns: state.campaigns || [],
    creatives: state.creatives || [],
    angles: state.angles || [],
    daily: state.daily || [],
    addMovement, addMovements,
    updateMovement, removeMovement, undoRemove,
    updateSettings, updatePositions,
    addProduct, updateProduct, removeProduct,
    addCampaign, updateCampaign, removeCampaign,
    addCreative, updateCreative, removeCreative,
    addAngle, updateAngle, removeAngle,
    upsertDaily, removeDaily,
    replaceAll, exportJson,
  }), [
    state,
    addMovement, addMovements, updateMovement, removeMovement, undoRemove,
    updateSettings, updatePositions,
    addProduct, updateProduct, removeProduct,
    addCampaign, updateCampaign, removeCampaign,
    addCreative, updateCreative, removeCreative,
    addAngle, updateAngle, removeAngle,
    upsertDaily, removeDaily,
    replaceAll, exportJson,
  ])
}
