import { useMemo, useState } from 'react'
import { useSettings } from '../hooks/useSettings'
import { useTransactions } from '../hooks/useTransactions'
import { computeMonthlyEnvelopeStates, computeSavingState, totalLoans, startOfMonth, startOfNextMonth, SALARY_DAY } from '../lib/budget'
import { SAVING_ENVELOPES } from '../lib/schema'
import BudgetRing from '../components/BudgetRing'
import NewSalaryModal from '../components/NewSalaryModal'
import QuickAddModal from '../components/QuickAddModal'
import SavingCard from '../components/SavingCard'
import { formatDH, formatPercent } from '../lib/format'

export default function Home() {
  const [salaryOpen, setSalaryOpen] = useState(false)
  // Porte la clé de l'enveloppe sur laquelle on verse, ou null.
  const [fundOpen, setFundOpen] = useState(null)
  const { settings, isLoading: settingsLoading } = useSettings()
  const { transactions, isLoading: txLoading } = useTransactions()

  const monthlyStates = useMemo(
    () => computeMonthlyEnvelopeStates(settings, transactions),
    [settings, transactions]
  )

  const savings = useMemo(
    () => SAVING_ENVELOPES
      .map((e) => computeSavingState(settings, e.key, transactions))
      .filter(Boolean),
    [settings, transactions]
  )

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

      {/* Chaque enveloppe d'épargne a sa carte et son versement : verser
          sur le mariage ne doit pas obliger à passer par le fond d'urgence. */}
      {savings.map((state) => (
        <SavingCard key={state.key} state={state} onVerser={() => setFundOpen(state.key)} />
      ))}

      <QuickAddModal
        open={fundOpen !== null}
        onClose={() => setFundOpen(null)}
        defaultEnvelope={fundOpen || 'urgence'}
      />
    </div>
  )
}
