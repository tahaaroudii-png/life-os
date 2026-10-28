import { useMemo, useState, useSyncExternalStore } from 'react'
import { useSettings } from '../hooks/useSettings'
import { useTransactions } from '../hooks/useTransactions'
import {
  computeEmergencyFundState, computeEmergencyFundHistory, cleanNote,
} from '../lib/budget'
import {
  computeFloor, computeDailyLeft, computeLeaks, comparePeriods, byNature, categoryHistory,
} from '../lib/analysis'
import { CATEGORIES, DIVERS, setOverride, categoryOf } from '../lib/categories'
import { formatDH } from '../lib/format'
import { TX_COLS } from '../lib/schema'
import EmergencyFundChart from '../components/charts/EmergencyFundChart'
import '../styles/analyse.css'

/* Les corrections de catégorie vivent dans le navigateur ; on les relit
   dès qu'elles changent, sans recharger la page. */
function subscribe(cb) {
  window.addEventListener('budget-categories-changed', cb)
  return () => window.removeEventListener('budget-categories-changed', cb)
}
function useOverrides() {
  const raw = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem('budget.categories.v1') || '{}',
    () => '{}'
  )
  return useMemo(() => { try { return JSON.parse(raw) } catch { return {} } }, [raw])
}

const fr = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

export default function Dashboard() {
  const { settings, isLoading: settingsLoading } = useSettings()
  const { transactions, isLoading: txLoading } = useTransactions()
  const overrides = useOverrides()
  const [open, setOpen] = useState(null)

  const floor = useMemo(() => computeFloor(transactions, overrides), [transactions, overrides])
  const daily = useMemo(() => computeDailyLeft(settings, transactions), [settings, transactions])
  const leaks = useMemo(() => computeLeaks(transactions, overrides), [transactions, overrides])
  const compare = useMemo(() => comparePeriods(transactions, overrides), [transactions, overrides])
  const natures = useMemo(() => byNature(compare.rows), [compare])
  const history = useMemo(() => categoryHistory(transactions, overrides, 4), [transactions, overrides])

  const urgenceTx = useMemo(() => transactions.filter((t) => t.envelope === 'urgence'), [transactions])
  const emergency = useMemo(() => computeEmergencyFundState(settings, urgenceTx), [settings, urgenceTx])
  const emergencyHistory = useMemo(
    () => computeEmergencyFundHistory(settings, urgenceTx, 6), [settings, urgenceTx]
  )

  if (settingsLoading || txLoading) return <p className="muted">Chargement…</p>
  if (!settings) return <p className="error-text">Aucun réglage trouvé pour ce compte.</p>

  const income = Number(settings.monthly_income) || 0
  const margin = income - floor.floor
  const max = Math.max(...compare.rows.map((r) => Math.abs(r.total)), 1)
  const overBudget = daily.remaining < 0

  return (
    <div className="page-analyse">
      <header className="analyse__header">
        <h1>Analyse</h1>
        <p className="analyse__period">{compare.currentLabel}</p>
      </header>

      {/* ---------- Les quatre réponses ---------- */}
      <div className="answers">
        <article className="answer">
          <p className="answer__q">Mon plancher</p>
          <p className="answer__v">{formatDH(floor.floor)}</p>
          <p className="answer__s">
            {floor.basedOn > 0
              ? <>part chaque mois quoi qu'il arrive · marge réelle <strong>{formatDH(margin)}</strong></>
              : <>pas encore de période complète pour le mesurer</>}
          </p>
        </article>

        <article className={`answer ${overBudget ? 'answer--alert' : ''}`}>
          <p className="answer__q">Par jour jusqu'au 20</p>
          <p className="answer__v">{overBudget ? formatDH(0) : formatDH(daily.perDay)}</p>
          <p className="answer__s">
            {overBudget
              ? <>budget dépassé de <strong>{formatDH(-daily.remaining)}</strong></>
              : <>{formatDH(daily.remaining)} restants · {daily.daysLeft} jour{daily.daysLeft > 1 ? 's' : ''}</>}
          </p>
        </article>

        <article className="answer">
          <p className="answer__q">Mon plus gros poste</p>
          <p className="answer__v">{compare.rows[0] ? formatDH(compare.rows[0].total) : '—'}</p>
          <p className="answer__s">
            {compare.rows[0]
              ? <>{compare.rows[0].icon} {compare.rows[0].label}</>
              : <>rien de dépensé sur cette période</>}
          </p>
        </article>

        <article className={`answer ${leaks.total > 0 ? 'answer--leak' : ''}`}>
          <p className="answer__q">Perdu pour rien</p>
          <p className="answer__v">{formatDH(leaks.period)}</p>
          <p className="answer__s">
            {leaks.total > 0
              ? <>amendes, frais, pertes · <strong>{formatDH(leaks.total)}</strong> au total</>
              : <>aucune amende ni frais ce mois-ci</>}
          </p>
        </article>
      </div>

      {/* ---------- Où part l'argent ---------- */}
      <section className="card">
        <div className="card__head">
          <h2>Où part l'argent</h2>
          <span className="muted small">{formatDH(compare.totalCurrent)}</span>
        </div>
        {compare.rows.length === 0 && <p className="muted">Rien d'enregistré sur cette période.</p>}
        <ul className="catlist">
          {compare.rows.map((r) => (
            <li key={r.key} className="catrow">
              <button
                type="button"
                className="catrow__head"
                onClick={() => setOpen(open === r.key ? null : r.key)}
              >
                <span className="catrow__name">{r.icon} {r.label}</span>
                <span className="catrow__amount">{formatDH(r.total)}</span>
              </button>
              <div className="catrow__bar">
                <span style={{ width: `${Math.max(2, (Math.abs(r.total) / max) * 100)}%` }} />
              </div>
              <p className="catrow__meta">
                <span className="muted">{Math.round((r.total / (compare.totalCurrent || 1)) * 100)}% · {r.count} dépense{r.count > 1 ? 's' : ''}</span>
                {r.delta !== null && Math.abs(r.delta) >= 1 && (
                  <span className={r.delta > 0 ? 'delta delta--up' : 'delta delta--down'}>
                    {r.delta > 0 ? '▲' : '▼'} {formatDH(Math.abs(r.delta))}
                  </span>
                )}
                {r.previous === null && <span className="delta delta--new">nouveau</span>}
              </p>

              {open === r.key && (
                <ul className="catrow__items">
                  {r.items
                    .slice()
                    .sort((a, b) => new Date(b[TX_COLS.occurredAt]) - new Date(a[TX_COLS.occurredAt]))
                    .map((tx) => (
                      <li key={tx.id}>
                        <span className="muted small">{fr(tx[TX_COLS.occurredAt])}</span>
                        <span className="catrow__label">{cleanNote(tx.note) || <em className="muted">sans libellé</em>}</span>
                        <span className="catrow__sum">{formatDH(Number(tx.amount))}</span>
                        <select
                          className="catrow__select"
                          value={categoryOf(tx, overrides).key}
                          onChange={(e) => setOverride(tx.id, e.target.value)}
                          aria-label="Changer la catégorie"
                        >
                          {[...CATEGORIES, DIVERS].map((c) => (
                            <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
                          ))}
                        </select>
                      </li>
                    ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {compare.hasPrevious && (
          <p className="muted small analyse__vs">
            Période précédente ({compare.previousLabel}) : {formatDH(compare.totalPrevious)}
          </p>
        )}
      </section>

      {/* ---------- Fixe / variable / exceptionnel ---------- */}
      <section className="card">
        <div className="card__head"><h2>Ce qui est subi, ce qui se décide</h2></div>
        <ul className="natures">
          {natures.map((n) => {
            const tot = natures.reduce((s, x) => s + x.total, 0) || 1
            return (
              <li key={n.key} className={`nature nature--${n.key}`}>
                <p className="nature__top">
                  <span>{n.label}</span>
                  <strong>{formatDH(n.total)}</strong>
                </p>
                <div className="nature__bar"><span style={{ width: `${(n.total / tot) * 100}%` }} /></div>
                <p className="muted small">{n.help}</p>
              </li>
            )
          })}
        </ul>
      </section>

      {/* ---------- Tendance par poste ---------- */}
      {history.length > 1 && (
        <section className="card">
          <div className="card__head"><h2>Tendance par poste</h2></div>
          <div className="histo">
            <table>
              <thead>
                <tr>
                  <th>Poste</th>
                  {history.map((p) => <th key={p.label}>{p.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {compare.rows.slice(0, 8).map((r) => (
                  <tr key={r.key}>
                    <td className="histo__name">{r.icon} {r.label}</td>
                    {history.map((p) => {
                      const v = p.rows.find((x) => x.key === r.key)?.total || 0
                      return <td key={p.label} className={v ? '' : 'muted'}>{v ? formatDH(v) : '—'}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---------- Les fuites, en clair ---------- */}
      {leaks.items.length > 0 && (
        <section className="card card--leak">
          <div className="card__head">
            <h2>Argent perdu</h2>
            <span className="muted small">{formatDH(leaks.total)} depuis le début</span>
          </div>
          <ul className="leaks">
            {leaks.items.slice(0, 8).map(({ tx, cat }) => (
              <li key={tx.id}>
                <span className="muted small">{fr(tx[TX_COLS.occurredAt])}</span>
                <span>{cat.icon} {cleanNote(tx.note) || cat.label}</span>
                <strong>{formatDH(Number(tx.amount))}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- Fond d'urgence ---------- */}
      <section className="card">
        <div className="card__head">
          <h2>Fond d'urgence</h2>
          <span className="muted small">{formatDH(emergency.cumulated)} / {formatDH(emergency.goal)}</span>
        </div>
        <EmergencyFundChart history={emergencyHistory} goal={emergency.goal} />
      </section>
    </div>
  )
}
