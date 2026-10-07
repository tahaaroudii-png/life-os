import { useState } from 'react'
import { useCplCap, useProductKpis, useProducts, useVerdicts } from '@/data/useBusiness'
import { money, pct } from '@/lib/format'
import { verdictLabel } from './BusinessScreen'

export function ProductsScreen({ userId }: { userId: string }) {
  const { data: products = [] } = useProducts(userId)
  const { data: kpis = [] } = useProductKpis(userId, 7)
  const { data: verdicts = [] } = useVerdicts(userId)
  const [openId, setOpenId] = useState<string | null>(null)

  if (products.length === 0) {
    return <div className="empty"><p>Aucun produit.</p></div>
  }

  return (
    <>
      {products.map((p) => {
        const k = kpis.find((x) => x.product_id === p.id)
        const v = verdicts.find((x) => x.product_id === p.id)
        const isOpen = openId === p.id
        return (
          <section className="card product" key={p.id}>
            <button className="product-head" onClick={() => setOpenId(isOpen ? null : p.id)}>
              <span className={`badge v-${v?.computed_verdict ?? 'testing'}`}>
                {verdictLabel(v?.computed_verdict ?? 'testing')}
              </span>
              <span className="product-name">{p.name}</span>
              <span className="xs muted">{p.market_key} · {v?.days_in_status ?? 0} j en {p.status}</span>
              <span className="liaison-chevron">{isOpen ? '▾' : '▸'}</span>
            </button>

            {v?.needs_action && (
              <p className="xs tone-warn" style={{ margin: '6px 0 0' }}>{v.reason}</p>
            )}

            {isOpen && k && <ProductDetail productId={p.id} k={k} />}
          </section>
        )
      })}
    </>
  )
}

function ProductDetail({ productId, k }: { productId: string; k: {
  leads: number; spend: number; confirmed: number; delivered: number; returned: number
  revenue: number; cpl: number | null; cpd: number | null
  conf_rate: number | null; deliv_rate: number | null; net_per_deliv: number | null
} }) {
  // Sous l'échantillon minimum, on prend les taux de référence plutôt que
  // des taux calculés sur 6 confirmés, qui ne veulent rien dire.
  const conf = k.leads >= 20 ? (k.conf_rate ?? 0.55) : 0.55
  const deliv = k.confirmed >= 20 ? (k.deliv_rate ?? 0.3) : 0.3
  const { data: cap } = useCplCap(productId, conf, deliv)

  const ratio = cap && cap.cpl_cap > 0 && k.cpl ? k.cpl / cap.cpl_cap : null
  const tone = ratio === null ? 'neutral' : ratio < 0.7 ? 'good' : ratio <= 1 ? 'warn' : 'crit'
  const gaugeLabel = cap && cap.cpl_cap <= 0
    ? 'Non rentable au prix actuel, quel que soit le CPL'
    : ratio === null ? '—'
    : ratio < 0.7 ? 'Marge confortable'
    : ratio <= 1 ? 'Rentable mais serré'
    : 'Tu perds de l’argent sur chaque lead'

  return (
    <div className="product-detail">
      <div className="stat-grid">
        <Stat label="Leads" value={String(k.leads)} />
        <Stat label="Dépense" value={money(k.spend)} />
        <Stat label="CPL" value={k.cpl != null ? money(k.cpl) : '—'} />
        <Stat label="CPD" value={k.cpd != null ? money(k.cpd) : '—'} />
        <Stat label="Confirmés" value={String(k.confirmed)} />
        <Stat label="Livrés" value={String(k.delivered)} />
        <Stat label="Confirmation" value={k.conf_rate != null ? pct(k.conf_rate) : '—'} />
        <Stat label="Livraison" value={k.deliv_rate != null ? pct(k.deliv_rate) : '—'} />
        <Stat label="Net / livraison" value={k.net_per_deliv != null ? money(k.net_per_deliv) : '—'} />
      </div>

      {cap && (
        <div className="cap">
          <h4>Plafond CPL</h4>
          <div className="cap-line">
            <span>Prix</span><span>{money(cap.price)}</span>
          </div>
          <div className="cap-line"><span>Coût produit</span><span>−{money(cap.cogs)}</span></div>
          <div className="cap-line"><span>Expédition</span><span>−{money(cap.shipping)}</span></div>
          <div className="cap-line total"><span>Marge par livraison</span><span>{money(cap.margin)}</span></div>
          <div className="cap-line total"><span>Plafond CPL</span><span>{money(cap.cpl_cap)}</span></div>
          <p className={`xs tone-${tone}`} style={{ margin: '8px 0 0' }}>{gaugeLabel}</p>
          <p className="xs muted" style={{ margin: '4px 0 0' }}>
            Calculé avec la grille de frais en vigueur à la date, et un taux de
            confirmation de {pct(conf)} / livraison de {pct(deliv)}.
          </p>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}
