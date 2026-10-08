import { useMemo, useState } from 'react'
import { useSettings } from '../hooks/useSettings'
import { useTransactions } from '../hooks/useTransactions'
import { computeMonthlyEnvelopeStates, computeEmergencyFundState, totalLoans, startOfMonth, startOfNextMonth } from '../lib/budget'
import BudgetRing from '../components/BudgetRing'
import NewSalaryModal from '../components/NewSalaryModal'
import { formatDH, formatPercent } from '../lib/format'

export default function Home() {
  const [salaryOpen, setSalaryOpen] = useState(false)
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
        <h1 className="page-home__title">Ce mois-ci</h1>
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

      <div className="emergency-card">
        <div className="emergency-card__header">
          <h2>🛟 Fond d'urgence</h2>
          <span className="emergency-card__pct">{formatPercent(emergency.percent)}</span>
        </div>
        <div className="envelope-card__bar-track">
          <div
            className="envelope-card__bar-fill envelope-card__bar-fill--green"
            style={{ width: `${emergency.percent}%` }}
          />
        </div>
        <div className="emergency-card__figures">
          <span>
            <strong>{formatDH(emergency.cumulated)}</strong> / {formatDH(emergency.goal)}
          </span>
          <span className="muted">
            {emergency.monthsRemaining === 0
              ? 'Objectif atteint 🎉'
              : emergency.monthsRemaining
              ? `≈ ${emergency.monthsRemaining} mois restants`
              : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}
