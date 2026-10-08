import { Doughnut } from 'react-chartjs-2'
import '../../lib/chartSetup'
import { ENVELOPE_COLORS } from '../../lib/chartSetup'
import { ENVELOPES } from '../../lib/schema'

export default function SpendingByEnvelopeChart({ monthState }) {
  const labels = ENVELOPES.map((e) => e.label)
  const data = ENVELOPES.map((e) => monthState[e.key] || 0)
  const colors = ENVELOPES.map((e) => ENVELOPE_COLORS[e.key])

  return (
    <Doughnut
      data={{
        labels,
        datasets: [{ data, backgroundColor: colors, borderWidth: 0 }],
      }}
      options={{
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
      }}
    />
  )
}
