import { useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { useAccounts, useCashForecast, useEnvelopes, useTransactions } from '@/data/useMoney'
import { money } from '@/lib/format'
import { formatShort, todayKey } from '@/lib/date'

export function MoneyScreen({ userId }: { userId: string }) {
  return (
    <div className="app">
      <header className="screen-head"><h1>Argent</h1></header>
      <nav className="subnav">
        <NavLink to="/argent" end>Enveloppes</NavLink>
        <NavLink to="/argent/tresorerie">Trésorerie</NavLink>
        <NavLink to="/argent/comptes">Comptes</NavLink>
      </nav>
      <Routes>
        <Route index element={<Envelopes userId={userId} />} />
        <Route path="tresorerie" element={<Forecast userId={userId} />} />
        <Route path="comptes" element={<Accounts userId={userId} />} />
      </Routes>
    </div>
  )
}

function Envelopes({ userId }: { userId: string }) {
  const { data: envelopes = [] } = useEnvelopes(userId)
  const monthStart = `${todayKey().slice(0, 7)}-01`
  const { transactions, add } = useTransactions(userId, monthStart)
  const [amount, setAmount] = useState('')
  const [env, setEnv] = useState('vie')
  const [note, setNote] = useState('')

  const loans = transactions.filter((t) => t.is_loan)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = Number(amount)
    if (!n) return
    await add.mutateAsync({
      occurred_on: todayKey(), amount: n, currency: 'MAD',
      direction: 'out', envelope_key: env, note: note.trim() || null,
    })
    setAmount(''); setNote('')
  }

  return (
    <>
      <form className="quick-add" onSubmit={submit}>
        <input className="field" inputMode="decimal" placeholder="Montant" value={amount}
               onChange={(e) => setAmount(e.target.value)} />
        <select className="field" value={env} onChange={(e) => setEnv(e.target.value)}>
          {envelopes.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
        <input className="field" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn primary" disabled={!amount || add.isPending}>Ajouter</button>
      </form>

      {envelopes.map((x) => {
        const ratio = x.allocated > 0 ? x.spent / x.allocated : 0
        const tone = ratio >= 1 ? 'crit' : ratio >= 0.8 ? 'warn' : 'good'
        return (
          <div className="goal" key={x.key}>
            <div className="goal-head">
              <span className="goal-name">{x.label}</span>
              <span className={`goal-pct tone-${tone}`}>{money(x.remaining, 'MAD')}</span>
            </div>
            <div className="bar">
              <span className="fill" style={{
                width: `${Math.min(100, ratio * 100)}%`,
                background: tone === 'crit' ? 'var(--crit)' : tone === 'warn' ? 'var(--warn)' : 'var(--good)',
              }} />
            </div>
            <div className="goal-foot">
              <span>{money(x.spent, 'MAD')} dépensés sur {money(x.allocated, 'MAD')}</span>
            </div>
          </div>
        )
      })}

      {loans.length > 0 && (
        <section className="card" style={{ marginTop: 16 }}>
          <h3>À rembourser au prochain salaire</h3>
          {loans.map((l) => (
            <div className="row" key={l.id} style={{ justifyContent: 'space-between' }}>
              <span className="small">{l.note ?? 'Prêt'}</span>
              <span className="small">{money(l.amount, 'MAD')}</span>
            </div>
          ))}
        </section>
      )}
    </>
  )
}

function Forecast({ userId }: { userId: string }) {
  const { data: rows = [], isLoading } = useCashForecast(userId)
  const firstNegative = rows.find((r) => r.running < 0)
  const floor = rows.length ? Math.min(...rows.map((r) => r.running)) : 0

  return (
    <>
      <section className="hero">
        <span className="hero-label">Capital publicitaire disponible</span>
        <span className={`hero-value ${floor >= 0 ? 'tone-good' : 'tone-crit'}`}>{money(floor)}</span>
        <span className="xs muted">Le creux du plan sur 4 semaines — c’est ce qui autorise ou non un scale.</span>
      </section>

      {firstNegative && (
        <div className="banner crit">
          Trésorerie négative à partir du {formatShort(firstNegative.week_start)}.
          Rien ne se scale avant d’avoir réglé ça.
        </div>
      )}

      {isLoading && <p className="muted small">Calcul…</p>}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Semaine</th><th>Salaire</th><th>COD</th><th>Pub</th><th>Net</th><th>Solde</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.week_start} className={r.running < 0 ? 'tone-crit' : ''}>
                <td>{formatShort(r.week_start)}</td>
                <td>{r.salary ? money(r.salary) : '—'}</td>
                <td>{money(r.cod_in)}</td>
                <td>−{money(r.ad_out)}</td>
                <td>{money(r.net)}</td>
                <td><strong>{money(r.running)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="xs muted">
        Tout est en dollars : c’est la monnaie des décisions pub. Le salaire et les
        enveloppes sont convertis au taux réglé dans Plus → Réglages.
      </p>

      <p className="xs muted" style={{ marginTop: 12 }}>
        Encaissements COD estimés au rythme observé des 30 derniers jours.
        Les réappros engagés se saisissent dans Plus → Réglages.
      </p>
    </>
  )
}

function Accounts({ userId }: { userId: string }) {
  const { data: accounts = [] } = useAccounts(userId)
  const total = accounts.reduce((s, a) => s + (a.currency === 'MAD' ? a.computed_balance / 10 : a.computed_balance), 0)

  return (
    <>
      <section className="hero">
        <span className="hero-label">Total consolidé</span>
        <span className="hero-value">{money(total)}</span>
      </section>
      {accounts.length === 0 && <div className="empty"><p>Aucun compte.</p></div>}
      {accounts.map((a) => {
        const gap = a.last_real_balance != null ? a.computed_balance - a.last_real_balance : null
        return (
          <div className="card" key={a.account_id} style={{ marginBottom: 8 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{a.name}</strong>
              <span>{money(a.computed_balance, a.currency)}</span>
            </div>
            <p className="xs muted" style={{ margin: '4px 0 0' }}>
              {a.kind} · {a.is_business ? 'business' : 'personnel'}
              {gap !== null && Math.abs(gap) > 1 && (
                <span className="tone-warn"> · écart de {money(gap, a.currency)} avec le dernier relevé</span>
              )}
              {a.last_reconciled_on && ` · rapproché le ${formatShort(a.last_reconciled_on)}`}
            </p>
          </div>
        )
      })}
    </>
  )
}
