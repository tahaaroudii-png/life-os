import { Line } from 'react-chartjs-2'
import '../../lib/chartSetup'
import { formatMonthLabel } from '../../lib/format'

export default function EmergencyFundChart({ history, goal }) {
  const labels = history.map((h) => formatMonthLabel(h.month.getFullYear(), h.month.getMonth() + 1))
  const data = history.map((h) => h.cumulated)

  return (
    <Line
      data={{
        labels,
        datasets: [
          {
            label: "Fond d'urgence cumulé",
            data,
            borderColor: '#16a34a',
            backgroundColor: 'rgba(22,163,74,0.15)',
            fill: true,
            tension: 0.3,
          },
          {
            label: 'Objectif',
            data: history.map(() => goal),
            borderColor: '#dc2626',
            borderDash: [6, 4],
            pointRadius: 0,
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
