import { useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import '../../lib/chartSetup'
import { useTasks } from '../../hooks/useTasks'
import { useTaskLogs } from '../../hooks/useTaskLogs'
import {
  AXES,
  AXIS_BY_KEY,
  addDays,
  computeDailyStats,
  streakForTask,
  todayKey,
  toDateKey,
} from '../../lib/planning'
import { formatDateFR, formatPercent } from '../../lib/format'
import StreakBoard from '../../components/planning/StreakBoard'

// Périodes d'analyse. `granularity` = comment on regroupe les jours :
//   - 'day' : un point par jour (fenêtre courte, lecture fine des motifs)
//   - 'week' : un point par semaine ISO (fenêtres moyennes)
//   - 'month' : un point par mois (fenêtres longues)
// Chaque période a aussi sa couleur d'accent pour le sélecteur, ce qui donne
// un repère visuel du grain d'analyse actuel.
const PERIODS = [
  { key: '7',   label: '1 sem.',   days: 7,   granularity: 'day',   color: '#0891b2' },
  { key: '14',  label: '2 sem.',   days: 14,  granularity: 'day',   color: '#0284c7' },
  { key: '21',  label: '3 sem.',   days: 21,  granularity: 'day',   color: '#2563eb' },
  { key: '30',  label: '1 mois',   days: 30,  granularity: 'day',   color: '#4f46e5' },
  { key: '90',  label: 'Trim.',    days: 90,  granularity: 'week',  color: '#7c3aed' },
  { key: '180', label: 'Sem.',     days: 180, granularity: 'week',  color: '#c026d3' },
  { key: '365', label: '1 an',     days: 365, granularity: 'month', color: '#db2777' },
]

// Numéro ISO de semaine (année-semaine), utile pour regrouper.
function weekKey(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const day = dt.getUTCDay() || 7
  dt.setUTCDate(dt.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((dt - yearStart) / 86_400_000 + 1) / 7)
  return `${dt.getUTCFullYear()}-S${String(week).padStart(2, '0')}`
}
function monthKeyISO(dateStr) { return dateStr.slice(0, 7) } // YYYY-MM

// Agrège la série journalière selon la granularité choisie.
// Retourne un tableau [{ bucket, total, done, byAxis }] dans l'ordre chrono.
function aggregate(daily, granularity) {
  if (granularity === 'day') return daily.map((d) => ({ bucket: d.date, ...d }))
  const keyOf = granularity === 'week' ? weekKey : monthKeyISO
  const map = new Map()
  for (const d of daily) {
    const k = keyOf(d.date)
    let acc = map.get(k)
    if (!acc) {
      acc = { bucket: k, total: 0, done: 0, byAxis: {} }
      map.set(k, acc)
    }
    acc.total += d.total
    acc.done += d.done
    for (const [ax, v] of Object.entries(d.byAxis)) {
      if (!acc.byAxis[ax]) acc.byAxis[ax] = { total: 0, done: 0 }
      acc.byAxis[ax].total += v.total
      acc.byAxis[ax].done += v.done
    }
  }
  return Array.from(map.values())
}

// Étiquette lisible d'un bucket selon la granularité.
function bucketLabel(bucket, granularity) {
  if (granularity === 'day') return bucket.slice(5) // MM-DD
  if (granularity === 'week') return bucket.slice(5) // Sxx
  // month YYYY-MM → "sept 26"
  const [y, m] = bucket.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
}

// Moyenne mobile sur `w` valeurs (pour lisser la tendance globale
// quand la granularité est jour et que la fenêtre est ≥ 14 j).
function movingAverage(values, w) {
  const out = new Array(values.length).fill(null)
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - w + 1)
    const slice = values.slice(start, i + 1).filter((v) => v != null)
    if (slice.length === 0) continue
    out[i] = Math.round(slice.reduce((a, b) => a + b, 0) / slice.length)
  }
  return out
}

export default function PlanningHistorique() {
  const [periodKey, setPeriodKey] = useState('30')
  const period = PERIODS.find((p) => p.key === periodKey) || PERIODS[2]

  const today = useMemo(() => todayKey(), [])
  const fromKey = useMemo(() => addDays(today, -(period.days - 1)), [today, period.days])
  // Fetch séparé et systématiquement large pour les streaks — les paliers
  // "Diamant" (60 j) et "Légende" (100 j) doivent rester calculables même
  // si l'utilisateur sélectionne une période courte (1 sem., 2 sem., etc.).
  const streakFromKey = useMemo(() => addDays(today, -365), [today])

  const { tasks, isLoading: tasksLoading } = useTasks()
  const { logs, isLoading: logsLoading } = useTaskLogs(fromKey, today)
  const { logs: streakLogs } = useTaskLogs(streakFromKey, today)

  const daily = useMemo(
    () => computeDailyStats(tasks, logs, fromKey, today),
    [tasks, logs, fromKey, today]
  )

  // Taux global sur la période
  const globalRate = useMemo(() => {
    const total = daily.reduce((s, d) => s + d.total, 0)
    const done = daily.reduce((s, d) => s + d.done, 0)
    return total > 0 ? done / total : 0
  }, [daily])

  // Taux par axe sur la période
  const axisRates = useMemo(() => {
    const acc = Object.fromEntries(AXES.map((a) => [a.key, { total: 0, done: 0 }]))
    for (const d of daily) {
      for (const [axisKey, v] of Object.entries(d.byAxis)) {
        if (!acc[axisKey]) continue
        acc[axisKey].total += v.total
        acc[axisKey].done += v.done
      }
    }
    return AXES.map((a) => ({
      axis: a,
      rate: acc[a.key].total > 0 ? acc[a.key].done / acc[a.key].total : 0,
      total: acc[a.key].total,
      done: acc[a.key].done,
    }))
  }, [daily])

  // Streaks : habitudes + défis progressifs actifs. Calcul basé sur
  // `streakLogs` (365 j) et non sur `logs` (fenêtre de la période sélectionnée)
  // pour ne jamais tronquer un vrai streak long.
  const habitStreaks = useMemo(() => {
    return tasks
      .filter((t) => t.active && (t.type === 'habit' || t.type === 'progressive'))
      .map((t) => ({
        task: t,
        streak: streakForTask(t.id, streakLogs, today),
      }))
      .sort((a, b) => b.streak - a.streak)
  }, [tasks, streakLogs, today])

  // Progression des défis progressifs : (date, target_value ou attendu)
  const progressiveTasks = useMemo(
    () => tasks.filter((t) => t.type === 'progressive'),
    [tasks]
  )

  // Agrégation adaptée à la période sélectionnée.
  const bucketed = useMemo(() => aggregate(daily, period.granularity), [daily, period.granularity])

  // Graphique évolution : ligne globale forte + moyenne mobile (jour uniquement,
  // sur fenêtres ≥ 14 j) + une ligne par axe (visibles par défaut sauf sur
  // fenêtres très larges où on les masque pour lisibilité).
  const globalTrendData = useMemo(() => {
    const labels = bucketed.map((b) => bucketLabel(b.bucket, period.granularity))
    const globalSeries = bucketed.map((b) => (b.total ? Math.round((b.done / b.total) * 100) : null))
    const showMA = period.granularity === 'day' && period.days >= 14
    const maWindow = period.days >= 60 ? 14 : 7

    const datasets = [
      {
        label: 'Global',
        data: globalSeries,
        borderColor: '#166534',
        backgroundColor: 'rgba(22, 101, 52, 0.12)',
        borderWidth: 2.75,
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: 0.3,
        spanGaps: true,
        fill: true,
        order: 0,
      },
    ]

    if (showMA) {
      datasets.push({
        label: `Moy. mobile ${maWindow} j`,
        data: movingAverage(globalSeries, maWindow),
        borderColor: '#052e16',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [5, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0.35,
        spanGaps: true,
        order: 1,
      })
    }

    // Sur fenêtres larges, on cache les axes par défaut : trop de lignes tuent
    // la lecture du global. Utilisateur peut les activer via la légende.
    const hideAxisByDefault = period.days > 30
    for (const a of AXES) {
      datasets.push({
        label: a.label,
        data: bucketed.map((b) => {
          const v = b.byAxis[a.key]
          if (!v || v.total === 0) return null
          return Math.round((v.done / v.total) * 100)
        }),
        borderColor: a.color,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3,
        spanGaps: true,
        hidden: hideAxisByDefault,
        order: 2,
      })
    }
    return { labels, datasets }
  }, [bucketed, period.granularity, period.days])

  const progressiveChartData = useMemo(() => {
    if (progressiveTasks.length === 0) return null
    const labels = daily.map((d) => d.date.slice(5))
    return {
      labels,
      datasets: progressiveTasks.map((t) => {
        const axis = AXIS_BY_KEY[t.axis]
        const data = daily.map((d) => {
          const log = logs.find((l) => l.task_id === t.id && toDateKey(l.log_date) === d.date)
          if (!log || !log.done) return null
          return log.target_value ?? null
        })
        return {
          label: t.title,
          data,
          borderColor: axis?.color || '#0f172a',
          backgroundColor: 'transparent',
          tension: 0.25,
          spanGaps: true,
        }
      }),
    }
  }, [progressiveTasks, daily, logs])

  if (tasksLoading || logsLoading) return <p className="muted">Chargement…</p>

  return (
    <div className="page-planning-historique">
      <div className="page-header">
        <h1>Tendances</h1>
      </div>
      <div className="period-picker" role="tablist" aria-label="Période d'analyse">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={periodKey === p.key}
            className={`period-chip ${periodKey === p.key ? 'period-chip--active' : ''}`}
            style={{
              '--period-color': p.color,
              ...(periodKey === p.key
                ? { background: p.color, borderColor: p.color, color: '#fff' }
                : {}),
            }}
            onClick={() => setPeriodKey(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <p className="muted">
        Du {formatDateFR(fromKey)} au {formatDateFR(today)} — {daily.length} jour(s), agrégés par{' '}
        <strong>{period.granularity === 'day' ? 'jour' : period.granularity === 'week' ? 'semaine' : 'mois'}</strong>.
      </p>

      {/* -------- Graphique principal — le plus important -------- */}
      <section className="card card--wide trend-hero" style={{ marginBottom: '1.25rem', borderTop: `4px solid ${period.color}` }}>
        <div className="trend-hero__head">
          <div>
            <h2 style={{ margin: 0 }}>Évolution du taux de complétion</h2>
            <p className="muted small" style={{ margin: '0.15rem 0 0' }}>
              Ligne pleine = global. Pointillé = moyenne mobile (lissage).
              Clique un axe dans la légende pour l'afficher/masquer.
            </p>
          </div>
          <div className="trend-hero__kpi">
            <div className="trend-hero__kpi-value">{formatPercent(globalRate * 100)}</div>
            <div className="trend-hero__kpi-label">moyenne sur la période</div>
          </div>
        </div>
        <div className="chart-wrap chart-wrap--trend">
          <Line
            data={globalTrendData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              animation: false,
              interaction: { mode: 'index', intersect: false },
              scales: {
                y: {
                  min: 0, max: 100,
                  ticks: { callback: (v) => `${v}%`, stepSize: 25, font: { size: 12 } },
                  grid: { color: 'rgba(148,163,184,0.18)' },
                },
                x: {
                  ticks: { autoSkip: true, maxTicksLimit: 10, maxRotation: 0, font: { size: 11 } },
                  grid: { display: false },
                },
              },
              elements: { point: { radius: 0, hoverRadius: 4 } },
              plugins: {
                legend: {
                  position: 'bottom',
                  labels: { boxWidth: 14, boxHeight: 14, padding: 10, font: { size: 12 } },
                },
                tooltip: { mode: 'index', intersect: false },
              },
            }}
          />
        </div>
      </section>

      {/* -------- Résumé global + par axe -------- */}
      <div className="dashboard-grid">
        <section className="card">
          <h2>Par axe (moyenne)</h2>
          <div className="axis-rates">
            {axisRates.map(({ axis, rate, total, done }) => (
              <div key={axis.key} className="axis-rate">
                <div className="axis-rate__head">
                  <span style={{ color: axis.color }}>{axis.icon} {axis.label}</span>
                  <span>{formatPercent(rate * 100)}</span>
                </div>
                <div className="envelope-card__bar-track">
                  <div
                    className="envelope-card__bar-fill"
                    style={{ width: `${Math.round(rate * 100)}%`, background: axis.color }}
                  />
                </div>
                <div className="muted small">{done} / {total}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>Chiffres bruts</h2>
          <div className="big-number">{formatPercent(globalRate * 100)}</div>
          <p className="muted small">
            {daily.reduce((s, d) => s + d.done, 0)} tâche(s) faites sur{' '}
            {daily.reduce((s, d) => s + d.total, 0)}.
          </p>
        </section>

        <section className="card card--wide">
          <h2>Streaks des habitudes</h2>
          {habitStreaks.length === 0 ? (
            <p className="muted">Aucune habitude active.</p>
          ) : (
            <StreakBoard streaks={habitStreaks} />
          )}
        </section>

        {progressiveChartData && (
          <section className="card card--wide">
            <h2>Progression des défis (pompes / squats)</h2>
            <div className="chart-wrap chart-wrap--progressive">
            <Line
              data={progressiveChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                elements: { point: { radius: 0, hoverRadius: 4 } },
                scales: {
                  x: { ticks: { autoSkip: true, maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } },
                  y: { grid: { color: 'rgba(148,163,184,0.15)' } },
                },
                plugins: {
                  legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12, padding: 8, font: { size: 11 } } },
                  tooltip: { mode: 'index', intersect: false },
                },
              }}
            />
            </div>
          </section>
        )}

        <section className="card card--wide">
          <h2>Calendrier</h2>
          <p className="muted small">
            Un carré par jour. Vert plein = 100%, blanc = 0%.
          </p>
          <CalendarHeatmap daily={daily} />
        </section>
      </div>
    </div>
  )
}

function CalendarHeatmap({ daily }) {
  return (
    <div className="calendar-heatmap">
      {daily.map((d) => {
        const rate = d.total ? d.done / d.total : 0
        const bg = d.total === 0
          ? 'transparent'
          : `rgba(22, 101, 52, ${0.15 + 0.85 * rate})`
        const border = d.total === 0 ? '1px dashed #cbd5e1' : '1px solid #16653430'
        return (
          <div
            key={d.date}
            className="calendar-cell"
            style={{ background: bg, border }}
            title={`${d.date} · ${d.done}/${d.total} (${Math.round(rate * 100)}%)`}
          >
            <span className="calendar-cell__day">{d.date.slice(8)}</span>
          </div>
        )
      })}
    </div>
  )
}
