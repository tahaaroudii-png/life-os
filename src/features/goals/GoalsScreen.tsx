import { useState } from 'react'
import { useGoalProgress } from '@/data/useGoals'
import { DOMAIN_VAR } from '@/ui/DomainColor'
import { paceVerdict, VERDICT_LABEL, VERDICT_TONE } from '@/domain/progress'
import { todayKey, daysBetween } from '@/lib/date'
import type { GoalProgressRow } from '@/db/types'

const DEADLINE = '2026-12-31'

export function GoalsScreen({ userId }: { userId: string }) {
  const { data: rows = [], isLoading } = useGoalProgress(userId)
  // Les objectifs privés sont masqués par défaut : l'écran peut être
  // ouvert devant quelqu'un.
  const [showPrivate, setShowPrivate] = useState(false)
  const visible = rows.filter((r) => showPrivate || !r.is_private)
  const hiddenCount = rows.length - rows.filter((r) => !r.is_private).length

  return (
    <div className="app">
      <header className="screen-head">
        <h1>Objectifs</h1>
        <span className="date">{Math.max(0, daysBetween(todayKey(), DEADLINE))} jours restants</span>
      </header>

      {isLoading && <p className="muted small">Chargement…</p>}
      {!isLoading && rows.length === 0 && (
        <div className="empty">
          <p>Aucun objectif.</p>
          <p className="small">Lance l’amorçage depuis Plus → Réglages pour créer ceux de 2026.</p>
        </div>
      )}

      <div>
        {visible.map((row) => <GoalRow key={row.goal_id} row={row} />)}
      </div>

      {hiddenCount > 0 && (
        <button className="btn" style={{ marginTop: 16 }}
                onClick={() => setShowPrivate((v) => !v)}>
          {showPrivate ? 'Masquer' : `Afficher les ${hiddenCount} objectifs privés`}
        </button>
      )}
    </div>
  )
}

function GoalRow({ row }: { row: GoalProgressRow }) {
  const color = DOMAIN_VAR[row.domain]
  const verdict = paceVerdict(row.pace_factor)
  const tone = VERDICT_TONE[verdict]

  // Un métrique non branché n'a pas encore de valeur : on le dit, plutôt
  // que d'afficher un zéro qui ressemble à un échec.
  if (row.real_value === null || row.target_value === null) {
    return (
      <div className="goal">
        <div className="goal-head">
          <span className="goal-name">
            <span className="axis-dot" style={{ background: color }} />
            {row.label}
          </span>
          <span className="goal-pct muted">—</span>
        </div>
        <p className="xs muted" style={{ margin: '4px 0 0' }}>
          {row.kind === 'metric'
            ? 'Branché sur le business, disponible au lot 3.'
            : 'Suivi par jalons, pas par un nombre.'}
        </p>
      </div>
    )
  }

  const ratio = row.real_ratio ?? 0
  const unit = row.unit ?? ''

  return (
    <div className="goal">
      <div className="goal-head">
        <span className="goal-name">
          <span className="axis-dot" style={{ background: color }} />
          {row.label_ar ?? row.label}
        </span>
        <span className="goal-pct">{Math.round(ratio * 100)} %</span>
      </div>

      {/* Trois positions sur la même règle : où tu es, où tu devrais être,
          où tu finiras si rien ne change. Un pourcentage seul ne dit rien. */}
      <div className="gauge" style={{ ['--axis' as string]: color }}>
        <div className="gauge-track">
          <div className="gauge-proj"
               style={{ left: pc(ratio), width: pc(Math.max(0, (row.projected_ratio ?? ratio) - ratio)) }} />
          <div className="gauge-real" style={{ width: pc(ratio) }} />
          <div className="gauge-tick" style={{ left: pc(row.expected_ratio ?? 0) }}
               title={`attendu à date : ${fmt(row.expected_value ?? 0)} ${unit}`} />
        </div>
        <div className="gauge-legend">
          <span>{fmt(row.real_value)} sur {fmt(row.target_value)} {plural(row.target_value, unit)}</span>
          <span>attendu {fmt(row.expected_value ?? 0)}</span>
        </div>
      </div>

      <div className="goal-foot">
        <span>projection {Math.round((row.projected_ratio ?? ratio) * 100)} %</span>
        <span className={`tone-${tone}`}>{VERDICT_LABEL[verdict]}</span>
      </div>

      {verdict !== 'on_track' && row.required_per_day != null && row.days_left > 0 && (
        <p className="xs muted" style={{ margin: '6px 0 0' }}>
          {verdict === 'unreachable'
            ? `Il faudrait ${fmt(row.required_per_day)} ${plural(row.required_per_day, unit)} par jour sur ${row.days_left} jours restants. À renégocier.`
            : `${fmt(row.required_per_day)} ${plural(row.required_per_day, unit)} par jour pour y arriver.`}
        </p>
      )}
    </div>
  )
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',')
}

/** « 19,5 versets », pas « 19.5 verset ». */
function plural(n: number, unit: string): string {
  return unit && n >= 2 && !unit.endsWith('s') ? `${unit}s` : unit
}

function pc(r: number): string {
  return `${Math.min(100, Math.max(0, r * 100)).toFixed(1)}%`
}
