import { useMemo, useState } from 'react'
import '../../styles/goals-dashboard.css'
import { NavLink } from 'react-router-dom'
import { useGoals, isActionDoneToday, actionCountToday } from '../../hooks/useGoals'
import { useEcom } from '../../hooks/useEcom'
import { useTasks } from '../../hooks/useTasks'
import { useTaskLogs } from '../../hooks/useTaskLogs'
import {
  DOMAINS, TODAY_ACTIONS,
  habitStreak, habitBand30, habitCumulativePace,
  metricCurrent, metricPace, paceVerdict, monthStatus, netForMonth,
  evalGates, firstClosedGate,
  daysCountdown, getContributions, monthLabel, annualProgress,
} from '../../lib/goals'
import { formatMoney, todayKey, addDays } from '../../lib/ecom'

/**
 * Objectifs 2026 — tableau de bord dense. Scanné en 5 secondes. Pas de
 * phrases : les détails sont dans les infobulles au survol.
 */
export default function GoalsHome() {
  const goals = useGoals()
  const ecom = useEcom()
  const state = goals.state
  const deadline = state.card?.deadline || '2026-12-31'
  const { daysLeft } = daysCountdown(deadline)
  const today = todayKey()

  const ecomState = useMemo(() => ({
    settings: ecom.settings,
    movements: ecom.movements,
    products: ecom.products,
    campaigns: ecom.campaigns,
    daily: ecom.daily,
    positions: ecom.positions,
  }), [ecom.settings, ecom.movements, ecom.products, ecom.campaigns, ecom.daily, ecom.positions])

  const [filterGoalId, setFilterGoalId] = useState(null)
  const contributions = useMemo(() => getContributions(state, filterGoalId).slice(0, 6), [state, filterGoalId])

  const goalById = useMemo(() => Object.fromEntries(state.goals.map((g) => [g.id, g])), [state.goals])

  // Compte d'actions faites aujourd'hui (parmi les 5 pastilles cliquables)
  const actionsDoneToday = useMemo(
    () => TODAY_ACTIONS.filter((a) => a.targets.length > 0 && isActionDoneToday(a, state)).length,
    [state]
  )
  const clickableActions = TODAY_ACTIONS.filter((a) => a.targets.length > 0).length

  // Métriques pour la barre de KPI
  const g50k = goalById.goal_50k
  const g10k = goalById.goal_10k
  const ca = g50k ? metricCurrent(g50k, ecomState) : 0
  const caTarget = g50k?.target || 50000
  const netMonth = g10k ? metricCurrent(g10k, ecomState) : 0
  const gates10k = g10k ? evalGates(g10k, ecomState) : []
  const openCount = gates10k.filter((r) => r.open).length

  return (
    <div className="dash">
      {/* 1. Barre de titre */}
      <header className="dash-header">
        <h1>Objectifs 2026</h1>
        <span className="dash-date">{formatDateFr(today)}</span>
      </header>

      {/* 2. Cinq compteurs en ligne */}
      <section className="kpi-row">
        <Kpi
          value={daysLeft} unit="j" label="Restant"
          hint={`Jusqu'au ${deadline}`}
        />
        <Kpi
          value={formatMoney(ca, 'USD')}
          label="CA 2026"
          hint={`${((ca / caTarget) * 100).toFixed(1)} % de ${formatMoney(caTarget, 'USD')}`}
        />
        <Kpi
          value={formatMoney(netMonth, 'USD')}
          label="Profit/mois"
          hint={`Cible ${formatMoney(g10k?.target || 10000, 'USD')}`}
        />
        <Kpi
          value={openCount} unit={`/${gates10k.length}`}
          label="Verrous ouverts" hint="Objectif ④"
        />
        <Kpi
          value={actionsDoneToday} unit={`/${clickableActions}`}
          label="Aujourd'hui" hint="Actions faites"
        />
      </section>

      {/* 3. Actions du jour en pastilles */}
      <ActionsRow state={state} goalById={goalById} goals={goals} />

      {/* 4. Grille de tuiles */}
      <section className="tiles">
        {state.goals.map((g) => (
          <GoalTile
            key={g.id}
            goal={g}
            ecomState={ecomState}
            deadline={deadline}
            active={filterGoalId === g.id}
            onClick={() => setFilterGoalId((cur) => cur === g.id ? null : g.id)}
          />
        ))}
      </section>

      {/* 4b. Progression annuelle — alimentée automatiquement par les tâches Planning */}
      <AnnualPanel state={state} ecomState={ecomState} deadline={deadline} />

      {/* 5. Deux graphiques */}
      <section className="charts">
        <ChartTrajectory ecomState={ecomState} target={caTarget} year={today.slice(0, 4)} />
        <ChartWeeklyEffort state={state} ecomState={ecomState} />
      </section>

      {/* 6. Verrous ④ compacts */}
      {g10k && <GatesStrip goal={g10k} gates={gates10k} onToggleManual={goals.setGateManual} />}

      {/* 7. Contributions */}
      <ContribList
        contributions={contributions}
        filterGoalId={filterGoalId}
        onClear={() => setFilterGoalId(null)}
        goalById={goalById}
      />

      {/* 8. Liaisons Planning — associer les tâches existantes aux objectifs */}
      <LiaisonsPanel state={state} goals={goals} />
    </div>
  )
}

// ----------------------------------------------------------------------
// Linker Planning — apparaît quand des tâches ne sont pas encore liées.
// Aucune création automatique : c'est un bouton explicite pour éviter
// toute duplication silencieuse.
// ----------------------------------------------------------------------

/**
 * Panneau de liaisons — pour chaque objectif habit (top ou embarqué), la
 * liste des tâches Planning que l'utilisateur veut voir alimenter cet
 * objectif. Une liaison = cocher une case. La sync recalcule ensuite les
 * séries et bandes automatiquement.
 */
function LiaisonsPanel({ state, goals }) {
  const { tasks } = useTasks()
  const [openId, setOpenId] = useState(null)

  const habitGoals = state.goals.filter((g) => g.type === 'habit' || (g.type === 'milestone' && g.habit))

  return (
    <section className="liaisons">
      <header>
        <h3>Liaisons Planning</h3>
        <span className="muted small">Coche les tâches qui alimentent chaque objectif</span>
      </header>
      <ul className="liaisons-list">
        {habitGoals.map((g) => {
          const embedded = g.type === 'milestone'
          const linkedIds = embedded ? (g.habit.linkedTaskIds || []) : (g.linkedTaskIds || [])
          const dom = DOMAINS[g.domain]
          const isOpen = openId === g.id
          return (
            <li key={g.id} className={`liaison ${isOpen ? 'is-open' : ''}`}>
              <button type="button" className="liaison-head" onClick={() => setOpenId(isOpen ? null : g.id)}>
                <span className="liaison-dot" style={{ background: dom?.light }} />
                <span className="liaison-name">{g.short || g.label}</span>
                <span className="liaison-count">{linkedIds.length} lien{linkedIds.length > 1 ? 's' : ''}</span>
                <span className="liaison-chevron">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <ul className="liaison-tasks">
                  {tasks.length === 0 && <li className="muted small">Aucune tâche dans Planning. Crée-en depuis Planning → Tâches.</li>}
                  {tasks.map((t) => {
                    const checked = linkedIds.includes(t.id)
                    return (
                      <li key={t.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => goals.toggleLinkedTaskId(g.id, t.id, embedded)}
                          />
                          <span>{t.title}</span>
                          <span className="muted xs">· {t.axis}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ----------------------------------------------------------------------
// Progression annuelle : réel vs attendu à date, projection au 31/12.
// Les habitudes se remplissent seules depuis les tâches Planning cochées.
// ----------------------------------------------------------------------

function AnnualPanel({ state, ecomState, deadline }) {
  const rows = state.goals
    .map((g) => ({ g, p: annualProgress(g, deadline, ecomState) }))
    .filter((r) => r.p)
  if (rows.length === 0) return null
  return (
    <section className="annual">
      <header>
        <h3>Progression annuelle</h3>
        <span className="muted small">Trait = où tu devrais être aujourd'hui</span>
      </header>
      <ul className="annual-list">
        {rows.map(({ g, p }) => {
          const dom = DOMAINS[g.domain]
          return (
            <li key={g.id} className={`annual-row tone-${p.tone}`} title={p.detail}>
              <span className="annual-name">
                <span className="liaison-dot" style={{ background: dom?.light }} />
                {g.short || g.label}
              </span>
              <span className="annual-bar">
                <span className="annual-fill" style={{ width: `${Math.round(p.pct * 100)}%`, background: dom?.light }} />
                {p.expectedPct != null && (
                  <span className="annual-expected" style={{ left: `${Math.round(p.expectedPct * 100)}%` }} />
                )}
              </span>
              <span className="annual-label">{Math.round(p.pct * 100)} % · {p.label}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ----------------------------------------------------------------------
// KPI (compteur)
// ----------------------------------------------------------------------

function Kpi({ value, unit, label, hint }) {
  return (
    <div className="kpi" title={hint || ''}>
      <div className="kpi-value">
        <span>{value}</span>
        {unit && <span className="kpi-unit">{unit}</span>}
      </div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-hint">{hint}</div>
    </div>
  )
}

// ----------------------------------------------------------------------
// Actions du jour — pastilles cliquables
// ----------------------------------------------------------------------

function ActionsRow({ state, goalById, goals }) {
  const [busy, setBusy] = useState(false)
  const today = todayKey()
  const { upsertLog } = useTaskLogs(today, today)

  /**
   * Cocher/décocher une action =
   * 1) update state Objectifs local
   * 2) pour chaque objectif visé qui a un linkedTaskId, upsert le log Planning
   *    afin que la tâche apparaisse cochée dans la vue Aujourd'hui du Planning.
   */
  async function toggle(action) {
    if (busy) return
    setBusy(true)
    const isIncr = action.targets.some((t) => t.mode === 'increment')

    if (isIncr) {
      // Compteur local : +1 jusqu'au max, puis reset à 0. Bypass Planning
      // (une case cochée ne peut pas encoder 3 versets).
      const t = action.targets.find((tt) => tt.mode === 'increment')
      const g = state.goals.find((gg) => gg.id === t.goalId)
      const cap = Number(t.maxPerDay || g?.dailyMax) || Infinity
      const cur = Number(g?.entries?.[today]) || 0
      if (cur >= cap) {
        // Reset : soustraire tout
        for (let i = 0; i < cur; i++) goals.performAction(action, false)
      } else {
        goals.performAction(action, true)
      }
      setBusy(false)
      return
    }

    const done = isActionDoneToday(action, state)
    const linkedTaskIds = new Set()
    for (const t of action.targets) {
      const g = state.goals.find((gg) => gg.id === t.goalId)
      if (!g) continue
      const ids = t.mode === 'toggle-embedded'
        ? (g.habit?.linkedTaskIds || [])
        : (g.linkedTaskIds || [])
      for (const id of ids) linkedTaskIds.add(id)
    }
    if (linkedTaskIds.size > 0) {
      const writes = [...linkedTaskIds].map((id) =>
        upsertLog.mutateAsync({ task_id: id, log_date: today, done: !done }).catch(() => null)
      )
      await Promise.all(writes)
    } else {
      goals.performAction(action, !done)
    }
    setBusy(false)
  }

  return (
    <section className="actions">
      {TODAY_ACTIONS.map((a) => {
        const dom = DOMAINS[a.domain]
        const done = isActionDoneToday(a, state)
        const isIncr = a.targets.some((t) => t.mode === 'increment')
        const count = isIncr ? actionCountToday(a, state) : 0
        const maxPerDay = isIncr ? (a.targets.find((t) => t.mode === 'increment')?.maxPerDay || 6) : null
        const targets = a.targets.map((t) => goalById[t.goalId]).filter(Boolean)
        const tooltip = a.link
          ? '→ Saisie du soir'
          : targets.map((g) => g.short || g.label).join(' · ')
        if (a.link) {
          return (
            <NavLink key={a.id} to={a.link} className="pill" style={{ '--pill-color': dom.light }} title={tooltip}>
              <span className="pill-dot" />
              <span>{a.label}</span>
            </NavLink>
          )
        }
        const label = isIncr && count > 0 ? `${a.label} · ${count}/${maxPerDay}` : a.label
        return (
          <button
            key={a.id} type="button"
            className={`pill ${done ? 'is-done' : ''}`}
            style={{ '--pill-color': dom.light }}
            title={tooltip}
            onClick={() => toggle(a)}
          >
            <span className="pill-dot" />
            <span>{label}</span>
          </button>
        )
      })}
    </section>
  )
}

// ----------------------------------------------------------------------
// Tuile d'objectif
// ----------------------------------------------------------------------

function GoalTile({ goal, ecomState, deadline, active, onClick }) {
  const dom = DOMAINS[goal.domain] || DOMAINS.personal
  const style = { '--dom': dom.light, '--dom-dark': dom.dark }

  // Choix des données de rendu selon le type d'objectif
  const view = buildTileView(goal, ecomState, deadline)

  return (
    <div className={`gtile gtile--${goal.domain} ${active ? 'is-active' : ''}`} style={style}>
      <button type="button" className="gtile-main" onClick={onClick} aria-expanded={active}>
        <header className="gtile-head">
          <div className="gtile-title">
            <span className="gtile-symbol">{goal.symbol || '●'}</span>
            <h3>{goal.short || goal.label}</h3>
          </div>
          <span className={`gtile-badge gtile-badge--${view.state}`} title={view.stateLabel}>
            {view.stateLabel}
          </span>
        </header>

        <div className="gtile-body">
          <div className="gtile-progress">{view.progress}</div>
          <div className="gtile-metrics">
            <div className="gtile-primary">
              <span className="gtile-primary__value">{view.value}</span>
              {view.unit && <span className="gtile-primary__unit">{view.unit}</span>}
            </div>
            <div className="gtile-primary__caption">{view.caption}</div>
            {view.streak != null && (
              <div className="gtile-streak" title="Série en cours">
                🔥 <strong>{view.streak}</strong> j
              </div>
            )}
          </div>
        </div>

        <footer className="gtile-foot">
          <span>{view.footL}</span>
          <span>{view.footR}</span>
        </footer>
      </button>

      {active && (
        <div className="gtile-details">
          <p className="gtile-detail-label">{goal.label}</p>
          {goal.subtitle && <p className="gtile-detail-sub">{goal.subtitle}</p>}
          {view.detail}
        </div>
      )}
    </div>
  )
}

/**
 * Construit toutes les données de rendu d'une tuile selon le type d'objectif.
 * Séparer la logique du JSX rend la tuile lisible et le rendu prévisible.
 */
function buildTileView(goal, ecomState, deadline) {
  const dom = DOMAINS[goal.domain] || DOMAINS.personal
  const today = todayKey()

  // ---- Habit binaire (Prières, Corps) ------------------------------------
  if (goal.type === 'habit' && !goal.cumulative) {
    const streak = habitStreak(goal)
    const band = habitBand30(goal)
    const filled30 = band.filter((c) => c.filled).length
    const rate = filled30 / 30
    const state = rate >= 0.85 ? 'good' : rate >= 0.6 ? 'warn' : 'crit'
    const doneToday = (Number(goal.entries?.[today]) || 0) >= (Number(goal.target) || 1)
    return {
      state,
      stateLabel: state === 'good' ? 'À jour' : state === 'warn' ? 'À surveiller' : 'À rattraper',
      value: filled30,
      unit: ' / 30',
      caption: `Jours faits sur 30`,
      streak,
      progress: <Ring pct={rate} color={dom.light} label={`${Math.round(rate * 100)}%`} sub="30 j" />,
      footL: doneToday ? "✓ fait aujourd'hui" : "· pas encore fait",
      footR: `Cible ${goal.target || 1}/j`,
      detail: <HeatMap band={band} color={dom.light} />,
    }
  }

  // ---- Habit cumulatif (Hizb versets) ------------------------------------
  if (goal.type === 'habit' && goal.cumulative) {
    const p = habitCumulativePace(goal, deadline)
    const cur = Number(goal.currentTotal) || 0
    const total = Number(goal.targetTotal) || 1
    const pct = Math.max(0, Math.min(1, cur / total))
    const f = p && p.paceObserved > 0 ? p.paceRequired / p.paceObserved : Infinity
    const state = f <= 1.2 ? 'good' : f <= 3 ? 'warn' : 'crit'
    const versesPerHizb = goal.versesPerHizb || 60
    const hizbEq = cur / versesPerHizb
    return {
      state,
      stateLabel: state === 'good' ? 'Bon rythme' : state === 'warn' ? 'Rythme serré' : 'Retard',
      value: formatNumberFr(cur, 0),
      unit: ` / ${total}`,
      caption: `versets · ≈ ${formatNumberFr(hizbEq, 1)} hizb`,
      streak: null,
      progress: <Ring pct={pct} color={dom.light} label={`${Math.round(pct * 100)}%`} sub={`${total} v`} />,
      footL: `${formatNumberFr(Number(goal.entries?.[today]) || 0, 0)} / ${goal.dailyMax || 6} aujourd'hui`,
      footR: p ? `${formatNumberFr(p.paceRequired, 1)} v/j requis` : '—',
      detail: <MiniInfo lines={[
        p && `Rythme observé : ${formatNumberFr(p.paceObserved, 2)} versets/j`,
        p && `Rythme requis : ${formatNumberFr(p.paceRequired, 2)} versets/j`,
        p && `Reste : ${formatNumberFr(p.remain, 0)} versets sur ${p.daysLeft} j`,
      ].filter(Boolean)} />,
    }
  }

  // ---- Metric cumulatif annuel (CA 2026) ---------------------------------
  if (goal.type === 'metric' && goal.mode === 'cumulative_ytd') {
    const p = metricPace(goal, ecomState, deadline)
    const now = p?.now || 0
    const pct = Math.max(0, Math.min(1, now / goal.target))
    const verdict = paceVerdict(p?.factor || Infinity)
    return {
      state: verdict.tone,
      stateLabel: verdict.label,
      value: formatCompactMoney(now),
      unit: ` / ${formatCompactMoney(goal.target)}`,
      caption: `${Math.round(pct * 100)} % accomplis`,
      streak: null,
      progress: <Ring pct={pct} color={dom.light} label={`${Math.round(pct * 100)}%`} sub={goal.currency || 'USD'} />,
      footL: p ? `${formatMoney(p.paceRequired, goal.currency)}/j` : '—',
      footR: p ? `${p.daysLeft} j restants` : '—',
      detail: <MiniInfo lines={p ? [
        `Réalisé : ${formatMoney(p.now, goal.currency)}`,
        `Rythme observé : ${formatMoney(p.paceObserved, goal.currency)}/j`,
        `Rythme requis : ${formatMoney(p.paceRequired, goal.currency)}/j`,
        `Projection au ${deadline} : ${formatMoney(p.projection, goal.currency)}`,
      ] : []} />,
    }
  }

  // ---- Metric consecutive_months (10K profit) — verrous, PAS de % --------
  if (goal.type === 'metric' && goal.mode === 'consecutive_months') {
    const netCur = metricCurrent(goal, ecomState)
    const allGates = evalGates(goal, ecomState)
    const openG = allGates.filter((r) => r.open).length
    const totalG = allGates.length
    const state = openG === totalG ? 'good' : openG >= totalG / 2 ? 'warn' : 'crit'
    const closed = firstClosedGate(goal, ecomState)
    return {
      state,
      stateLabel: state === 'good' ? 'Verrous ouverts' : state === 'warn' ? 'Verrous partiels' : 'Bloqué',
      value: `${openG}/${totalG}`,
      unit: ' verrous',
      caption: 'ouverts sur les 4 prérequis',
      streak: null,
      progress: (
        <div className="gtile-months">
          {(goal.requiredMonths || []).map((ym) => {
            const s = monthStatus(goal, ecomState, ym)
            return (
              <div key={ym} className={`gtile-month gtile-month--${s.tone}`} title={`${monthLabel(ym)} : ${s.label}`}>
                <div className="gtile-month__label">{monthLabel(ym).slice(0, 3)}</div>
                <div className="gtile-month__net">{formatCompactMoney(s.net)}</div>
              </div>
            )
          })}
        </div>
      ),
      footL: closed ? '⛔ un verrou bloque' : '✓ verrous ok',
      footR: formatCompactMoney(netCur) + ' ce mois',
      detail: (
        <ul className="gtile-gates">
          {allGates.map(({ gate, open, reason }) => (
            <li key={gate.id} className={open ? 'is-open' : 'is-closed'}>
              <span className="gtile-gate-dot" /> {gate.label}
              <span className="gtile-gate-reason">{reason}</span>
            </li>
          ))}
        </ul>
      ),
    }
  }

  // ---- Milestone avec habit embarqué (Marti, Santé) — PAS de % ni barre --
  if (goal.type === 'milestone' && goal.habit) {
    const streak = habitStreak(goal.habit)
    const band = habitBand30(goal.habit)
    const filled30 = band.filter((c) => c.filled).length
    const state = streak >= 7 ? 'good' : streak >= 3 ? 'warn' : 'crit'
    const doneToday = (Number(goal.habit.entries?.[today]) || 0) >= (Number(goal.habit.target) || 1)
    return {
      state,
      stateLabel: state === 'good' ? 'Régulier' : state === 'warn' ? 'À maintenir' : 'À rattraper',
      value: streak,
      unit: ' j',
      caption: 'série en cours',
      streak: null, // déjà en value
      progress: (
        <div className="gtile-streak-ring">
          <span className="gtile-streak-ring__num">🔥{streak}</span>
          <span className="gtile-streak-ring__lbl">{filled30}/30 j</span>
        </div>
      ),
      footL: doneToday ? "✓ fait aujourd'hui" : '· à faire',
      footR: goal.state === 'in_progress' ? 'en cours' : goal.state,
      detail: (
        <>
          <HeatMap band={band} color={dom.light} />
          {goal.nextAction && <p className="gtile-detail-line"><strong>Prochaine action :</strong> {goal.nextAction}</p>}
          {goal.checkpointAt && <p className="gtile-detail-line"><strong>Prochain point :</strong> {goal.checkpointAt}</p>}
        </>
      ),
    }
  }

  // ---- Milestone pur (rare) ----------------------------------------------
  return {
    state: 'warn',
    stateLabel: goal.state || 'ouvert',
    value: '—', unit: '',
    caption: goal.checkpointAt || 'aucun point fixé',
    streak: null,
    progress: <div className="gtile-empty" />,
    footL: goal.state, footR: goal.checkpointAt || '',
    detail: goal.nextAction ? <p>{goal.nextAction}</p> : null,
  }
}

/** Anneau SVG de progression 0-1. */
function Ring({ pct, color, label, sub }) {
  const R = 34, C = 2 * Math.PI * R
  const dash = Math.max(0, Math.min(1, pct)) * C
  return (
    <svg viewBox="0 0 80 80" width="80" height="80" className="gtile-ring">
      <circle cx="40" cy="40" r={R} className="gtile-ring__bg" />
      <circle cx="40" cy="40" r={R}
        className="gtile-ring__fg"
        stroke={color}
        strokeDasharray={`${dash} ${C - dash}`}
        strokeDashoffset={C / 4}
      />
      <text x="40" y="42" textAnchor="middle" className="gtile-ring__label">{label}</text>
      {sub && <text x="40" y="55" textAnchor="middle" className="gtile-ring__sub">{sub}</text>}
    </svg>
  )
}

/** Heatmap 30 jours pour le détail. */
function HeatMap({ band, color }) {
  return (
    <div className="gtile-heat" style={{ '--dom': color }}>
      {band.map((c) => (
        <span key={c.date} className={c.filled ? 'is-filled' : ''} title={`${c.date} : ${c.filled ? 'fait' : 'non'}`} />
      ))}
    </div>
  )
}

function MiniInfo({ lines }) {
  if (!lines?.length) return null
  return (
    <ul className="gtile-info">
      {lines.map((l, i) => <li key={i}>{l}</li>)}
    </ul>
  )
}

function todayLabelFor(goal) {
  const v = Number(goal.entries?.[todayKey()]) || 0
  if (goal.cumulative) return v > 0 ? `+${v}` : '—'
  const target = Number(goal.target) || 1
  return v >= target ? '✓' : '—'
}

function todayLabelForHabit(habit) {
  const v = Number(habit.entries?.[todayKey()]) || 0
  const target = Number(habit.target) || 1
  return v >= target ? '✓' : '—'
}

// ----------------------------------------------------------------------
// Micro-visualisations (14px de haut)
// ----------------------------------------------------------------------

function MicroBand({ band, color }) {
  return (
    <div className="micro-band" style={{ '--dom': color }}>
      {band.map((c) => (
        <span key={c.date} className={c.filled ? 'is-filled' : ''} title={`${c.date} : ${c.filled ? 'fait' : 'non'}`} />
      ))}
    </div>
  )
}

function MicroBar({ pct, color }) {
  const p = Math.max(0, Math.min(1, pct)) * 100
  return (
    <div className="micro-bar">
      <div style={{ width: `${p}%`, background: color }} />
    </div>
  )
}

function MicroSegments({ current, total, color }) {
  // Segments à granularité 0.25 quart, mais on affiche max 30 segments
  const filledPct = Math.max(0, Math.min(1, current / total))
  const filled = Math.round(filledPct * 30)
  return (
    <div className="micro-band" style={{ '--dom': color }}>
      {Array.from({ length: 30 }).map((_, i) => (
        <span key={i} className={i < filled ? 'is-filled' : ''} />
      ))}
    </div>
  )
}

function MicroMonths({ goal, ecomState }) {
  return (
    <div className="micro-months">
      {(goal.requiredMonths || []).map((ym) => {
        const s = monthStatus(goal, ecomState, ym)
        return <span key={ym} className={`micro-months__cell tile-state--${s.tone}`} title={`${monthLabel(ym)} : ${s.label}`} />
      })}
    </div>
  )
}

// ----------------------------------------------------------------------
// Graphiques SVG
// ----------------------------------------------------------------------

function ChartTrajectory({ ecomState, target, year }) {
  // 12 points mensuels de CA cumulé
  const from = `${year}-01-01`
  const today = todayKey()
  const points = []
  let cum = 0
  const settings = ecomState?.settings
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0')
    const monthTo = `${year}-${mm}-${lastDayOfMonth(year, m)}`
    if (monthTo > today) {
      points.push({ month: m, cum: null }) // futur
    } else {
      const monthAmount = (ecomState?.movements || []).reduce((s, mov) => {
        if (mov.kind !== 'revenue' || mov.undated) return s
        if (mov.date < from || mov.date > monthTo) return s
        const rate = settings?.rates?.[mov.currency]
        const amt = rate ? Number(mov.amount) / rate : Number(mov.amount) || 0
        return s + amt
      }, 0)
      cum = monthAmount
      points.push({ month: m, cum: monthAmount })
    }
  }
  const doneCount = points.filter((p) => p.cum != null).length
  // Rythme moyen observé
  const lastDone = points.filter((p) => p.cum != null).slice(-1)[0]
  const paceMonth = lastDone && doneCount > 0 ? lastDone.cum / doneCount : 0
  const projected = points.map((p, i) => p.cum != null ? p : { ...p, cum: lastDone ? lastDone.cum + paceMonth * (p.month - doneCount) : 0 })
  // Requise linéaire
  const required = points.map((p) => ({ month: p.month, cum: (target * p.month) / 12 }))

  const W = 340, H = 160, PAD = 20
  const maxY = Math.max(target, ...projected.map((p) => p.cum || 0)) * 1.05
  const x = (m) => PAD + ((m - 1) / 11) * (W - PAD * 2)
  const y = (v) => H - PAD - (v / maxY) * (H - PAD * 2)

  const doneLine = points.filter((p) => p.cum != null).map((p) => `${x(p.month)},${y(p.cum)}`).join(' ')
  const projLine = projected.map((p) => `${x(p.month)},${y(p.cum)}`).join(' ')
  const reqLine = required.map((p) => `${x(p.month)},${y(p.cum)}`).join(' ')

  return (
    <div className="chart chart--trajectory card">
      <h3>Trajectoire CA 2026</h3>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="180" aria-label="Trajectoire du CA 2026">
        {/* Axe */}
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} className="chart-axis" />
        {/* Requise */}
        <polyline points={reqLine} fill="none" className="chart-required" />
        {/* Projection */}
        <polyline points={projLine} fill="none" className="chart-projection" />
        {/* Réalisée */}
        <polyline points={doneLine} fill="none" className="chart-done" />
        {/* Points */}
        {points.map((p) => {
          if (p.cum == null) return null
          const isLast = p.month === doneCount
          const monthReq = required.find((r) => r.month === p.month)?.cum || 0
          return (
            <circle key={p.month}
              cx={x(p.month)} cy={y(p.cum)} r={isLast ? 5 : 3}
              className={`chart-point ${isLast ? 'is-last' : ''}`}>
              <title>{`${monthLabel(`${year}-${String(p.month).padStart(2, '0')}`)} — réalisé ${formatMoney(p.cum, 'USD')} · requis ${formatMoney(monthReq, 'USD')}`}</title>
            </circle>
          )
        })}
        {/* Ticks mois */}
        {points.map((p) => (
          <text key={p.month} x={x(p.month)} y={H - 5} className="chart-tick" textAnchor="middle">{p.month}</text>
        ))}
      </svg>
    </div>
  )
}

function ChartWeeklyEffort({ state, ecomState }) {
  // 8 semaines. Pour chaque domaine, on compte les entrées habit (top+embedded)
  // + on ajoute Business quand une saisie du soir existe (ecom.movements ads).
  const today = todayKey()
  const weeks = []
  for (let i = 7; i >= 0; i--) {
    const to = addDays(today, -i * 7)
    const from = addDays(to, -6)
    weeks.push({ from, to, label: `S-${i}` })
  }
  const domains = ['spiritual', 'body', 'business', 'personal']
  const data = weeks.map((w) => {
    const counts = { spiritual: 0, body: 0, business: 0, personal: 0 }
    for (const g of state.goals) {
      const dom = g.domain
      if (!dom) continue
      const push = (entries) => {
        for (const [d, v] of Object.entries(entries || {})) {
          if (!v || d < w.from || d > w.to) continue
          counts[dom] = (counts[dom] || 0) + Math.min(1, Number(v))  // 1 point max/jour côté effort
        }
      }
      if (g.type === 'habit') push(g.entries)
      if (g.type === 'milestone' && g.habit) push(g.habit.entries)
    }
    // Ajoute business : jours avec au moins un mouvement ads
    const daysWithAds = new Set()
    for (const m of (ecomState?.movements || [])) {
      if (m.kind !== 'ads' || m.undated) continue
      if (m.date < w.from || m.date > w.to) continue
      daysWithAds.add(m.date)
    }
    counts.business = (counts.business || 0) + daysWithAds.size
    return { ...w, counts }
  })

  const W = 260, H = 160, PAD = 20
  const maxY = Math.max(1, ...data.map((d) => Object.values(d.counts).reduce((s, v) => s + v, 0)))
  const bw = (W - PAD * 2) / data.length - 4

  return (
    <div className="chart chart--effort card">
      <h3>Effort par semaine</h3>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="180" aria-label="Effort par semaine">
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} className="chart-axis" />
        {data.map((w, i) => {
          const xBar = PAD + i * ((W - PAD * 2) / data.length)
          let cursor = 0
          return (
            <g key={i}>
              {domains.map((d) => {
                const v = w.counts[d] || 0
                if (v === 0) return null
                const h = (v / maxY) * (H - PAD * 2)
                const y0 = H - PAD - cursor - h
                cursor += h
                return (
                  <rect key={d}
                    x={xBar} y={y0} width={bw} height={h}
                    fill={`var(--dom-${d})`}
                  >
                    <title>{`${w.from} → ${w.to} — ${DOMAINS[d].label} : ${v}`}</title>
                  </rect>
                )
              })}
              <text x={xBar + bw / 2} y={H - 5} className="chart-tick" textAnchor="middle">{w.label}</text>
            </g>
          )
        })}
      </svg>
      <div className="chart-legend">
        {domains.map((d) => (
          <span key={d}><span className="dot" style={{ background: `var(--dom-${d})` }} /> {DOMAINS[d].label}</span>
        ))}
      </div>
    </div>
  )
}

function lastDayOfMonth(year, month) {
  return new Date(Number(year), Number(month), 0).getDate()
}

// ----------------------------------------------------------------------
// Verrous ④ — pastilles compactes
// ----------------------------------------------------------------------

function GatesStrip({ goal, gates, onToggleManual }) {
  const SHORT = {
    g_cpl: 'CPL sous plafond',
    g_delivery: 'Livraison ≥ 40 %',
    g_capital: 'Capital ≥ 11 700 $',
    g_stock: 'Stock ≥ 855 u',
  }
  return (
    <section className="gates-strip" aria-label="Verrous ④">
      {gates.map(({ gate, open, reason }) => (
        <div key={gate.id} className={`gate-pill ${open ? 'is-open' : 'is-closed'}`} title={reason}>
          <span className={`gate-dot ${open ? 'is-open' : 'is-closed'}`} />
          <span>{SHORT[gate.id] || gate.label}</span>
          {gate.manual && (
            <input type="checkbox" checked={!!gate.state} onChange={(e) => onToggleManual(goal.id, gate.id, e.target.checked)} />
          )}
        </div>
      ))}
    </section>
  )
}

// ----------------------------------------------------------------------
// Contributions
// ----------------------------------------------------------------------

function ContribList({ contributions, filterGoalId, onClear, goalById }) {
  if (contributions.length === 0) return null
  return (
    <section className="contribs">
      <header>
        <h3>Contributions</h3>
        {filterGoalId && (
          <button type="button" className="btn-ghost" onClick={onClear}>
            Filtre : {goalById[filterGoalId]?.short || filterGoalId} ✕
          </button>
        )}
      </header>
      <ul>
        {contributions.map((c, i) => {
          const dom = DOMAINS[c.domain]
          const displayValue = c.value % 1 === 0 ? c.value : formatNumberFr(c.value)
          return (
            <li key={`${c.goalId}-${c.date}-${i}`} title={`${goalById[c.goalId]?.label || ''} — ${dom?.label || ''}`}>
              <span className="contrib-date">{c.date.slice(5)}</span>
              <span className="contrib-label">{goalById[c.goalId]?.short || c.label}</span>
              <span className="contrib-tag" style={{ background: `var(--dom-${c.domain})` }}>{dom?.label}</span>
              <span className="contrib-value">{displayValue}{c.unit ? ` ${c.unit}` : ''}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ----------------------------------------------------------------------
// Utils
// ----------------------------------------------------------------------

function formatDateFr(iso) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatNumberFr(v, maxFrac = 2) {
  // 12.25 → "12,25", 0 → "0", 30 → "30"
  const rounded = Math.round(v * 100) / 100
  const str = rounded.toFixed(rounded % 1 === 0 ? 0 : Math.min(maxFrac, 2))
  return str.replace('.', ',').replace(/,0+$/, '')
}

function formatCompactMoney(v) {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k$`
  return `${Math.round(v)}$`
}
