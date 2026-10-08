// Module Objectifs 2026 — trois moteurs distincts (habit / metric / milestone).
// Rien n'est saisi côté metric : lit directement l'état E-commerce.

import {
  totalRevenue, netPeriod, todayKey, addDays, daysBetween, formatMoney,
  computeCPLCap, cplGauge, productKPIs, stockRowMetrics,
} from './ecom'

export const KEY = 'goals.v1'

// -----------------------------------------------------------
// Domaines — une teinte par domaine, vérifiée pour daltonisme
// -----------------------------------------------------------

export const DOMAINS = {
  spiritual: { key: 'spiritual', label: 'Spirituel',  light: '#00897B', dark: '#0FA894', symbol: '☪' },
  body:      { key: 'body',      label: 'Corps',      light: '#D2691E', dark: '#D4742C', symbol: '⚡' },
  business:  { key: 'business',  label: 'Business',   light: '#5B4BC4', dark: '#8B7CF0', symbol: '◆' },
  personal:  { key: 'personal',  label: 'Personnel',  light: '#C0357E', dark: '#CE5794', symbol: '❤' },
}

export function domainVar(domainKey) {
  return `var(--dom-${domainKey})`
}

// -----------------------------------------------------------
// Actions du jour — pastilles cliquables. Une action peut nourrir
// plusieurs objectifs (ex. Séance bas du corps → body + santé).
// -----------------------------------------------------------

export const TODAY_ACTIONS = [
  { id: 'act_salat', label: 'Prières',              domain: 'spiritual', targets: [{ goalId: 'goal_salat', mode: 'toggle-daily' }] },
  { id: 'act_marti', label: 'Marti',                domain: 'personal',  targets: [{ goalId: 'goal_marti', mode: 'toggle-embedded' }] },
  { id: 'act_body',  label: 'Bas du corps',         domain: 'body',      targets: [
    { goalId: 'goal_body',  mode: 'toggle-daily' },
    { goalId: 'goal_sante', mode: 'toggle-embedded' },
  ] },
  { id: 'act_hizb',  label: 'Verset appris',         domain: 'spiritual', targets: [{ goalId: 'goal_hizb', mode: 'increment', delta: 1, maxPerDay: 6 }] },
  { id: 'act_soir',  label: 'Saisie du soir',       domain: 'business',  targets: [], link: '/ecom/soir' },
]

// -----------------------------------------------------------
// Seed — les 7 objectifs de la carte manuscrite
// -----------------------------------------------------------

export function buildSeed() {
  return {
    version: 1,
    card: {
      title: 'What do I want to achieve by end 2026?',
      motto: 'Believe and you shall receive',
      writtenAt: '2026-05',
      deadline: '2026-12-31',
    },
    goals: [
      {
        id: 'goal_salat', type: 'habit', domain: 'spiritual',
        label: 'صلاة كاملة في وقتها', short: 'Prières', symbol: '☪',
        cadence: 'daily', unit: 'jour', target: 1, cumulative: false,
        entries: {},
      },
      {
        id: 'goal_marti', type: 'milestone', domain: 'personal',
        label: 'Marti', labelAr: 'مرتي', short: 'Marti', symbol: '❤',
        subtitle: 'نلقى المرا اللي غنتزوج بيها',
        state: 'in_progress', nextAction: '', checkpointAt: null, history: [],
        private: true,
        habit: {
          id: 'hb_marti',
          cadence: 'daily',
          unit: 'binary',
          target: 1,
          label: "Marti — une action aujourd'hui",
          remindAt: '18:00',
          note: 'free',
          entries: {},
          notes: {},        // notes libres par date — strictement locales, jamais exportées
          linkedTaskId: null,
        },
      },
      {
        id: 'goal_body', type: 'habit', domain: 'body',
        label: 'بنية قوية منحوتة', short: 'Corps', symbol: '⚡',
        subtitle: 'Bas du corps prioritaire',
        cadence: 'daily', unit: 'séance', target: 1, cumulative: false,
        entries: {},
      },
      {
        id: 'goal_10k', type: 'metric', domain: 'business',
        short: 'Profit/mois', symbol: '◆',
        label: '10 000 $/mois de profit net',
        subtitle: 'Octobre, novembre, décembre consécutifs',
        source: 'ecom.netPeriod',
        target: 10000, currency: 'USD',
        mode: 'consecutive_months',
        requiredMonths: ['2026-10', '2026-11', '2026-12'],
        gates: [
          { id: 'g_cpl',      label: 'Un produit dont le CPL réel passe sous son plafond, 7 jours consécutifs', check: 'ecom.anyProductUnderCplCeiling(7)', manual: false },
          { id: 'g_delivery', label: 'Taux de livraison ≥ 40 % sur 30 jours', check: 'ecom.deliveryRate(30) >= 0.40', manual: false },
          { id: 'g_capital',  label: 'Capital publicitaire mensuel disponible ≥ 11 700 $', check: 'manual', manual: true, state: false },
          { id: 'g_stock',    label: 'Stock couvrant ≈ 855 unités livrées par mois', check: 'ecom.stockCoverageUnits() >= 855', manual: false },
        ],
      },
      {
        id: 'goal_50k', type: 'metric', domain: 'business',
        short: 'CA 2026', symbol: '◆',
        label: '50 000 $ de chiffre d\'affaires sur 2026',
        source: 'ecom.revenue',
        target: 50000, currency: 'USD',
        mode: 'cumulative_ytd', from: '2026-01-01',
      },
      {
        id: 'goal_hizb', type: 'habit', domain: 'spiritual',
        label: 'حفظ ٣٠ حزب', short: 'Hizb', symbol: '☪',
        subtitle: '6 versets max par jour — 30 hizb (~1 800 versets)',
        cadence: 'daily', unit: 'verset', cumulative: true,
        targetTotal: 1800, currentTotal: 0, increment: 1, dailyMax: 6,
        versesPerHizb: 60,
        entries: {},
      },
      {
        id: 'goal_sante', type: 'milestone', domain: 'body',
        label: 'Apte physiquement', short: 'Santé', symbol: '⚡',
        subtitle: 'Contrôle médical daté',
        state: 'in_progress',
        nextAction: 'Spermogramme de contrôle',
        checkpointAt: '2026-11-15',
        history: [{ date: '2026-09', note: 'Opération faite, récupération en cours' }],
        private: true,
        habit: {
          id: 'hb_seances', cadence: 'daily', unit: 'séance', target: 1,
          label: 'Séance physique',
          entries: {}, notes: {},
        },
      },
    ],
    reminders: [
      { id: 'rm_saisie',  at: '21:00', days: 'daily', condition: 'no_entry_today', text: 'Saisie du soir — dépense pub et leads' },
      { id: 'rm_releves', at: '09:00', days: 'monday', condition: 'always', text: 'Coller les relevés CODPartner et COD Network' },
      { id: 'rm_cloture', at: '09:00', days: 'first_of_month', condition: 'always', text: 'Clôture du mois — rapprochement, stock, verdicts produits' },
      { id: 'rm_marti',   at: '18:00', days: 'daily', condition: 'habit_undone:hb_marti', text: "Marti — une action aujourd'hui" },
      { id: 'rm_habits',  at: '22:00', days: 'daily', condition: 'habit_open', text: '{habits ouvertes}' },
    ],
    celebrated: {},         // { key: date } pour ne pas rejouer
    adviceCache: null,      // { at:date, text, rank }
    lastReminderSeen: null, // dernier tick de dismissal
  }
}

// -----------------------------------------------------------
// Habit — série en cours, taux 30 j, rythme requis pour cumulatif
// -----------------------------------------------------------

function sumEntries(entries, days) {
  const to = todayKey()
  const from = addDays(to, -(days - 1))
  let s = 0
  for (const [d, v] of Object.entries(entries || {})) {
    if (d >= from && d <= to) s += Number(v) || 0
  }
  return s
}

/** Nombre de jours consécutifs où entries >= target, en incluant / tolérant hier. */
export function habitStreak(goal) {
  const target = Number(goal.target) || 1
  const entries = goal.entries || {}
  const to = todayKey()
  let cursor = to
  // Tolérance : si aujourd'hui pas encore atteint, on démarre à hier
  if ((Number(entries[cursor]) || 0) < target) cursor = addDays(cursor, -1)
  let streak = 0
  while ((Number(entries[cursor]) || 0) >= target) {
    streak++
    cursor = addDays(cursor, -1)
    if (streak > 3000) break
  }
  return streak
}

/** Taux de complétion sur 30 j = Σ entries ÷ (target × 30). */
export function habitCompletion30(goal) {
  const target = Number(goal.target) || 1
  return sumEntries(goal.entries, 30) / (target * 30)
}

/** Bande des 30 derniers jours pour l'affichage carrés remplis / vides. */
export function habitBand30(goal) {
  const target = Number(goal.target) || 1
  const to = todayKey()
  const out = []
  for (let i = 29; i >= 0; i--) {
    const d = addDays(to, -i)
    const v = Number(goal.entries?.[d]) || 0
    out.push({ date: d, filled: v >= target, value: v })
  }
  return out
}

/** Rythme requis / observé pour un habit cumulatif. */
export function habitCumulativePace(goal, deadline) {
  if (!goal.cumulative) return null
  const remain = Math.max(0, (Number(goal.targetTotal) || 0) - (Number(goal.currentTotal) || 0))
  const daysLeft = Math.max(1, daysBetween(todayKey(), deadline))
  const paceRequired = remain / daysLeft
  const paceObserved = sumEntries(goal.entries, 14) / 14
  return { paceRequired, paceObserved, daysLeft, remain }
}

// -----------------------------------------------------------
// Metric — lecture E-commerce, rythme, facteur écart, verrous
// -----------------------------------------------------------

/** Valeur actuelle d'un metric lue depuis l'état ecom. */
export function metricCurrent(goal, ecomState) {
  const movements = ecomState?.movements || []
  const settings = ecomState?.settings
  const today = todayKey()
  if (goal.source === 'ecom.revenue') {
    // CA cumulatif depuis goal.from (ou début de l'année)
    const from = goal.from || `${today.slice(0, 4)}-01-01`
    return movements.reduce((s, m) => {
      if (m.kind !== 'revenue' || m.undated) return s
      if (m.date < from || m.date > today) return s
      const rate = settings?.rates?.[m.currency]
      const amt = rate ? Number(m.amount) / rate : Number(m.amount) || 0
      return s + amt
    }, 0)
  }
  if (goal.source === 'ecom.netPeriod') {
    // Pour consecutive_months : renvoie le net du mois EN COURS
    const monthKey = today.slice(0, 7)
    const monthFrom = `${monthKey}-01`
    return netPeriod(movements, monthFrom, today, settings)
  }
  return 0
}

/** Net d'un mois donné (YYYY-MM). */
export function netForMonth(ecomState, ym) {
  const movements = ecomState?.movements || []
  const settings = ecomState?.settings
  const from = `${ym}-01`
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(y, m, 0)
  const to = `${ym}-${String(last.getDate()).padStart(2, '0')}`
  return netPeriod(movements, from, to, settings)
}

/**
 * Rythme requis / observé / projection / facteur d'écart.
 * Ne s'applique qu'aux metrics cumulatifs. Le mode consecutive_months
 * n'a pas de rythme mais un état par mois.
 */
export function metricPace(goal, ecomState, deadline) {
  if (goal.mode !== 'cumulative_ytd') return null
  const now = metricCurrent(goal, ecomState)
  const from = goal.from || `${todayKey().slice(0, 4)}-01-01`
  const daysElapsed = Math.max(1, daysBetween(from, todayKey()))
  const daysLeft = Math.max(1, daysBetween(todayKey(), deadline))
  const paceRequired = (goal.target - now) / daysLeft
  const paceObserved = now / daysElapsed
  const factor = paceObserved > 0 ? paceRequired / paceObserved : Infinity
  const projection = now + paceObserved * daysLeft
  return { now, paceRequired, paceObserved, factor, projection, daysElapsed, daysLeft }
}

/** Verdict textuel §3 pour un facteur d'écart. */
export function paceVerdict(factor) {
  if (factor <= 1.2) return { key: 'ontrack', tone: 'good', label: 'En ligne' }
  if (factor <= 3)   return { key: 'catch',   tone: 'warn', label: `Rythme à multiplier par ${factor.toFixed(1)}` }
  return                   { key: 'unreachable', tone: 'crit', label: 'Hors d\'atteinte au rythme actuel' }
}

/** Statut d'un mois de consecutive_months. */
export function monthStatus(goal, ecomState, ym) {
  const today = todayKey()
  const cur = today.slice(0, 7)
  const net = netForMonth(ecomState, ym)
  const target = Number(goal.target) || 0
  if (ym > cur) return { key: 'future', label: 'à venir', tone: 'neutral', net }
  if (ym === cur) {
    if (net >= target) return { key: 'ontrack', label: 'en cours (atteint)', tone: 'good', net }
    return { key: 'ongoing', label: 'en cours', tone: 'warn', net }
  }
  // Mois passé
  if (net >= target) return { key: 'hit', label: 'atteint', tone: 'good', net }
  return { key: 'missed', label: 'manqué', tone: 'crit', net }
}

// -----------------------------------------------------------
// Verrous (gates) — évaluation
// -----------------------------------------------------------

export function evalGate(gate, ecomState) {
  if (gate.check === 'manual') return { open: !!gate.state, reason: gate.state ? 'validé manuellement' : 'à valider manuellement' }
  const settings = ecomState?.settings
  try {
    if (gate.check === 'ecom.anyProductUnderCplCeiling(7)') {
      const products = ecomState?.products || []
      const movements = ecomState?.movements || []
      const daily = ecomState?.daily || []
      const campaigns = ecomState?.campaigns || []
      for (const p of products) {
        const kpis = productKPIs({ product: p, movements, daily, campaigns, settings, days: 7 })
        const variant = p.pricing?.bundle2 ? 'bundle2' : 'single'
        const cap = computeCPLCap({
          product: p, variant,
          confRate: kpis.leads >= 20 ? kpis.confRate : 0.55,
          delivRate: kpis.leads >= 20 ? kpis.delivRate : 0.30,
          settings,
        })
        const gauge = cplGauge(kpis, cap.plafondCPL)
        if (kpis.cpl > 0 && gauge.tone === 'good') return { open: true, reason: p.name }
      }
      return { open: false, reason: 'Aucun produit sous son plafond CPL' }
    }
    if (gate.check === 'ecom.deliveryRate(30) >= 0.40') {
      const daily = ecomState?.daily || []
      const to = todayKey()
      const from = addDays(to, -29)
      let confirmed = 0, delivered = 0
      for (const d of daily) {
        if (d.date < from || d.date > to) continue
        confirmed += Number(d.confirmed) || 0
        delivered += Number(d.delivered) || 0
      }
      const rate = confirmed > 0 ? delivered / confirmed : 0
      return { open: rate >= 0.40, reason: `Taux livraison 30 j = ${(rate * 100).toFixed(0)} %` }
    }
    if (gate.check === 'ecom.stockCoverageUnits() >= 855') {
      const stock = ecomState?.positions?.stock || []
      const totalUnits = stock.reduce((s, r) => s + (Number(r.units) || 0), 0)
      return { open: totalUnits >= 855, reason: `Stock total = ${totalUnits} unités` }
    }
  } catch (err) {
    return { open: false, reason: `Erreur d'évaluation : ${err?.message || err}` }
  }
  return { open: false, reason: 'Vérificateur inconnu' }
}

export function evalGates(goal, ecomState) {
  return (goal.gates || []).map((g) => ({ gate: g, ...evalGate(g, ecomState) }))
}

/** Premier verrou fermé (par ordre de déclaration). */
export function firstClosedGate(goal, ecomState) {
  const list = evalGates(goal, ecomState)
  return list.find((r) => !r.open) || null
}

// -----------------------------------------------------------
// Milestones — proximité checkpoint
// -----------------------------------------------------------

export function milestoneUrgency(goal) {
  if (!goal.checkpointAt) return null
  const days = daysBetween(todayKey(), goal.checkpointAt)
  return { days, imminent: days >= 0 && days <= 7 }
}

// -----------------------------------------------------------
// Compteur de jours restants (§6)
// -----------------------------------------------------------

export function daysCountdown(deadline) {
  const now = todayKey()
  const daysLeft = Math.max(0, daysBetween(now, deadline))
  const y = now.slice(0, 4)
  const octFirst = `${y}-10-01`
  const daysToOct = daysBetween(now, octFirst)
  return { daysLeft, daysToOct: daysToOct >= 0 ? daysToOct : null }
}

// -----------------------------------------------------------
// Motifs (§7)
// -----------------------------------------------------------

const WEEKDAYS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']

/** Complétion par jour de la semaine sur 90 j. */
export function weekdayPattern(goal) {
  const target = Number(goal.target) || 1
  const to = todayKey()
  const counts = Array.from({ length: 7 }, () => ({ total: 0, hit: 0 }))
  for (let i = 0; i < 90; i++) {
    const d = addDays(to, -i)
    const v = Number(goal.entries?.[d]) || 0
    const dt = new Date(d + 'T00:00:00')
    const wd = dt.getDay()
    counts[wd].total++
    if (v >= target) counts[wd].hit++
  }
  // Retour uniquement si écart lisible (≥ 8 occurrences ET ≥ 25 pts d'écart)
  const rates = counts.map((c) => c.total > 0 ? c.hit / c.total : 0)
  const globalHit = counts.reduce((s, c) => s + c.hit, 0)
  const globalTotal = counts.reduce((s, c) => s + c.total, 0)
  const globalRate = globalTotal > 0 ? globalHit / globalTotal : 0
  const findings = []
  for (let wd = 0; wd < 7; wd++) {
    if (counts[wd].total < 8) continue
    const gap = Math.abs(rates[wd] - globalRate)
    if (gap < 0.25) continue
    findings.push({ weekday: WEEKDAYS[wd], rate: rates[wd], gap, direction: rates[wd] < globalRate ? 'worse' : 'better' })
  }
  findings.sort((a, b) => b.gap - a.gap)
  return findings
}

// -----------------------------------------------------------
// Rappels (§8.2) — évaluation à l'ouverture pour l'affichage
// -----------------------------------------------------------

function isMonday() { return new Date().getDay() === 1 }
function isFirstOfMonth() { return new Date().getDate() === 1 }

/**
 * Registre plat des contributions. Chaque entrée non-nulle d'un habit
 * top-level ou embarqué devient une ligne {date, goalId, value, ...}.
 * Trié du plus récent au plus ancien.
 */
export function getContributions(state, filterGoalId = null) {
  const rows = []
  for (const g of (state.goals || [])) {
    const push = (habit, goalId, domain, label, unit) => {
      for (const [date, value] of Object.entries(habit.entries || {})) {
        if (!value) continue
        if (filterGoalId && filterGoalId !== goalId) continue
        rows.push({ date, goalId, domain, label, value: Number(value), unit })
      }
    }
    if (g.type === 'habit')            push(g, g.id, g.domain, g.short || g.label, g.unit)
    if (g.type === 'milestone' && g.habit) push(g.habit, g.id, g.domain, g.short || g.label, g.habit.unit || 'action')
  }
  rows.sort((a, b) => b.date.localeCompare(a.date))
  return rows
}

/** Renvoie toutes les habitudes : top-level (habit) + embarquées (milestone.habit). */
export function collectHabits(state) {
  const out = []
  for (const g of (state.goals || [])) {
    if (g.type === 'habit') out.push({ goal: g, habit: g, embedded: false })
    else if (g.habit) out.push({ goal: g, habit: g.habit, embedded: true })
  }
  return out
}

function habitDoneToday(habit) {
  const v = Number(habit.entries?.[todayKey()]) || 0
  return v >= (Number(habit.target) || 1)
}

export function evalReminders(state, ecomState) {
  const now = new Date()
  const hh = now.getHours()
  const mm = now.getMinutes()
  const nowMinutes = hh * 60 + mm
  const goalHabits = (state.goals || []).filter((g) => g.type === 'habit')
  const openHabits = goalHabits.filter((g) => {
    if (g.cumulative) return true
    return !habitDoneToday(g)
  })
  const allHabits = collectHabits(state)
  const hasEntryToday = (ecomState?.movements || []).some((m) => m.kind === 'ads' && !m.undated && m.date === todayKey())

  const list = []
  for (const rm of (state.reminders || [])) {
    // days match
    if (rm.days === 'monday' && !isMonday()) continue
    if (rm.days === 'first_of_month' && !isFirstOfMonth()) continue
    // heure passée aujourd'hui
    const [h, m] = String(rm.at || '00:00').split(':').map(Number)
    const rmMin = (h || 0) * 60 + (m || 0)
    if (nowMinutes < rmMin) continue
    // condition
    if (rm.condition === 'no_entry_today' && hasEntryToday) continue
    if (rm.condition === 'habit_open' && openHabits.length === 0) continue
    if (typeof rm.condition === 'string' && rm.condition.startsWith('habit_undone:')) {
      const habitId = rm.condition.split(':')[1]
      const target = allHabits.find(({ habit }) => habit.id === habitId)
      if (!target) continue                 // habitude introuvable
      if (habitDoneToday(target.habit)) continue  // déjà cochée → pas de rappel
    }
    let text = rm.text
    if (rm.id === 'rm_habits') {
      text = `Habitudes ouvertes : ${openHabits.map((g) => g.label).join(', ')}`
    }
    list.push({ id: rm.id, text, at: rm.at })
  }
  // Plafond de 3 affichés
  return list.slice(0, 3)
}

// -----------------------------------------------------------
// Félicitations (§8.3) — événements célébrables
// -----------------------------------------------------------

const CONGRATS_TIERS = [7, 30, 60, 100]

export function computeCongrats(state, ecomState) {
  const events = []
  for (const g of (state.goals || [])) {
    if (g.type === 'habit') {
      const streak = habitStreak(g)
      for (const tier of CONGRATS_TIERS) {
        if (streak >= tier) events.push({
          key: `streak-${g.id}-${tier}`,
          rarity: 100 - tier, // 30j plus rare que 7
          text: `${tier} jours de ${g.label}.`,
        })
      }
    }
    // Milestones avec habit embarqué : on célèbre UNIQUEMENT la constance de
    // l'action, jamais l'état du milestone. Un tier atteint = "N jours d'affilée",
    // point. Aucun message ne peut évoquer l'aboutissement (mariage, guérison, etc.).
    if (g.type === 'milestone' && g.habit) {
      const streak = habitStreak(g.habit)
      for (const tier of CONGRATS_TIERS) {
        if (streak >= tier) events.push({
          key: `streak-${g.habit.id}-${tier}`,
          rarity: 100 - tier,
          text: `${tier} jours d'affilée sur "${g.habit.label}".`,
        })
      }
    }
    if (g.type === 'metric' && g.mode === 'cumulative_ytd') {
      const now = metricCurrent(g, ecomState)
      const target = g.target
      for (const pct of [25, 50, 75, 100]) {
        const threshold = target * (pct / 100)
        if (now >= threshold) events.push({
          key: `pct-${g.id}-${pct}`,
          rarity: pct,
          text: pct === 100
            ? `${g.label} — cible atteinte.`
            : `${g.label} : ${pct} % franchis (${formatMoney(now, g.currency)}).`,
        })
      }
    }
    if (g.type === 'metric' && g.mode === 'consecutive_months') {
      for (const ym of g.requiredMonths || []) {
        const st = monthStatus(g, ecomState, ym)
        if (st.key === 'hit') events.push({
          key: `month-${g.id}-${ym}`,
          rarity: 80,
          text: `${monthLabel(ym)} atteint : ${formatMoney(st.net, g.currency)}.`,
        })
      }
    }
    if (g.type === 'metric') {
      // Verrous nouvellement ouverts
      const gates = evalGates(g, ecomState)
      const closedCount = gates.filter((r) => !r.open).length
      for (const r of gates.filter((r) => r.open)) {
        events.push({
          key: `gate-${g.id}-${r.gate.id}`,
          rarity: 70,
          text: `Verrou débloqué : ${r.gate.label}. Il en reste ${closedCount}.`,
        })
      }
    }
  }
  return events
}

/** Choisit l'unique félicitation à afficher aujourd'hui (rare non déjà célébrée). */
export function pickTodayCongrats(state, ecomState) {
  const today = todayKey()
  const celebrated = state.celebrated || {}
  const already = Object.entries(celebrated).some(([, d]) => d === today)
  if (already) return null
  const events = computeCongrats(state, ecomState).filter((e) => !celebrated[e.key])
  if (events.length === 0) return null
  events.sort((a, b) => b.rarity - a.rarity)
  return events[0]
}

// -----------------------------------------------------------
// Conseils (§8.4)
// -----------------------------------------------------------

/** Rang 1/2/3, un seul, recalcul 1 fois par jour. */
export function pickAdvice(state, ecomState) {
  const today = todayKey()
  // Cache journalier
  if (state.adviceCache?.at === today && state.adviceCache?.text) return state.adviceCache
  const goals = state.goals || []
  // Rang 1 — verrou bloquant sur un metric
  for (const g of goals.filter((gg) => gg.type === 'metric')) {
    const closed = firstClosedGate(g, ecomState)
    if (closed) {
      return {
        at: today, rank: 1,
        text: `Verrou bloquant sur "${g.label}" : ${closed.gate.label}. ${closed.reason ? `État : ${closed.reason}. ` : ''}Ouvrir ce verrou avant tout autre effort.`,
      }
    }
  }
  // Rang 2 — écart de rythme
  for (const g of goals.filter((gg) => gg.type === 'metric' && gg.mode === 'cumulative_ytd')) {
    const p = metricPace(g, ecomState, state.card?.deadline || '2026-12-31')
    if (p && p.factor > 1.2) {
      return {
        at: today, rank: 2,
        text: `Il te faut ${formatMoney(p.paceRequired, g.currency)} par jour pour "${g.label}". Tu es à ${formatMoney(p.paceObserved, g.currency)}.`,
      }
    }
  }
  // Rang 3 — motif détecté sur un habit TOP-LEVEL uniquement.
  // Les habits embarqués dans un milestone (ex. hb_marti) sont exclus :
  // aucun conseil sur ces objectifs, par contrat.
  for (const g of goals.filter((gg) => gg.type === 'habit')) {
    const findings = weekdayPattern(g)
    if (findings.length > 0) {
      const f = findings[0]
      return {
        at: today, rank: 3,
        text: `Sur ${g.label} : le ${f.weekday} tu es ${f.direction === 'worse' ? 'moins' : 'mieux'} régulier que le reste de la semaine (${(f.rate * 100).toFixed(0)} % vs moyenne).`,
      }
    }
  }
  return { at: today, rank: 0, text: 'Rien de plus à conseiller aujourd\'hui.' }
}

// -----------------------------------------------------------
// Helpers d'affichage
// -----------------------------------------------------------

export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

// -----------------------------------------------------------
// Progression annuelle — alimentée par les tâches Planning (via la sync)
// -----------------------------------------------------------

/**
 * Progression d'un objectif sur l'année, comparée au temps écoulé.
 * Renvoie { pct, expectedPct, projectedPct, label, detail, tone } ou null.
 *  - pct          : avancement réel (0..1)
 *  - expectedPct  : avancement attendu aujourd'hui si linéaire (0..1)
 *  - projectedPct : atteinte projetée au 31/12 au rythme observé (peut > 1)
 */
export function annualProgress(goal, deadline, ecomState) {
  const today = todayKey()
  const yearStart = `${today.slice(0, 4)}-01-01`
  const daysTotal = Math.max(1, daysBetween(yearStart, deadline) + 1)
  const daysElapsed = Math.min(daysTotal, Math.max(1, daysBetween(yearStart, today) + 1))
  const expectedPct = daysElapsed / daysTotal

  const toneOf = (pct) => {
    const ratio = expectedPct > 0 ? pct / expectedPct : 1
    if (ratio >= 0.9) return 'good'
    if (ratio >= 0.6) return 'warn'
    return 'crit'
  }

  // Habit cumulatif (ex. Hizb : 1 800 versets)
  if (goal.type === 'habit' && goal.cumulative) {
    const total = Number(goal.targetTotal) || 1
    const cur = Number(goal.currentTotal) || 0
    const pct = Math.min(1, cur / total)
    const projected = (cur / daysElapsed) * daysTotal / total
    return {
      pct, expectedPct, projectedPct: projected, tone: toneOf(pct),
      label: `${Math.round(cur)} / ${total} ${goal.unit || ''}`.trim(),
      detail: `Projection fin d'année : ${Math.round(projected * 100)} %`,
    }
  }

  // Habit quotidien (top-level ou embarqué dans un milestone)
  const habit = goal.type === 'habit' ? goal : (goal.type === 'milestone' ? goal.habit : null)
  if (habit) {
    const target = Number(habit.target) || 1
    let done = 0
    for (const [d, v] of Object.entries(habit.entries || {})) {
      if (d >= yearStart && d <= today && (Number(v) || 0) >= target) done++
    }
    const pct = Math.min(1, done / daysTotal)
    const projected = (done / daysElapsed)
    return {
      pct, expectedPct, projectedPct: projected, tone: toneOf(pct),
      label: `${done} j sur ${daysTotal}`,
      detail: `Régularité : ${Math.round((done / daysElapsed) * 100)} % des jours écoulés`,
    }
  }

  // Metric cumulatif (CA)
  if (goal.type === 'metric' && goal.mode === 'cumulative_ytd') {
    const now = metricCurrent(goal, ecomState)
    const target = Number(goal.target) || 1
    const pct = Math.min(1, now / target)
    const projected = (now / daysElapsed) * daysTotal / target
    return {
      pct, expectedPct, projectedPct: projected, tone: toneOf(pct),
      label: `${formatMoney(now, goal.currency)} / ${formatMoney(target, goal.currency)}`,
      detail: `Projection fin d'année : ${Math.round(projected * 100)} %`,
    }
  }

  // Metric mensuel consécutif (profit/mois)
  if (goal.type === 'metric' && goal.mode === 'consecutive_months') {
    const months = goal.requiredMonths || []
    const hit = months.filter((ym) => monthStatus(goal, ecomState, ym).key === 'hit').length
    const pct = months.length ? hit / months.length : 0
    return {
      pct, expectedPct: null, projectedPct: null,
      tone: pct >= 1 ? 'good' : 'warn',
      label: `${hit} / ${months.length} mois atteints`,
      detail: '',
    }
  }

  // Milestone sans habitude : pas de progression calculable depuis les tâches
  return null
}
