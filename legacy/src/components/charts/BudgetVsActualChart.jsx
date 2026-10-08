import { Bar } from 'react-chartjs-2'
import '../../lib/chartSetup'
import { ENVELOPES } from '../../lib/schema'

export default function BudgetVsActualChart({ allocated, actual }) {
  const labels = ENVELOPES.map((e) => e.label)

  return (
    <Bar
      data={{
        labels,
        datasets: [
          {
            label: 'Alloué',
            data: ENVELOPES.map((e) => allocated[e.key] || 0),
            backgroundColor: '#94a3b8',
          },
          {
            label: 'Dépensé',
            data: ENVELOPES.map((e) => actual[e.key] || 0),
            backgroundColor: '#166534',
          },
        ],
      }}
      options={{
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true } },
      }}
    />
  )
}
