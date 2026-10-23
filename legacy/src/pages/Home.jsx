import { useMemo, useState } from 'react'
import { useSettings } from '../hooks/useSettings'
import { useTransactions } from '../hooks/useTransactions'
import { computeMonthlyEnvelopeStates, computeEmergencyFundState, totalLoans, startOfMonth, startOfNextMonth, SALARY_DAY } from '../lib/budget'
import BudgetRing from '../components/BudgetRing'
import NewSalaryModal from '../components/NewSalaryModal'
import QuickAddModal from '../components/QuickAddModal'
import { formatDH, formatPercent } from '../lib/format'

export default function Home() {
  const [salaryOpen, setSalaryOpen] = useState(false)
  const [fundOpen, setFundOpen] = useState(false)
  const { settings, isLoading: settingsLoading } = useSettings()
  const { transactions, isLoading: txLoading } = useTransactions()

  const monthlyStates = useMemo(
    () => computeMonthlyEnvelopeStates(settings, transactions),
    [settings, transactions]
  )

  const urgenceTx = useMemo(() => transactions.filter((t) => t.envelope === 'urgence'), [transactions])
  const emergency = useMemo(() => computeEmergencyFundState(settings, urgenceTx), [settings, urgenceTx])

  // Prêts sur salaire M+1 : total du mois courant, à rembourser au prochain salaire
  const monthLoans = useMemo(() => {
    const from = startOfMonth()
    const to = startOfNextMonth()
    return totalLoans(transactions, from, to)
  }, [transactions])
  const nextMonthLabel = useMemo(() => (
    startOfNextMonth().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  ), [])

  // Le mois budgétaire court du 20 au 19 : les chiffres ci-dessous ne sont
  // pas ceux du mois civil, il faut le dire plutôt que le laisser deviner.
  const periode = useMemo(() => {
    const d = (x) => x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    const fin = new Date(startOfNextMonth().getTime() - 1)
    return `${d(startOfMonth())} → ${d(fin)}`
  }, [])
  const joursAvantSalaire = useMemo(() => {
    const ms = startOfNextMonth().getTime() - Date.now()
    return Math.max(0, Math.ceil(ms / 86400000))
  }, [])

  if (settingsLoading || txLoading) {
    return <p className="muted">Chargement…</p>
  }

  if (!settings) {
    return (
      <p className="error-text">
        Aucun réglage trouvé pour ce compte. Vérifiez que la table <code>settings</code> a bien été
        créée à l'inscription.
      </p>
    )
  }

  return (
    <div className="page-home">
      <div className="page-home__header">
        <div>
          <h1 className="page-home__title">Depuis le salaire</h1>
          <p className="period-line">
            {periode} · encore {joursAvantSalaire} j avant le {SALARY_DAY}
          </p>
        </div>
        <button type="button" className="btn-salary" onClick={() => setSalaryOpen(true)} title="Enregistrer un nouveau salaire mensuel">
          💰 Nouveau salaire
        </button>
      </div>
      <NewSalaryModal open={salaryOpen} onClose={() => setSalaryOpen(false)} />

      {monthLoans > 0 && (
        <div className="loan-strip" title="Prêt sur le salaire à venir">
          🔄 <strong>{formatDH(monthLoans)}</strong> prêté ce mois — à rembourser en {nextMonthLabel}
        </div>
      )}

      <p className="muted page-home__subtitle">
        Tape un cercle pour basculer entre <strong>consommé</strong> et <strong>restant</strong>.
      </p>

      <div className="budget-rings">
        {monthlyStates.map((state) => (
          <BudgetRing key={state.key} {...state} />
        ))}
      </div>

      <section className="fund">
        <header className="fund__head">
          <h2>Fond d’urgence</h2>
          <span className="fund__pct">{formatPercent(emergency.percent)}</span>
        </header>

        {/* Le solde en grand : c'est le seul chiffre qu'il vient chercher. */}
        <p className="fund__amount">
          {formatDH(emergency.cumulated)}
          <span> sur {formatDH(emergency.goal)}</span>
        </p>

        <div className="fund__track">
          <div className="fund__fill" style={{ width: `${Math.min(100, emergency.percent)}%` }} />
        </div>

        <p className="fund__eta">
          {emergency.monthsRemaining === 0
            ? 'Objectif atteint.'
            : emergency.monthsRemaining
            ? `Au rythme actuel, atteint dans ${emergency.monthsRemaining} mois.`
            : 'Fixe un objectif dans Réglages pour suivre la progression.'}
        </p>

        {/* D'où sort ce total. Un solde sans sa composition ne se vérifie
            pas : quand il paraît faux, on ne sait pas quoi corriger. */}
        <dl className="fund__detail">
          <div>
            <dt>Mis de côté chaque mois</dt>
            <dd>{formatDH(emergency.totalAllocated)}</dd>
          </div>
          <div>
            <dt>Versements</dt>
            <dd className={emergency.totalDeposited > 0 ? 'is-plus' : ''}>
              {emergency.totalDeposited > 0 ? `+ ${formatDH(emergency.totalDeposited)}` : '—'}
            </dd>
          </div>
          <div>
            <dt>Retraits</dt>
            <dd className={emergency.totalSpent > 0 ? 'is-minus' : ''}>
              {emergency.totalSpent > 0 ? `− ${formatDH(emergency.totalSpent)}` : '—'}
            </dd>
          </div>
        </dl>

        <button type="button" className="btn-secondary fund__add" onClick={() => setFundOpen(true)}>
          Verser une somme
        </button>
      </section>

      <QuickAddModal open={fundOpen} onClose={() => setFundOpen(false)} defaultEnvelope="urgence" />
    </div>
  )
}
