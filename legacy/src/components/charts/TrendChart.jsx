import { Line } from 'react-chartjs-2'
import '../../lib/chartSetup'
import { ENVELOPE_COLORS } from '../../lib/chartSetup'
import { ENVELOPES } from '../../lib/schema'
import { formatMonthLabel } from '../../lib/format'

export default function TrendChart({ series }) {
  const labels = series.map((s) => formatMonthLabel(s.month.getFullYear(), s.month.getMonth() + 1))

  const datasets = ENVELOPES.map((env) => ({
    label: env.label,
    data: series.map((s) => s.byEnvelope[env.key] || 0),
    borderColor: ENVELOPE_COLORS[env.key],
    backgroundColor: ENVELOPE_COLORS[env.key],
    tension: 0.3,
  }))

  return (
    <Line
      data={{ labels, datasets }}
      options={{
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true } },
      }}
    />
  )
}
