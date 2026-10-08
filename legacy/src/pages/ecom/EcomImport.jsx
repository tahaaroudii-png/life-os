import { useMemo, useState } from 'react'
import { useEcom } from '../../hooks/useEcom'
import {
  KIND_BY_KEY, SOURCE_BY_KEY,
  parseCodpStatement, parseCodnInvoice, parseAdsCsv, findDuplicates,
  formatMoney,
} from '../../lib/ecom'

const SOURCES = [
  { key: 'codpartner',    label: 'CODPartner — relevé' },
  { key: 'codnetwork',    label: 'COD Network — facture' },
  { key: 'tiktok',        label: 'TikTok Ads — CSV' },
  { key: 'snapchat',      label: 'Snapchat Ads — CSV' },
]

export default function EcomImport() {
  const ecom = useEcom()
  const [source, setSource] = useState('codpartner')
  const [text, setText] = useState('')
  const [imported, setImported] = useState(null)

  const candidates = useMemo(() => {
    if (!text.trim()) return []
    if (source === 'codpartner') return parseCodpStatement(text)
    if (source === 'codnetwork') return parseCodnInvoice(text)
    return parseAdsCsv(text, source)
  }, [text, source])

  const dupes = useMemo(
    () => findDuplicates(candidates, ecom.movements),
    [candidates, ecom.movements]
  )

  const summary = useMemo(() => {
    const acc = {}
    for (const c of candidates) acc[c.kind] = (acc[c.kind] || 0) + Number(c.amount || 0)
    return acc
  }, [candidates])

  function handleImport() {
    if (candidates.length === 0) return
    const dupSet = new Set(dupes.map((d) => `${d.date}|${d.source}|${d.amount}|${d.ref || ''}`))
    const toInsert = candidates.filter((c) => !dupSet.has(`${c.date}|${c.source}|${c.amount}|${c.ref || ''}`))
    if (toInsert.length === 0) {
      setImported({ count: 0, note: 'Rien à importer — tout est en doublon.' })
      return
    }
    ecom.addMovements(toInsert)
    setImported({ count: toInsert.length })
    setText('')
  }

  return (
    <div className="page-ecom-import">
      <div className="page-header"><h1>Import</h1></div>

      <p className="muted">
        Colle un relevé (CODPartner), une facture (COD Network) ou un export CSV (TikTok / Snapchat).
        Un aperçu s'affiche avec les doublons. Rien n'est écrit sans validation.
      </p>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <label>Source</label>
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        <label htmlFor="ecom-paste">Collage</label>
        <textarea
          id="ecom-paste" rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Colle le texte ou le CSV ici…"
        />
      </section>

      {candidates.length > 0 && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Aperçu</h2>
          <p><strong>{candidates.length}</strong> ligne(s) détectée(s). <strong>{dupes.length}</strong> doublon(s) potentiel(s) ignorés.</p>

          <div className="ecom-summary">
            {Object.entries(summary).map(([k, v]) => (
              <span key={k} className="ecom-kind-pill" style={{ background: `${KIND_BY_KEY[k]?.color}18`, color: KIND_BY_KEY[k]?.color }}>
                {KIND_BY_KEY[k]?.label}: {formatMoney(v, 'USD')}
              </span>
            ))}
          </div>

          <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
            <table className="ecom-table">
              <thead>
                <tr><th>Date</th><th>Source</th><th>Nature</th><th>Montant</th><th>Réf</th><th></th></tr>
              </thead>
              <tbody>
                {candidates.slice(0, 30).map((c, i) => {
                  const dup = dupes.some((d) => d === c || (d.date === c.date && d.source === c.source && d.amount === c.amount && d.ref === c.ref))
                  return (
                    <tr key={i} className={dup ? 'muted' : ''}>
                      <td>{c.date}</td>
                      <td>{SOURCE_BY_KEY[c.source]?.label || c.source}</td>
                      <td>{KIND_BY_KEY[c.kind]?.label}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(c.amount, c.currency)}</td>
                      <td className="muted small">{c.ref || '—'}</td>
                      <td>{dup ? <span className="muted small">doublon</span> : '✓'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {candidates.length > 30 && <p className="muted small">… {candidates.length - 30} lignes non affichées dans l'aperçu.</p>}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={() => setText('')}>Vider</button>
            <button type="button" className="btn-primary" onClick={handleImport}>
              Importer {candidates.length - dupes.length} ligne(s)
            </button>
          </div>
        </section>
      )}

      {imported && (
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          ✓ {imported.count > 0 ? `${imported.count} ligne(s) ajoutée(s)` : imported.note}
        </p>
      )}
    </div>
  )
}
