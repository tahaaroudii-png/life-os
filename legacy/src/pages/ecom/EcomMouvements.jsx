import { useMemo, useState } from 'react'
import { useEcom } from '../../hooks/useEcom'
import { KINDS, KIND_BY_KEY, SOURCES, SOURCE_BY_KEY, formatMoney } from '../../lib/ecom'

export default function EcomMouvements() {
  const ecom = useEcom()
  const [source, setSource] = useState('all')
  const [kind, setKind] = useState('all')

  const filtered = useMemo(() => {
    return ecom.movements
      .filter((m) => source === 'all' || m.source === source)
      .filter((m) => kind === 'all' || m.kind === kind)
      .sort((a, b) => {
        const da = a.date || '0000-00-00'; const db = b.date || '0000-00-00'
        if (da !== db) return db.localeCompare(da)
        return (b.createdAt || '').localeCompare(a.createdAt || '')
      })
  }, [ecom.movements, source, kind])

  return (
    <div className="page-ecom-mouvements">
      <div className="page-header">
        <h1>Tous les mouvements</h1>
        <span className="muted">{filtered.length} ligne(s)</span>
      </div>

      <div className="filters">
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="all">Toutes sources</option>
          {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">Toutes natures</option>
          {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        <table className="ecom-table">
          <thead>
            <tr>
              <th>Date</th><th>Source</th><th>Nature</th>
              <th style={{ textAlign: 'right' }}>Montant</th>
              <th>Note</th><th>Réf</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => {
              const k = KIND_BY_KEY[m.kind]
              const signed = (k?.sign || -1) * (Number(m.amount) || 0)
              return (
                <tr key={m.id} className={m.undated ? 'muted' : ''}>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{m.undated ? '—' : m.date}</td>
                  <td>{SOURCE_BY_KEY[m.source]?.label || m.source}</td>
                  <td><span className="ecom-kind-pill" style={{ background: `${k?.color}18`, color: k?.color }}>{k?.label}</span></td>
                  <td style={{ textAlign: 'right', color: k?.color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {signed >= 0 ? '+' : ''}{formatMoney(signed, m.currency)}
                  </td>
                  <td className="muted small" style={{ maxWidth: 320, whiteSpace: 'normal' }}>{m.note || '—'}</td>
                  <td className="muted small">{m.ref || '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-link btn-link--danger"
                      onClick={() => {
                        if (window.confirm('Supprimer ce mouvement ?')) ecom.removeMovement(m.id)
                      }}
                    >✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
