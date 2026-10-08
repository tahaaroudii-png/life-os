// Centralise les constantes du module Planning : axes, types, calculs.
//
// Vocabulaire :
//   - "task" : ligne de la table `tasks` (habit / oneoff / progressive).
//   - "log"  : ligne de la table `task_logs` (une par (task_id, log_date)).
//
// Un log peut préexister ou être créé au premier tap sur la case à cocher
// (upsert par (user_id, task_id, log_date)).

// Les `key` restent inchangés (ils correspondent à l'enum en base) — seuls
// les `label` affichés sont personnalisés. Aucune migration DB nécessaire.
export const AXES = [
  { key: 'spiritualite', label: 'ALLAH',          icon: '🕌', color: '#7c3aed' },
  { key: 'sante',        label: 'SAHTI',          icon: '🍎', color: '#dc2626' },
  { key: 'personnel',    label: 'ANA',            icon: '🧘', color: '#0891b2' },
  { key: 'famille',      label: '3A2ILTI',        icon: '👨‍👩‍👧', color: '#ea580c' },
  { key: 'social',       label: 'Social',         icon: '🤝', color: '#ca8a04' },
  { key: 'business',     label: 'BUSINESS DIALI', icon: '💼', color: '#4f46e5' },
  { key: 'finances',     label: 'Finances',       icon: '💰', color: '#16a34a' },
]

export const AXIS_BY_KEY = Object.fromEntries(AXES.map((a) => [a.key, a]))
export const AXIS_KEYS = AXES.map((a) => a.key)

export const TASK_TYPES = ['habit', 'oneoff', 'progressive']

export const PLANNING_TABLES = {
  tasks: 'tasks',
  taskLogs: 'task_logs',
}

// ------------------------------------------------------------------
// Dates : on travaille en local (fuseau du navigateur), pas en UTC.
// La colonne `log_date` est un DATE (sans heure), donc on utilise le
// format 'YYYY-MM-DD' calé sur la date locale de l'utilisateur.
// ------------------------------------------------------------------

export function toDateKey(date) {
  const d = date instanceof Date ? date : new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayKey() {
  return toDateKey(new Date())
}

/** Nombre de jours calendaires entiers entre deux `YYYY-MM-DD` (fromKey → toKey). */
export function daysBetween(fromKey, toKey) {
  if (!fromKey || !toKey) return 0
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  const a = Date.UTC(fy, fm - 1, fd)
  const b = Date.UTC(ty, tm - 1, td)
  return Math.round((b - a) / 86_400_000)
}

/** Décale une date-key de N jours. */
export function addDays(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/** Objectif d'une tâche progressive pour une date donnée (null si pas encore active). */
export function progressiveTargetFor(task, dateKey) {
  if (task.type !== 'progressive') return null
  if (task.start_value == null || task.daily_increment == null || !task.start_date) return null
  const startKey = toDateKey(task.start_date)
  const days = daysBetween(startKey, dateKey)
  if (days < 0) return null
  return Number(task.start_value) + Number(task.daily_increment) * days
}

/**
 * Renvoie la liste des tâches à afficher pour un jour donné, en fusionnant :
 *   - les habitudes actives (créées avant la date),
 *   - les tâches progressives actives (start_date <= date),
 *   - les tâches ponctuelles dont le log a log_date === date (sinon elles
 *     n'apparaissent NULLE PART sur ce jour — pas de report automatique).
 *
 * Chaque entrée porte : task, log (peut être null), target (progressive).
 */
export function buildDayTasks(tasks, logsByTaskId, dateKey) {
  // On normalise dateKey au format 'YYYY-MM-DD' pour la comparaison stricte.
  const dk = String(dateKey).slice(0, 10)
  const items = []

  for (const t of tasks) {
    if (!t.active) continue

    if (t.type === 'habit') {
      const createdKey = toDateKey(t.created_at)
      if (createdKey > dk) continue
      items.push({ task: t, log: logsByTaskId[t.id] || null, target: null })
      continue
    }

    if (t.type === 'progressive') {
      const target = progressiveTargetFor(t, dk)
      if (target == null) continue
      items.push({ task: t, log: logsByTaskId[t.id] || null, target })
      continue
    }

    if (t.type === 'oneoff') {
      // FILTRE STRICT ONEOFF :
      //   Une tâche ponctuelle n'apparaît QUE le jour où son occurrence
      //   (le log) a été posée. On teste explicitement sur la log_date
      //   normalisée — pas juste sur la présence d'un log dans le map
      //   (double sécurité au cas où `logsByTaskId` serait mal filtré).
      const log = logsByTaskId[t.id]
      if (!log) continue
      const logDateKey = String(log.log_date).slice(0, 10)
      if (logDateKey !== dk) continue
      items.push({ task: t, log, target: null })
    }
  }
  return items
}

/** Regroupe des items { task, log, target } par axe, dans l'ordre AXES. */
export function groupByAxis(items) {
  const byAxis = Object.fromEntries(AXIS_KEYS.map((k) => [k, []]))
  for (const it of items) {
    if (byAxis[it.task.axis]) byAxis[it.task.axis].push(it)
  }
  return AXES.map((a) => ({ axis: a, items: byAxis[a.key] }))
}

/**
 * Tri chronologique des items du jour :
 *   - d'abord ceux qui ont une heure planifiée (`scheduled_time`), croissant ;
 *   - puis les tâches sans heure, dans l'ordre de création.
 * Renvoie deux paquets pour permettre l'affichage d'un séparateur "Sans heure".
 */
export function splitScheduledUnscheduled(items) {
  const scheduled = items
    .filter((it) => !!it.task.scheduled_time)
    .sort((a, b) => timeToMinutes(a.task.scheduled_time) - timeToMinutes(b.task.scheduled_time))
  const unscheduled = items
    .filter((it) => !it.task.scheduled_time)
    .sort((a, b) => new Date(a.task.created_at) - new Date(b.task.created_at))
  return { scheduled, unscheduled }
}

/** "HH:MM" ou "HH:MM:SS" → minutes depuis minuit. */
export function timeToMinutes(t) {
  if (!t) return 0
  const [h, m] = String(t).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** "HH:MM:SS" ou "HH:MM" → "HH:MM" pour l'affichage. */
export function formatTimeHM(t) {
  if (!t) return ''
  const [h, m] = String(t).split(':')
  return `${String(h).padStart(2, '0')}:${String(m || '00').padStart(2, '0')}`
}

/** Taux de complétion d'un lot d'items (0..1). */
export function completionRate(items) {
  if (!items.length) return 0
  const done = items.filter((it) => it.log?.done).length
  return done / items.length
}

// ------------------------------------------------------------------
// Analyse historique
// ------------------------------------------------------------------

/**
 * À partir de la liste des tâches + tous les logs sur une plage,
 * calcule, pour chaque jour de la plage, le nombre de tâches
 * "attendues" (habits actives + progressives actives + oneoffs logués)
 * et le nombre "faites".
 */
export function computeDailyStats(tasks, logs, fromKey, toKey) {
  const logsByDate = {}
  for (const l of logs) {
    const dk = toDateKey(l.log_date)
    if (!logsByDate[dk]) logsByDate[dk] = {}
    logsByDate[dk][l.task_id] = l
  }
  const days = daysBetween(fromKey, toKey)
  const out = []
  for (let i = 0; i <= days; i++) {
    const dk = addDays(fromKey, i)
    const logsForDay = logsByDate[dk] || {}
    const items = buildDayTasks(tasks, logsForDay, dk)
    const done = items.filter((it) => it.log?.done).length
    const byAxis = {}
    for (const it of items) {
      if (!byAxis[it.task.axis]) byAxis[it.task.axis] = { total: 0, done: 0 }
      byAxis[it.task.axis].total++
      if (it.log?.done) byAxis[it.task.axis].done++
    }
    out.push({ date: dk, total: items.length, done, byAxis })
  }
  return out
}

/** Streak courant (jours consécutifs cochés) pour une tâche donnée, jusqu'à `todayKey`.
 *  Normalisation stricte des dates via slice(0,10) — les décalages de fuseau
 *  qui pouvaient faire matcher un log au mauvais jour sont neutralisés. */
export function streakForTask(taskId, logs, todayDateKey) {
  const byDate = {}
  for (const l of logs) {
    if (l.task_id !== taskId) continue
    const dk = String(l.log_date).slice(0, 10)
    byDate[dk] = l
  }
  let streak = 0
  let cursor = String(todayDateKey).slice(0, 10)
  // On tolère un "aujourd'hui" non-fait sans casser le streak d'hier :
  // si aujourd'hui n'est pas coché mais hier oui, on démarre à hier.
  if (!byDate[cursor]?.done) cursor = addDays(cursor, -1)
  while (byDate[cursor]?.done) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}
