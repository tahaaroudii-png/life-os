// Constantes du module Modifications ONCF.
//
// Étapes dans l'ordre exact demandé, avec un dégradé de couleurs qui suit
// la progression : froid → chaud → succès.

export const STAGES = [
  { key: 'identifie',         label: 'Identifié',          color: '#64748b' },
  { key: 'etude',             label: 'Étude',              color: '#0891b2' },
  { key: 'dossier_redige',    label: 'Dossier rédigé',     color: '#4f46e5' },
  { key: 'validation',        label: 'Validation',         color: '#7c3aed' },
  { key: 'prototype',         label: 'Prototype',          color: '#db2777' },
  { key: 'deploiement_serie', label: 'Déploiement série',  color: '#ea580c' },
  { key: 'cloture',           label: 'Clôturé',            color: '#16a34a' },
]

export const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]))
export const STAGE_KEYS = STAGES.map((s) => s.key)

export const PRIORITIES = [
  { key: 'haute',   label: 'Haute',   color: '#dc2626' },
  { key: 'moyenne', label: 'Moyenne', color: '#ea580c' },
  { key: 'basse',   label: 'Basse',   color: '#16a34a' },
]

export const PRIORITY_BY_KEY = Object.fromEntries(PRIORITIES.map((p) => [p.key, p]))

export const ONCF_TABLES = {
  modifications: 'modifications',
  history: 'modification_history',
}

// -----------------------------------------------------------
// Barème d'avancement pondéré par la charge de travail réelle
// de chaque étape (choisi par l'utilisateur). Une modif à
// "Étude" n'est pas simplement 1/7 du chemin, elle est à ~25 %
// parce que le vrai travail se concentre entre "Dossier rédigé"
// et "Prototype".
// -----------------------------------------------------------
export const STAGE_PROGRESS = {
  identifie:         5,
  etude:            25,
  dossier_redige:   50,
  validation:       60,
  prototype:        80,
  deploiement_serie: 95,
  cloture:         100,
}

export function progressForStage(stage) {
  return STAGE_PROGRESS[stage] ?? 0
}

/**
 * Couleur sémantique d'une jauge selon l'avancement.
 * Rouge → orange → ambre → vert clair → vert plein.
 * Pas de gradient : chaque tranche a une identité claire.
 */
export function colorForProgress(pct) {
  if (pct >= 100) return '#16a34a' // vert plein — clôturé
  if (pct >= 75)  return '#65a30d' // vert clair — quasi fini
  if (pct >= 50)  return '#ca8a04' // ambre — mi-chemin
  if (pct >= 25)  return '#ea580c' // orange — démarré
  return '#dc2626'                  // rouge — au tout début
}

/**
 * Moyenne d'avancement pour un ensemble de modifications.
 * Par défaut on exclut les clôturées : la métrique répond à
 * "où on en est sur le pipeline actif", plus actionnable que
 * de gonfler la moyenne avec du travail déjà fini.
 */
export function averageProgress(modifs, { includeClosed = false } = {}) {
  const scope = includeClosed ? modifs : modifs.filter((m) => m.stage !== 'cloture')
  if (scope.length === 0) return 0
  const sum = scope.reduce((acc, m) => acc + progressForStage(m.stage), 0)
  return Math.round(sum / scope.length)
}

// -----------------------------------------------------------
// Échéance : rouge si dépassée, orange si dans les 7 jours,
// neutre sinon. Retourne un ton sémantique pour le CSS.
// -----------------------------------------------------------

export function dueTone(dueDate) {
  if (!dueDate) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const d = new Date(dueDate)
  d.setHours(0, 0, 0, 0)
  const diffDays = Math.round((d - now) / 86_400_000)
  if (diffDays < 0) return 'overdue'
  if (diffDays <= 7) return 'soon'
  return 'ok'
}

export function formatDueLabel(dueDate) {
  if (!dueDate) return '—'
  const d = new Date(dueDate)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

/**
 * Trie une liste par échéance croissante, avec les null en fin.
 * En cas d'égalité, on retombe sur la priorité (haute d'abord) puis title.
 */
export function sortByDue(list) {
  const prioOrder = { haute: 0, moyenne: 1, basse: 2 }
  return [...list].sort((a, b) => {
    const da = a.due_date ? new Date(a.due_date).getTime() : Infinity
    const db = b.due_date ? new Date(b.due_date).getTime() : Infinity
    if (da !== db) return da - db
    const pa = prioOrder[a.priority] ?? 3
    const pb = prioOrder[b.priority] ?? 3
    if (pa !== pb) return pa - pb
    return (a.title || '').localeCompare(b.title || '')
  })
}

// ---------------------------------------------------------------
// Priorité de traitement — regroupe et ordonne selon l'urgence
// réelle : retard > cette semaine > à venir > clôturé.
// ---------------------------------------------------------------

export const PRIORITY_BUCKETS = [
  { key: 'overdue', label: '🚨 En retard',   tone: 'crit' },
  { key: 'soon',    label: '⚠️ Cette semaine', tone: 'warn' },
  { key: 'later',   label: '📅 À venir',      tone: 'neutral' },
  { key: 'closed',  label: '✅ Clôturées',    tone: 'ok' },
]

export function bucketOf(modif) {
  if (modif.stage === 'cloture') return 'closed'
  const tone = dueTone(modif.due_date)
  if (tone === 'overdue') return 'overdue'
  if (tone === 'soon') return 'soon'
  return 'later'
}

/**
 * Score de tri intra-bucket : priorité haute d'abord, puis échéance
 * la plus proche, puis titre pour stabilité.
 */
export function sortByPriorityInBucket(list) {
  const prioOrder = { haute: 0, moyenne: 1, basse: 2 }
  return [...list].sort((a, b) => {
    const pa = prioOrder[a.priority] ?? 3
    const pb = prioOrder[b.priority] ?? 3
    if (pa !== pb) return pa - pb
    const da = a.due_date ? new Date(a.due_date).getTime() : Infinity
    const db = b.due_date ? new Date(b.due_date).getTime() : Infinity
    if (da !== db) return da - db
    return (a.title || '').localeCompare(b.title || '')
  })
}

export function groupByBucket(modifs) {
  const buckets = Object.fromEntries(PRIORITY_BUCKETS.map((b) => [b.key, []]))
  for (const m of modifs) {
    const k = bucketOf(m)
    buckets[k].push(m)
  }
  for (const k of Object.keys(buckets)) {
    buckets[k] = sortByPriorityInBucket(buckets[k])
  }
  return PRIORITY_BUCKETS.map((b) => ({ ...b, items: buckets[b.key] }))
}

// ---------------------------------------------------------------
// Journal des remarques — encodé dans le champ `notes` :
// chaque entrée débute par [YYYY-MM-DD HH:MM] suivi du texte.
// Zéro migration nécessaire, format lisible même en direct.
// ---------------------------------------------------------------

const JOURNAL_LINE = /^\[(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?)\]\s*(.*)$/

export function parseJournal(notes) {
  if (!notes) return { intro: '', entries: [] }
  const lines = String(notes).split('\n')
  const entries = []
  const introLines = []
  let cur = null
  let seenFirstEntry = false

  for (const raw of lines) {
    const m = raw.match(JOURNAL_LINE)
    if (m) {
      if (cur) entries.push(cur)
      cur = { date: m[1], text: m[2] }
      seenFirstEntry = true
    } else if (cur) {
      cur.text = cur.text ? `${cur.text}\n${raw}` : raw
    } else if (!seenFirstEntry) {
      introLines.push(raw)
    }
  }
  if (cur) entries.push(cur)

  // Nettoyage : trim textes
  for (const e of entries) e.text = e.text.trim()
  const intro = introLines.join('\n').trim()

  // Ordre chronologique décroissant
  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return { intro, entries }
}

/** Formate un timestamp local court "YYYY-MM-DD HH:MM". */
function nowStamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Ajoute une remarque au journal (append), renvoie le nouveau `notes`. */
export function appendJournalEntry(notes, text) {
  const clean = String(text || '').trim()
  if (!clean) return notes
  const stamp = nowStamp()
  const entry = `[${stamp}] ${clean}`
  return notes && notes.trim() ? `${notes}\n${entry}` : entry
}
