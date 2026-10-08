import { useMemo } from 'react'
import { useEcom } from '../../hooks/useEcom'
import { stockAlerts, stockRowMetrics, formatMoney, todayKey } from '../../lib/ecom'

export default function EcomStock() {
  const ecom = useEcom()
  const alerts = useMemo(() => stockAlerts(ecom.state), [ecom.state])
  const t = todayKey()

  const rows = (ecom.positions.stock || []).map((row) => {
    const product = ecom.products.find((p) => (p.sku || []).includes(row.sku))
    const m = stockRowMetrics({ row, product, daily: ecom.daily, campaigns: ecom.campaigns, movements: ecom.movements, todayK: t })
    return { row, product, m }
  })

  const totalValue = rows.reduce((s, r) => s + r.m.valueImmob, 0)
  const totalUnits = rows.reduce((s, r) => s + r.m.units, 0)

  return (
    <div className="page-ecom-stock">
      <div className="page-header"><h1>Stock</h1></div>

      <section className="biz-hero">
        <div className="biz-hero__box">
          <div className="biz-hero__label">Unités en stock</div>
          <div className="biz-hero__value">{totalUnits}</div>
        </div>
        <div className="biz-hero__box">
          <div className="biz-hero__label">Valeur immobilisée</div>
          <div className="biz-hero__value">{formatMoney(totalValue)}</div>
        </div>
        <div className="biz-hero__box">
          <div className="biz-hero__label">Alertes</div>
          <div className="biz-hero__value">{alerts.length}</div>
        </div>
      </section>

      {alerts.length > 0 && (
        <section className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ marginTop: 0 }}>Alertes</h2>
          <ul className="stock-alerts">
            {alerts.map((a) => (
              <li key={a.key} className={`stock-alert ${a.tone === 'crit' ? 'stock-alert--crit' : ''}`}>
                <span>{a.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card card--wide">
        <h2 style={{ marginTop: 0 }}>Positions</h2>
        <table className="ecom-table">
          <thead>
            <tr>
              <th>SKU</th><th>Produit</th><th>Entrepôt</th>
              <th>Unités</th><th>Coût u.</th><th>Valeur</th>
              <th>Livrés 30 j</th><th>Couverture</th><th>Dernier mvt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ row, product, m }, i) => (
              <tr key={i}>
                <td><code>{row.sku}</code></td>
                <td>{product?.name || <span className="muted">—</span>}</td>
                <td>{row.warehouse}</td>
                <td style={{ textAlign: 'right' }}>{m.units}</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(m.unitCost)}</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(m.valueImmob)}</td>
                <td style={{ textAlign: 'right' }}>{m.delivered30}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{m.coverage === Infinity ? '∞' : `${m.coverage} j`}</td>
                <td className="muted small">{m.lastMovement || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Les positions se modifient dans <strong>Réglages</strong>. Les livraisons sont comptées depuis les entrées <em>daily</em> des campagnes du produit.</p>
      </section>
    </div>
  )
}
