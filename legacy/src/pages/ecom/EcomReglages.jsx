import { useState, useRef } from 'react'
import { useEcom } from '../../hooks/useEcom'
import { SOURCE_BY_KEY, formatMoney, buildSeedState } from '../../lib/ecom'

export default function EcomReglages() {
  const ecom = useEcom()
  const { settings, positions } = ecom
  const [madRate, setMadRate] = useState(settings.rates?.MAD || 9.5)
  const [startDate, setStartDate] = useState(settings.startDate)
  const fileRef = useRef(null)

  function saveSettings(e) {
    e.preventDefault()
    ecom.updateSettings({
      startDate,
      rates: { ...(settings.rates || {}), MAD: Number(madRate) || 9.5 },
    })
  }

  function updateBalance(idx, patch) {
    const list = [...(positions.platformBalances || [])]
    list[idx] = { ...list[idx], ...patch }
    ecom.updatePositions({ platformBalances: list })
  }
  function addBalance() {
    const list = [...(positions.platformBalances || [])]
    list.push({ source: 'autre', amount: 0, currency: 'USD', label: 'Ligne' })
    ecom.updatePositions({ platformBalances: list })
  }
  function removeBalance(idx) {
    const list = [...(positions.platformBalances || [])]
    list.splice(idx, 1)
    ecom.updatePositions({ platformBalances: list })
  }

  function updateStockLine(idx, patch) {
    const list = [...(positions.stock || [])]
    list[idx] = { ...list[idx], ...patch }
    ecom.updatePositions({ stock: list })
  }
  function addStockLine() {
    const list = [...(positions.stock || [])]
    list.push({ sku: '', warehouse: '', units: 0, unitCost: 0 })
    ecom.updatePositions({ stock: list })
  }
  function removeStockLine(idx) {
    const list = [...(positions.stock || [])]
    list.splice(idx, 1)
    ecom.updatePositions({ stock: list })
  }

  async function importFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const text = await f.text()
    try {
      const parsed = JSON.parse(text)
      if (!window.confirm('Remplacer tout l\'état actuel par le contenu de ce fichier ?')) return
      ecom.replaceAll(parsed)
    } catch (err) {
      window.alert(`JSON invalide : ${err?.message || err}`)
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  function resetSeed() {
    if (!window.confirm('Réinitialiser toutes les données au seed historique ? (garde ta sauvegarde d\'abord)')) return
    ecom.replaceAll(buildSeedState())
  }

  return (
    <div className="page-ecom-reglages">
      <div className="page-header"><h1>Réglages</h1></div>

      <form className="settings-form" onSubmit={saveSettings} style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Devise et taux</h2>
        <label>Devise de base</label>
        <input type="text" value={settings.baseCurrency} readOnly style={{ background: '#f8fafc' }} />
        <label>Devise secondaire (affichage)</label>
        <input type="text" value={settings.displaySecondary} readOnly style={{ background: '#f8fafc' }} />
        <label>Taux 1 USD = ? MAD</label>
        <input type="number" step="0.01" value={madRate} onChange={(e) => setMadRate(e.target.value)} />
        <label>Début d'activité</label>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <button type="submit" className="btn-primary">Enregistrer</button>
      </form>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Soldes plateformes / créances</h2>
        <p className="muted small">Positif = à recevoir. Négatif = solde débiteur (déjà consommé).</p>
        <table className="ecom-table">
          <thead><tr><th>Source</th><th>Libellé</th><th>Montant</th><th>Devise</th><th></th></tr></thead>
          <tbody>
            {(positions.platformBalances || []).map((p, i) => (
              <tr key={i}>
                <td>
                  <select value={p.source} onChange={(e) => updateBalance(i, { source: e.target.value })}>
                    {Object.entries(SOURCE_BY_KEY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </td>
                <td><input type="text" value={p.label || ''} onChange={(e) => updateBalance(i, { label: e.target.value })} /></td>
                <td><input type="number" step="0.01" value={p.amount} onChange={(e) => updateBalance(i, { amount: Number(e.target.value) })} /></td>
                <td>
                  <select value={p.currency || 'USD'} onChange={(e) => updateBalance(i, { currency: e.target.value })}>
                    <option value="USD">USD</option><option value="MAD">MAD</option><option value="EUR">EUR</option>
                  </select>
                </td>
                <td><button type="button" className="btn-link btn-link--danger" onClick={() => removeBalance(i)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn-link" onClick={addBalance}>+ Ajouter une ligne</button>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Stock</h2>
        <p className="muted small">
          Valeur totale estimée : <strong>{formatMoney(positions.stock?.reduce((s, r) => s + (Number(r.units) || 0) * (Number(r.unitCost) || 0), 0), settings.baseCurrency)}</strong>
        </p>
        <table className="ecom-table">
          <thead><tr><th>SKU</th><th>Entrepôt</th><th>Unités</th><th>Coût / unité</th><th></th></tr></thead>
          <tbody>
            {(positions.stock || []).map((r, i) => (
              <tr key={i}>
                <td><input type="text" value={r.sku || ''} onChange={(e) => updateStockLine(i, { sku: e.target.value })} /></td>
                <td><input type="text" value={r.warehouse || ''} onChange={(e) => updateStockLine(i, { warehouse: e.target.value })} /></td>
                <td><input type="number" value={r.units} onChange={(e) => updateStockLine(i, { units: Number(e.target.value) })} /></td>
                <td><input type="number" step="0.01" value={r.unitCost} onChange={(e) => updateStockLine(i, { unitCost: Number(e.target.value) })} /></td>
                <td><button type="button" className="btn-link btn-link--danger" onClick={() => removeStockLine(i)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn-link" onClick={addStockLine}>+ Ajouter un SKU</button>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Sauvegarde / restauration</h2>
        <p className="muted small">
          Tes données vivent dans le navigateur (localStorage, clé <code>ecom.v1</code>). Fais des sauvegardes régulières.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn-primary" onClick={ecom.exportJson}>Exporter JSON</button>
          <label className="btn-secondary" style={{ cursor: 'pointer' }}>
            Importer JSON
            <input ref={fileRef} type="file" accept="application/json" onChange={importFile} style={{ display: 'none' }} />
          </label>
          <button type="button" className="btn-ghost" onClick={resetSeed}>Réinitialiser au seed</button>
        </div>
      </section>
    </div>
  )
}
