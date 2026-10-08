import { useMemo, useState } from 'react'
import { useEcom } from '../../hooks/useEcom'
import {
  MARKETS, MARKET_BY_KEY, PRODUCT_STATUS,
  productKPIs, computeCPLCap, cplGauge, verdictFor, formatMoney,
} from '../../lib/ecom'

const NEW_PRODUCT = () => ({
  name: '', market: 'KSA', platform: 'codpartner', status: 'testing',
  sku: '', cogs: '', single: '', bundle2: '', bundle3: '', s13Score: '',
  launchedAt: new Date().toISOString().slice(0, 10),
})

export default function EcomProduits() {
  const ecom = useEcom()
  const { products, movements, daily, campaigns, settings } = ecom
  const [windowDays, setWindowDays] = useState(7)
  const [draft, setDraft] = useState(NEW_PRODUCT())
  const [openId, setOpenId] = useState(null)

  const rows = useMemo(() => {
    return products.map((p) => {
      const kpis = productKPIs({ product: p, movements, daily, campaigns, settings, days: windowDays })
      // Utilise variant "bundle2" par défaut si dispo, sinon "single"
      const variant = p.pricing?.bundle2 ? 'bundle2' : 'single'
      const cap = computeCPLCap({
        product: p, variant,
        confRate: kpis.leads >= 20 ? kpis.confRate : (settings.decisionRules?.defaultConfRate || 0.55),
        delivRate: kpis.leads >= 20 ? kpis.delivRate : (settings.decisionRules?.defaultDelivRate || 0.30),
        settings,
      })
      const gauge = cplGauge(kpis, cap.plafondCPL)
      const verdict = verdictFor({ kpis, rules: settings.decisionRules })
      return { product: p, kpis, cap, gauge, verdict, variant }
    })
  }, [products, movements, daily, campaigns, settings, windowDays])

  async function handleCreate(e) {
    e.preventDefault()
    if (!draft.name.trim()) return
    const pricing = {}
    if (draft.single)  pricing.single  = { price: Number(draft.single), currency: MARKET_BY_KEY[draft.market].currency }
    if (draft.bundle2) pricing.bundle2 = { price: Number(draft.bundle2), currency: MARKET_BY_KEY[draft.market].currency }
    if (draft.bundle3) pricing.bundle3 = { price: Number(draft.bundle3), currency: MARKET_BY_KEY[draft.market].currency }
    ecom.addProduct({
      name: draft.name.trim(),
      market: draft.market,
      platform: draft.platform,
      status: draft.status,
      sku: draft.sku.split(',').map((s) => s.trim()).filter(Boolean),
      cogs: Number(draft.cogs) || 0,
      pricing,
      s13Score: draft.s13Score ? Number(draft.s13Score) : null,
      launchedAt: draft.launchedAt,
    })
    setDraft(NEW_PRODUCT())
  }

  return (
    <div className="page-ecom-produits">
      <div className="page-header">
        <h1>Produits</h1>
        <div className="ecom-periods">
          {[7, 30].map((d) => (
            <button key={d} type="button"
              className={`chip ${windowDays === d ? 'chip--active' : ''}`}
              onClick={() => setWindowDays(d)}>{d} jours</button>
          ))}
        </div>
      </div>

      <section className="card card--wide">
        <table className="ecom-table">
          <thead>
            <tr>
              <th>Produit</th><th>Marché</th><th>Statut</th>
              <th>Leads</th><th>Conf.</th><th>Livré</th>
              <th>CPL</th><th>C/Livrée</th><th>Net/Livr.</th>
              <th>Jauge</th><th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ product, kpis, cap, gauge, verdict, variant }) => (
              <tr key={product.id}>
                <td>
                  <button type="button" className="btn-link" onClick={() => setOpenId((id) => id === product.id ? null : product.id)}>
                    <strong>{product.name}</strong>
                  </button>
                  <div className="muted small">SKUs : {(product.sku || []).join(', ') || '—'}</div>
                </td>
                <td>{MARKET_BY_KEY[product.market]?.label || product.market}</td>
                <td><span className="muted small">{PRODUCT_STATUS.find((s) => s.key === product.status)?.label}</span></td>
                <td style={{ textAlign: 'right' }}>{kpis.leads}</td>
                <td style={{ textAlign: 'right' }}>{(kpis.confRate * 100).toFixed(0)} %</td>
                <td style={{ textAlign: 'right' }}>{(kpis.delivRate * 100).toFixed(0)} %</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(kpis.cpl)}</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(kpis.cpd)}</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(kpis.netPerDeliv)}</td>
                <td><CPLGauge gauge={gauge} plafond={cap.plafondCPL} variant={variant} /></td>
                <td><span className={`verdict verdict--${verdict.tone}`}>{verdict.label}</span></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={11} className="muted">Aucun produit. Ajoute ton premier ci-dessous.</td></tr>}
          </tbody>
        </table>

        {rows.filter(({ product }) => openId === product.id).map(({ product, kpis, cap, gauge, verdict }) => (
          <div key={product.id} className="product-detail card" style={{ marginTop: '0.75rem' }}>
            <h3 style={{ marginTop: 0 }}>{product.name} — détail</h3>
            <div className="be-result">
              <div>
                <div className="muted small">Plafond CPL ({cap.variant})</div>
                <div className="be-result__value">{formatMoney(cap.plafondCPL)}</div>
              </div>
              <div>
                <div className="muted small">Marge par livraison</div>
                <div className="be-result__value">{formatMoney(cap.margeParLivraison)}</div>
              </div>
              <div>
                <div className="muted small">Ratio CPL réel / plafond</div>
                <div className={`be-result__value verdict--${gauge.tone}`}>{gauge.ratio === Infinity ? '∞' : gauge.ratio.toFixed(2)}×</div>
              </div>
            </div>
            <p className="muted small" style={{ marginTop: '0.5rem' }}>
              État : <strong>{gauge.label}</strong> · Verdict : <strong>{verdict.label}</strong>
              {verdict.reason && <> — {verdict.reason}</>}
            </p>
            <p className="muted small">
              Fenêtre : {kpis.windowFrom} → {kpis.windowTo} · Dépense pub : {formatMoney(kpis.spend)} · Rev. attribué : {formatMoney(kpis.revenue)}
            </p>
          </div>
        ))}
      </section>

      <section className="settings-form" style={{ marginTop: '1rem', maxWidth: 'unset' }}>
        <h2 style={{ marginTop: 0 }}>Nouveau produit</h2>
        <form onSubmit={handleCreate}>
          <div className="form-row">
            <div>
              <label>Nom</label>
              <input type="text" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Ex. Speaker 5-en-1" />
            </div>
            <div>
              <label>Marché</label>
              <select value={draft.market} onChange={(e) => setDraft((d) => ({ ...d, market: e.target.value }))}>
                {MARKETS.map((m) => <option key={m.key} value={m.key}>{m.label} ({m.currency})</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>SKUs (séparés par virgule)</label>
              <input type="text" value={draft.sku} onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))} placeholder="CopOuadiiSpeakerBlack, CopOuadiiSpeakerWhite" />
            </div>
            <div>
              <label>Statut</label>
              <select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}>
                {PRODUCT_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
            <div><label>Prix 1 unité</label><input type="number" step="0.01" value={draft.single} onChange={(e) => setDraft((d) => ({ ...d, single: e.target.value }))} /></div>
            <div><label>Prix bundle 2</label><input type="number" step="0.01" value={draft.bundle2} onChange={(e) => setDraft((d) => ({ ...d, bundle2: e.target.value }))} /></div>
            <div><label>Prix bundle 3</label><input type="number" step="0.01" value={draft.bundle3} onChange={(e) => setDraft((d) => ({ ...d, bundle3: e.target.value }))} /></div>
            <div><label>COGS ($)</label><input type="number" step="0.01" value={draft.cogs} onChange={(e) => setDraft((d) => ({ ...d, cogs: e.target.value }))} /></div>
            <div><label>Score S13</label><input type="number" step="0.1" value={draft.s13Score} onChange={(e) => setDraft((d) => ({ ...d, s13Score: e.target.value }))} /></div>
            <div><label>Lancement</label><input type="date" value={draft.launchedAt} onChange={(e) => setDraft((d) => ({ ...d, launchedAt: e.target.value }))} /></div>
          </div>
          <button type="submit" className="btn-primary" disabled={!draft.name.trim()}>Ajouter</button>
        </form>
      </section>
    </div>
  )
}

function CPLGauge({ gauge, plafond, variant }) {
  const pct = Math.min(100, gauge.ratio === Infinity ? 100 : gauge.ratio * 100)
  const color = gauge.tone === 'good' ? '#16a34a' : gauge.tone === 'warn' ? '#ea580c' : '#dc2626'
  return (
    <div style={{ minWidth: 120 }}>
      <div className="envelope-card__bar-track" style={{ height: 8 }}>
        <div className="envelope-card__bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="muted small" style={{ marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
        plaf. {formatMoney(plafond)} · {variant}
      </div>
    </div>
  )
}
