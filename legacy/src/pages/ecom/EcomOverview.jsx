import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useEcom } from '../../hooks/useEcom'
import {
  KIND_BY_KEY, SOURCE_BY_KEY,
  totalRevenue, totalSpend, netTotal, netUndated,
  spendByKind, adsShare, primaryAlert, stockValue,
  cumulativeSeries, todayKey, addDays, daysBetween, formatMoney, toBase,
} from '../../lib/ecom'
import EcomFAB from '../../components/ecom/EcomFAB'

const PERIODS = [
  { key: '30',   label: '30 jours', days: 30 },
  { key: '90',   label: '90 jours', days: 90 },
  { key: 'ytd',  label: 'Cette année' },
  { key: 'all',  label: 'Tout' },
]

export default function EcomOverview() {
  const ecom = useEcom()
  const { settings, movements, positions } = ecom

  const today = todayKey()
  const [periodKey, setPeriodKey] = useState('90')

  const { fromKey, toKey } = useMemo(() => {
    if (periodKey === 'all') return { fromKey: settings.startDate, toKey: today }
    if (periodKey === 'ytd') return { fromKey: `${today.slice(0, 4)}-01-01`, toKey: today }
    const days = PERIODS.find((p) => p.key === periodKey)?.days || 90
    return { fromKey: addDays(today, -(days - 1)), toKey: today }
  }, [periodKey, settings.startDate, today])

  const revenue = totalRevenue(movements, settings)
  const spend   = totalSpend(movements, settings)
  const net     = netTotal(movements, settings)
  const undated = netUndated(movements, settings)
  const days    = daysBetween(settings.startDate, today) + 1

  const alert = primaryAlert(movements, positions, settings)
  const share = adsShare(movements, settings)
  const spendMap = spendByKind(movements, settings)
  const stockV = stockValue(positions)

  const series = useMemo(
    () => cumulativeSeries(movements, fromKey, toKey, settings),
    [movements, fromKey, toKey, settings]
  )

  const recentMovements = useMemo(
    () => [...movements].sort((a, b) => {
      const da = a.date || '0000-00-00'; const db = b.date || '0000-00-00'
      if (da !== db) return db.localeCompare(da)
      return (b.createdAt || '').localeCompare(a.createdAt || '')
    }).slice(0, 10),
    [movements]
  )

  const secondaryOfNet = toBase(net, settings.baseCurrency, settings) * (settings.rates?.[settings.displaySecondary] || 0)

  // Bandeau périodicité — indique en un coup d'oeil ce qui est fait / à faire
  const soirDone = movements.some((m) => m.kind === 'ads' && m.period === 'daily' && m.date === today)
  const dayOfWeek = new Date().getDay() // 0 = dim, 1 = lun
  const nextMonday = (8 - dayOfWeek) % 7 || 7
  const daysToMonth1 = (() => {
    const d = new Date()
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    return Math.round((next - d) / 86_400_000)
  })()

  return (
    <div className="page-ecom">
      {/* Bandeau périodicité */}
      <div className="ecom-rhythm">
        <span className={soirDone ? 'ecom-rhythm__done' : 'ecom-rhythm__todo'}>
          {soirDone ? '✓ Saisie du soir faite' : '○ Saisie du soir à faire'}
        </span>
        <span className="muted">Relevés à coller {dayOfWeek === 1 ? 'aujourd\'hui' : `dans ${nextMonday} j`}</span>
        <span className="muted">Clôture le 1ᵉʳ (dans {daysToMonth1} j)</span>
      </div>

      {/* Bandeau résultat */}
      <section className={`ecom-hero ecom-hero--${net >= 0 ? 'pos' : 'neg'}`}>
        <div>
          <div className="ecom-hero__label">Net total depuis le début</div>
          <div className="ecom-hero__value">{formatMoney(net, settings.baseCurrency)}</div>
          <div className="ecom-hero__secondary muted">
            ≈ {formatMoney(secondaryOfNet, settings.displaySecondary)}
          </div>
          {Math.abs(undated) > 0.01 && (
            <div className="ecom-hero__undated muted small">
              dont {formatMoney(undated, settings.baseCurrency)} sans date
            </div>
          )}
        </div>
        <div className="ecom-hero__side">
          <div><span className="muted small">Recettes</span><br /><strong>{formatMoney(revenue, settings.baseCurrency)}</strong></div>
          <div><span className="muted small">Dépenses</span><br /><strong>{formatMoney(spend, settings.baseCurrency)}</strong></div>
          <div><span className="muted small">Jours d'activité</span><br /><strong>{days}</strong></div>
        </div>
      </section>

      {/* Alerte unique */}
      <div className={`ecom-alert ecom-alert--${alert.tone}`}>{alert.text}</div>

      {/* Sélecteur période */}
      <div className="ecom-periods">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`chip ${periodKey === p.key ? 'chip--active' : ''}`}
            onClick={() => setPeriodKey(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Courbe net cumulé */}
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Net cumulé — {periodLabel(periodKey, fromKey, toKey)}</h2>
        <NetCurve series={series} baseCurrency={settings.baseCurrency} />
      </section>

      {/* Répartition dépenses */}
      <section className="card" style={{ marginTop: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Répartition des dépenses (total historique)</h2>
        <SpendBars spendMap={spendMap} share={share} baseCurrency={settings.baseCurrency} />
      </section>

      {/* Derniers mouvements */}
      <section className="card" style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0 }}>Derniers mouvements</h2>
          <Link to="/ecom/mouvements" className="btn-link">Tout voir</Link>
        </div>
        <table className="ecom-table">
          <thead>
            <tr><th>Date</th><th>Source</th><th>Nature</th><th style={{ textAlign: 'right' }}>Montant</th></tr>
          </thead>
          <tbody>
            {recentMovements.map((m) => {
              const k = KIND_BY_KEY[m.kind]
              const signed = (k?.sign || -1) * (Number(m.amount) || 0)
              return (
                <tr key={m.id}>
                  <td className="muted small" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {m.undated ? '—' : m.date}
                  </td>
                  <td>{SOURCE_BY_KEY[m.source]?.label || m.source}</td>
                  <td><span className="ecom-kind-pill" style={{ background: `${k?.color}18`, color: k?.color }}>{k?.label}</span></td>
                  <td style={{ textAlign: 'right', color: k?.color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {signed >= 0 ? '+' : ''}{formatMoney(signed, m.currency)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      {/* Positions ouvertes */}
      <section className="ecom-positions">
        <PositionTile
          label="Solde plateformes"
          value={sumBalances(positions.platformBalances, settings)}
          currency={settings.baseCurrency}
          detail={positions.platformBalances.filter((p) => p.amount < 0).map((p) => `${SOURCE_BY_KEY[p.source]?.label || p.source}: ${formatMoney(p.amount, p.currency)}`).join(' · ')}
        />
        <PositionTile
          label="Créances à recevoir"
          value={sumReceivables(positions.platformBalances, settings)}
          currency={settings.baseCurrency}
          detail={positions.platformBalances.filter((p) => p.amount > 0).map((p) => `${SOURCE_BY_KEY[p.source]?.label || p.source}: ${formatMoney(p.amount, p.currency)}`).join(' · ')}
        />
        <PositionTile
          label="Valeur du stock (estimé)"
          value={stockV}
          currency={settings.baseCurrency}
          detail={`${positions.stock?.reduce((s, r) => s + (Number(r.units) || 0), 0) || 0} unités au total`}
        />
      </section>

      <EcomFAB
        baseCurrency={settings.baseCurrency}
        onAdd={ecom.addMovement}
        onUndo={ecom.undoRemove}
        products={ecom.products}
        campaigns={ecom.campaigns}
        creatives={ecom.creatives}
      />
    </div>
  )
}

function periodLabel(key, fromKey, toKey) {
  if (key === 'all') return `du ${fromKey} à aujourd'hui`
  if (key === 'ytd') return `depuis le 1ᵉʳ janvier`
  return `${key} derniers jours`
}

function sumBalances(list, settings) {
  return (list || []).reduce((s, p) => s + (Number(p.amount) < 0 ? toBase(p.amount, p.currency, settings) : 0), 0)
}
function sumReceivables(list, settings) {
  return (list || []).reduce((s, p) => s + (Number(p.amount) > 0 ? toBase(p.amount, p.currency, settings) : 0), 0)
}

function PositionTile({ label, value, currency, detail }) {
  return (
    <div className="ecom-position">
      <div className="muted small">{label}</div>
      <div className={`ecom-position__value ${value < 0 ? 'ecom-position__value--neg' : 'ecom-position__value--pos'}`}>
        {formatMoney(value, currency)}
      </div>
      {detail && <div className="muted small" style={{ marginTop: '0.25rem' }}>{detail}</div>}
    </div>
  )
}

// -----------------------------------------------------------
// Mini-graphes SVG (pas de librairie)
// -----------------------------------------------------------

function NetCurve({ series, baseCurrency }) {
  const [hover, setHover] = useState(null)
  if (!series || series.length === 0) return <p className="muted small">Aucune donnée.</p>
  const W = 900, H = 240, PADX = 40, PADY = 20
  const min = Math.min(0, ...series.map((p) => p.value))
  const max = Math.max(0, ...series.map((p) => p.value))
  const span = max - min || 1
  const x = (i) => PADX + (i / (series.length - 1)) * (W - 2 * PADX)
  const y = (v) => H - PADY - ((v - min) / span) * (H - 2 * PADY)
  const path = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
  const zeroY = y(0)
  const last = series[series.length - 1]

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    let closest = 0, best = Infinity
    for (let i = 0; i < series.length; i++) {
      const d = Math.abs(x(i) - px)
      if (d < best) { best = d; closest = i }
    }
    setHover({ i: closest, p: series[closest] })
  }

  return (
    <div className="ecom-chart-wrap" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="ecom-chart">
        <line x1={PADX} x2={W - PADX} y1={zeroY} y2={zeroY} stroke="#94a3b8" strokeDasharray="4,4" />
        <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx={x(series.length - 1)} cy={y(last.value)} r="5" fill="var(--color-primary)" />
        {hover && (
          <>
            <line x1={x(hover.i)} x2={x(hover.i)} y1={PADY} y2={H - PADY} stroke="#cbd5e1" />
            <circle cx={x(hover.i)} cy={y(hover.p.value)} r="4" fill="var(--color-text)" />
          </>
        )}
      </svg>
      {hover && (
        <div className="ecom-tooltip">
          <strong>{hover.p.date}</strong> · {formatMoney(hover.p.value, baseCurrency)}
        </div>
      )}
    </div>
  )
}

function SpendBars({ spendMap, share, baseCurrency }) {
  const entries = Object.entries(spendMap)
    .map(([kind, amount]) => ({ kind, amount, k: KIND_BY_KEY[kind] }))
    .filter((e) => e.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  const total = entries.reduce((s, e) => s + e.amount, 0) || 1
  return (
    <div className="ecom-bars">
      {entries.map((e) => {
        const pct = (e.amount / total) * 100
        const isAdsAlert = e.kind === 'ads' && share > 0.45
        return (
          <div key={e.kind} className="ecom-bar">
            <div className="ecom-bar__label">
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: e.k.color, marginRight: 6 }} />
              {e.k.label}
            </div>
            <div className="ecom-bar__track">
              <div
                className="ecom-bar__fill"
                style={{ width: `${pct}%`, background: isAdsAlert ? '#dc2626' : e.k.color }}
              />
            </div>
            <div className="ecom-bar__value">{formatMoney(e.amount, baseCurrency)}</div>
            <div className="ecom-bar__pct muted small">{pct.toFixed(1)} %</div>
          </div>
        )
      })}
    </div>
  )
}
