import { NavLink, Route, Routes } from 'react-router-dom'
import { useNetPeriod, useProductKpis, useStockAlerts, useVerdicts } from '@/data/useBusiness'
import { addDays, todayKey } from '@/lib/date'
import { EveningEntry } from './EveningEntry'
import { ProductsScreen } from './ProductsScreen'
import { money, pct } from '@/lib/format'

export function BusinessScreen({ userId }: { userId: string }) {
  return (
    <div className="app">
      <header className="screen-head"><h1>Business</h1></header>
      <nav className="subnav">
        <NavLink to="/business" end>Aperçu</NavLink>
        <NavLink to="/business/soir">Saisie du soir</NavLink>
        <NavLink to="/business/produits">Produits</NavLink>
      </nav>
      <Routes>
        <Route index element={<Overview userId={userId} />} />
        <Route path="soir" element={<EveningEntry userId={userId} />} />
        <Route path="produits" element={<ProductsScreen userId={userId} />} />
      </Routes>
    </div>
  )
}

function Overview({ userId }: { userId: string }) {
  const today = todayKey()
  const monthStart = `${today.slice(0, 7)}-01`
  const { data: net } = useNetPeriod(userId, monthStart, today)
  const { data: alerts = [] } = useStockAlerts(userId)
  const { data: verdicts = [] } = useVerdicts(userId)
  const { data: kpis = [] } = useProductKpis(userId, 30)

  const toAct = verdicts.filter((v) => v.needs_action)
  const adShare = net && net.revenue > 0 ? net.ad_spend / net.revenue : null

  return (
    <>
      <section className="hero">
        <span className="hero-label">Net du mois</span>
        <span className={`hero-value ${(net?.net ?? 0) >= 0 ? 'tone-good' : 'tone-crit'}`}>
          {money(net?.net ?? 0)}
        </span>
        <span className="xs muted">
          {money(net?.revenue ?? 0)} encaissés · {money(net?.ad_spend ?? 0)} de pub
          {adShare !== null && ` · publicité à ${pct(adShare)}`}
        </span>
      </section>

      {adShare !== null && adShare > 0.45 && (
        <div className="banner crit">
          La publicité pèse {pct(adShare)} du chiffre. Au-dessus de 45 %, tu brûles
          du cash pour trop peu de retour.
        </div>
      )}

      {alerts.map((a) => (
        <div key={`${a.product_id}-${a.market_key}`} className={`banner ${a.alert === 'rupture' ? 'crit' : 'warn'}`}>
          <strong>{a.name}</strong> · {a.message}
        </div>
      ))}

      {toAct.length > 0 && (
        <section className="card" style={{ marginTop: 16 }}>
          <h3>Décisions en attente</h3>
          {toAct.map((v) => (
            <div className="verdict-row" key={v.product_id}>
              <span className={`badge v-${v.computed_verdict}`}>{verdictLabel(v.computed_verdict)}</span>
              <span className="verdict-name">{v.name}</span>
              <span className="xs muted">{v.reason}</span>
            </div>
          ))}
        </section>
      )}

      <section className="card" style={{ marginTop: 16 }}>
        <h3>30 derniers jours</h3>
        {kpis.length === 0 && <p className="muted small">Aucun produit actif.</p>}
        {kpis.map((k) => (
          <div className="kpi-line" key={k.product_id}>
            <span className="kpi-name">{k.name}</span>
            <span className="xs muted">
              {k.leads} leads · CPL {k.cpl != null ? money(k.cpl) : '—'} ·
              conf. {k.conf_rate != null ? pct(k.conf_rate) : '—'} ·
              liv. {k.deliv_rate != null ? pct(k.deliv_rate) : '—'}
            </span>
          </div>
        ))}
      </section>

      <p className="xs muted" style={{ marginTop: 16 }}>
        Fenêtre du {addDays(today, -29)} au {today}. Les confirmés et livrés viennent
        des relevés hebdomadaires, jamais de la saisie du soir.
      </p>
    </>
  )
}

export function verdictLabel(v: string): string {
  return { scale: 'SCALE', kill: 'KILL', optimise: 'OPTIMISER', testing: 'EN TEST' }[v] ?? v
}
