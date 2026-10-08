import { NavLink } from 'react-router-dom'
import '../../styles/goals-dashboard.css'
import { useGoals } from '../../hooks/useGoals'
import { useEcom } from '../../hooks/useEcom'
import {
  DOMAINS,
  habitStreak, habitBand30, habitCumulativePace,
  metricCurrent, metricPace, paceVerdict,
  evalGates, firstClosedGate, daysCountdown,
} from '../../lib/goals'
import { todayKey } from '../../lib/ecom'

/**
 * Bande "Objectifs 2026" en tête de la vue Planning → Aujourd'hui.
 *
 * L'idée : quand tu planifies ta journée, les 7 objectifs annuels doivent
 * être visibles. Chaque tuile donne :
 *   - l'état actuel (série / %)
 *   - une "suggestion du jour" : la petite action qui rapproche du grand objectif
 * Un clic sur la bande envoie vers /goals pour le détail complet.
 */
export default function GoalsStrip() {
  const goals = useGoals()
  const ecom = useEcom()
  const deadline = goals.state.card?.deadline || '2026-12-31'
  const { daysLeft } = daysCountdown(deadline)
  const today = todayKey()

  const ecomState = {
    settings: ecom.settings,
    movements: ecom.movements,
    products: ecom.products,
    campaigns: ecom.campaigns,
    daily: ecom.daily,
    positions: ecom.positions,
  }

  return (
    <section className="goals-strip">
      <header className="goals-strip__head">
        <NavLink to="/goals" className="goals-strip__title">🎯 Objectifs 2026</NavLink>
        <span className="goals-strip__countdown"><strong>{daysLeft}</strong> j restants</span>
      </header>
      <p className="goals-strip__intro">
        Une petite action aujourd'hui = un pas vers l'objectif de l'année.
      </p>
      <div className="goals-strip__list">
        {goals.state.goals.map((g) => (
          <NavLink key={g.id} to="/goals" className="goal-mini" style={{ '--dom': (DOMAINS[g.domain] || DOMAINS.personal).light }}>
            <MiniCard goal={g} ecomState={ecomState} deadline={deadline} today={today} />
          </NavLink>
        ))}
      </div>
    </section>
  )
}

function MiniCard({ goal, ecomState, deadline, today }) {
  const name = goal.short || goal.label

  // --- habit binaire (Prières, Corps) ---
  if (goal.type === 'habit' && !goal.cumulative) {
    const streak = habitStreak(goal)
    const doneToday = (Number(goal.entries?.[today]) || 0) >= (Number(goal.target) || 1)
    return (
      <MiniLayout
        symbol={goal.symbol} name={name}
        stat={<>🔥 <strong>{streak}</strong> j</>}
        hint={doneToday ? '✓ Fait — continuer' : suggestFor(goal)}
        done={doneToday}
      />
    )
  }

  // --- habit cumulatif (Hizb) ---
  if (goal.type === 'habit' && goal.cumulative) {
    const p = habitCumulativePace(goal, deadline)
    const doneToday = Number(goal.entries?.[today]) || 0
    const dailyMax = goal.dailyMax || 6
    return (
      <MiniLayout
        symbol={goal.symbol} name={name}
        stat={<><strong>{doneToday}</strong>/{dailyMax} v aujourd'hui</>}
        hint={doneToday >= dailyMax ? '✓ Max atteint' : `Cible : ${p ? Math.ceil(p.paceRequired) : dailyMax} versets/jour`}
        done={doneToday >= dailyMax}
      />
    )
  }

  // --- metric cumulative_ytd (CA 50K) ---
  if (goal.type === 'metric' && goal.mode === 'cumulative_ytd') {
    const p = metricPace(goal, ecomState, deadline)
    const pct = p ? Math.round((p.now / goal.target) * 100) : 0
    const v = paceVerdict(p?.factor || Infinity)
    return (
      <MiniLayout
        symbol={goal.symbol} name={name}
        stat={<><strong>{pct}</strong>%</>}
        hint={v.tone === 'good' ? '✓ En ligne — pousse la pub' : v.tone === 'warn' ? `× ${p?.factor?.toFixed(1)} — scaler` : "Hors d'atteinte — trouver un winner"}
        done={pct >= 100}
      />
    )
  }

  // --- metric consecutive_months (10K) ---
  if (goal.type === 'metric' && goal.mode === 'consecutive_months') {
    const gates = evalGates(goal, ecomState)
    const openG = gates.filter((r) => r.open).length
    const closed = firstClosedGate(goal, ecomState)
    return (
      <MiniLayout
        symbol={goal.symbol} name={name}
        stat={<><strong>{openG}</strong>/{gates.length} verrous</>}
        hint={closed ? `À débloquer : ${shortGateLabel(closed.gate.id)}` : '✓ Prêt à scaler'}
        done={openG === gates.length}
      />
    )
  }

  // --- milestone avec habit embarqué (Marti, Santé) ---
  if (goal.type === 'milestone' && goal.habit) {
    const streak = habitStreak(goal.habit)
    const doneToday = (Number(goal.habit.entries?.[today]) || 0) >= (Number(goal.habit.target) || 1)
    return (
      <MiniLayout
        symbol={goal.symbol} name={name}
        stat={<>🔥 <strong>{streak}</strong> j</>}
        hint={doneToday ? '✓ Action du jour faite' : goal.nextAction || 'Une action aujourd\'hui'}
        done={doneToday}
      />
    )
  }

  // --- milestone pur ---
  return (
    <MiniLayout
      symbol={goal.symbol} name={name}
      stat={goal.state === 'in_progress' ? 'en cours' : goal.state}
      hint={goal.nextAction || 'Définir la prochaine action'}
      done={goal.state === 'done'}
    />
  )
}

function MiniLayout({ symbol, name, stat, hint, done }) {
  return (
    <>
      <div className="goal-mini__head">
        <span className="goal-mini__symbol">{symbol || '●'}</span>
        <span className="goal-mini__name">{name}</span>
      </div>
      <div className={`goal-mini__stat ${done ? 'is-done' : ''}`}>{stat}</div>
      <div className="goal-mini__hint">{hint}</div>
    </>
  )
}

function suggestFor(goal) {
  if (goal.id === 'goal_salat') return 'Cocher toutes les prières'
  if (goal.id === 'goal_body')  return 'Une séance bas du corps'
  return 'Une petite action aujourd\'hui'
}

function shortGateLabel(id) {
  return {
    g_cpl: 'CPL sous plafond',
    g_delivery: 'Livraison ≥ 40 %',
    g_capital: 'Capital ≥ 11 700 $',
    g_stock: 'Stock ≥ 855 u',
  }[id] || id
}
