import { useMemo, useState } from 'react'
import { useGoals } from '../../hooks/useGoals'
import { annualProgress, DOMAINS } from '../../lib/goals'
import { todayKey, toDateKey } from '../../lib/planning'

/**
 * Les objectifs de l'année, sur l'écran où se décide la journée.
 *
 * Planifier sans eux revient à ranger des tâches ; l'enjeu est de voir, au
 * moment de choisir, ce qui est en retard. D'où trois positions sur une
 * même règle — où tu es, où tu devrais être aujourd'hui, où tu finiras au
 * rythme actuel — et un mot plutôt qu'un pourcentage nu.
 *
 * Les objectifs privés restent masqués : cet écran s'ouvre n'importe où.
 */
export default function AnnualGoalsBar() {
  const { state, incrementHabit } = useGoals()
  const [showPrivate, setShowPrivate] = useState(false)
  const today = todayKey()
  const deadline = state?.card?.deadline || `${today.slice(0, 4)}-12-31`

  const { visibles, nbPrives } = useMemo(() => {
    const rows = (state?.goals || [])
      .map((g) => ({ g, p: annualProgress(g, deadline, null) }))
      .filter((r) => r.p)
    return {
      visibles: rows.filter((r) => showPrivate || !r.g.private),
      nbPrives: rows.filter((r) => r.g.private).length,
    }
  }, [state, deadline, showPrivate])

  const joursRestants = useMemo(() => {
    const ms = new Date(deadline + 'T23:59:59') - new Date()
    return Math.max(0, Math.ceil(ms / 86400000))
  }, [deadline])

  if (visibles.length === 0) return null

  return (
    <section className="agoals">
      <header className="agoals__head">
        <h2>Objectifs {deadline.slice(0, 4)}</h2>
        <span className="muted small">{joursRestants} jours restants</span>
      </header>

      <ul className="agoals__list">
        {visibles.map(({ g, p }) => {
          const color = DOMAINS[g.domain]?.light || 'var(--accent, #2563eb)'
          const pct = Math.round(p.pct * 100)
          const attendu = Math.round((p.expectedPct ?? 0) * 100)
          const proj = p.projectedPct == null ? null : Math.round(p.projectedPct * 100)
          // Une habitude quotidienne se coche ici : planifier et agir au
          // même endroit évite d'ouvrir un second écran pour une case.
          const r = rythmeRecent(g, deadline)
          const habit = g.type === 'habit' && !g.cumulative ? g : null
          const faitAujourdhui = habit
            ? (Number((habit.entries || {})[today]) || 0) >= (Number(habit.target) || 1)
            : null

          return (
            <li key={g.id} className="agoal">
              <div className="agoal__head">
                <span className="agoal__name">
                  <i className="agoal__dot" style={{ background: color }} />
                  {g.labelAr || g.short || g.label}
                </span>
                <span className={`agoal__verdict tone-${(r || p).tone}`}>{r ? r.mot : '—'}</span>
              </div>

              <div className="agoal__track">
                {proj != null && proj > pct && (
                  <span className="agoal__proj"
                        style={{ left: `${pct}%`, width: `${Math.min(100 - pct, proj - pct)}%`, background: color }} />
                )}
                <span className="agoal__real" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
                <span className="agoal__tick" style={{ left: `${Math.min(100, attendu)}%` }} />
              </div>

              <div className="agoal__foot">
                <span>{p.label}</span>
                <span className="muted">{pct} % · attendu {attendu} %</span>
              </div>
              {r && <p className="agoal__pace">{r.ligne}</p>}

              {habit && (
                <button
                  type="button"
                  className={`agoal__today ${faitAujourdhui ? 'is-done' : ''}`}
                  onClick={() => incrementHabit(g.id, faitAujourdhui ? -1 : 1)}
                >
                  {faitAujourdhui ? 'Fait aujourd’hui' : 'Marquer fait aujourd’hui'}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {nbPrives > 0 && (
        <button type="button" className="btn-link agoals__toggle"
                onClick={() => setShowPrivate((v) => !v)}>
          {showPrivate ? 'Masquer les objectifs privés' : `Afficher les ${nbPrives} objectifs privés`}
        </button>
      )}
    </section>
  )
}

/**
 * Le rythme des trente derniers jours, et non l'avancement depuis janvier.
 *
 * Comparer un cumul d'année à une année dont on n'a suivi que la fin rend
 * tout « hors d'atteinte » : quatre lignes rouges identiques, qui ne disent
 * rien de ce qu'il faut faire aujourd'hui. Ce qui se pilote le matin, c'est
 * la régularité récente et le rythme qu'il reste à tenir.
 */
function rythmeRecent(goal, deadline) {
  const today = todayKey()
  const joursRestants = Math.max(1, Math.round((new Date(deadline + 'T23:59:59') - new Date()) / 86400000))
  const debut = toDateKey(new Date(Date.now() - 29 * 86400000))

  const habit = goal.type === 'habit' && !goal.cumulative ? goal
    : (goal.type === 'milestone' && goal.habit ? goal.habit : null)

  if (habit) {
    const cible = Number(habit.target) || 1
    let tenus = 0
    for (const [d, v] of Object.entries(habit.entries || {})) {
      if (d >= debut && d <= today && (Number(v) || 0) >= cible) tenus++
    }
    const part = tenus / 30
    return {
      tone: part >= 0.8 ? 'good' : part >= 0.5 ? 'warn' : 'crit',
      mot: part >= 0.8 ? 'Régulier' : part >= 0.5 ? 'Irrégulier' : 'Décroché',
      ligne: `${tenus} jours sur les 30 derniers`,
    }
  }

  if (goal.type === 'habit' && goal.cumulative) {
    const total = Number(goal.targetTotal) || 0
    const fait = Number(goal.currentTotal) || 0
    const reste = Math.max(0, total - fait)
    const parJour = reste / joursRestants
    return {
      tone: parJour <= 5 ? 'good' : parJour <= 15 ? 'warn' : 'crit',
      mot: parJour <= 5 ? 'Tenable' : parJour <= 15 ? 'Exigeant' : 'À renégocier',
      ligne: reste === 0
        ? 'Objectif atteint'
        : `${Math.ceil(parJour)} ${goal.unit || ''} par jour sur ${joursRestants} jours`.replace('  ', ' '),
    }
  }

  return null
}
