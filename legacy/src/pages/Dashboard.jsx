import { useMemo, useState } from 'react'
import { useSettings } from '../hooks/useSettings'
import { useTransactions } from '../hooks/useTransactions'
import {
  computeMonthlyEnvelopeStates,
  computeEmergencyFundState,
  computeEmergencyFundHistory,
  computeMonthlySeries,
  allocationFor,
} from '../lib/budget'
import { ENVELOPES } from '../lib/schema'
import { formatDH } from '../lib/format'
import TrendChart from '../components/charts/TrendChart'
import SpendingByEnvelopeChart from '../components/charts/SpendingByEnvelopeChart'
import BudgetVsActualChart from '../components/charts/BudgetVsActualChart'
import EmergencyFundChart from '../components/charts/EmergencyFundChart'

const MONTHS_OPTIONS = [3, 6, 12]

export default function Dashboard() {
  const { settings, isLoading: settingsLoading } = useSettings()
  const { transactions, isLoading: txLoading } = useTransactions()
  const [monthsToShow, setMonthsToShow] = useState(6)

  const monthlyStates = useMemo(
    () => computeMonthlyEnvelopeStates(settings, transactions),
    [settings, transactions]
  )
  const urgenceTx = useMemo(() => transactions.filter((t) => t.envelope === 'urgence'), [transactions])
  const emergency = useMemo(() => computeEmergencyFundState(settings, urgenceTx), [settings, urgenceTx])
  const emergencyHistory = useMemo(
    () => computeEmergencyFundHistory(settings, urgenceTx, monthsToShow),
    [settings, urgenceTx, monthsToShow]
  )
  const series = useMemo(() => computeMonthlySeries(transactions, monthsToShow), [transactions, monthsToShow])

  const currentMonthByEnvelope = useMemo(() => {
    const map = {}
    for (const s of monthlyStates) map[s.key] = s.spent
    map.urgence = series[series.length - 1]?.byEnvelope?.urgence || 0
    return map
  }, [monthlyStates, series])

  const allocatedByEnvelope = useMemo(() => {
    const map = {}
    for (const env of ENVELOPES) map[env.key] = allocationFor(settings, env.key)
    return map
  }, [settings])

  if (settingsLoading || txLoading) return <p className="muted">Chargement…</p>
  if (!settings) return <p className="error-text">Aucun réglage trouvé pour ce compte.</p>

  return (
    <div className="page-dashboard">
      <div className="page-header">
        <h1>Analyse</h1>
        <div className="month-picker">
          {MONTHS_OPTIONS.map((m) => (
            <button
              key={m}
              className={`chip ${monthsToShow === m ? 'chip--active' : ''}`}
              onClick={() => setMonthsToShow(m)}
              type="button"
            >
              {m} mois
            </button>
          ))}
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <h2>Répartition ce mois-ci</h2>
          <SpendingByEnvelopeChart monthState={currentMonthByEnvelope} />
        </section>

        <section className="card">
          <h2>Budget vs réel (ce mois-ci)</h2>
          <BudgetVsActualChart allocated={allocatedByEnvelope} actual={currentMonthByEnvelope} />
        </section>

        <section className="card card--wide">
          <h2>Tendance des dépenses par enveloppe</h2>
          <TrendChart series={series} />
        </section>

        <section className="card card--wide">
          <h2>Progression du fond d'urgence</h2>
          <p className="muted">
            {formatDH(emergency.cumulated)} / {formatDH(emergency.goal)} — allocation mensuelle{' '}
            {formatDH(emergency.monthlyAllocation)}
          </p>
          <EmergencyFundChart history={emergencyHistory} goal={emergency.goal} />
        </section>
      </div>
    </div>
  )
}
