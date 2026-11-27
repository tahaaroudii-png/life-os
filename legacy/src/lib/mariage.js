/**
 * Choix décisif — le cadre de décision, côté logique pure.
 *
 * La règle qui gouverne tout : un critère éliminatoire répondu NON ferme le
 * dossier immédiatement, quel que soit le score. Le score ne sert qu'à
 * départager deux candidates qui passent TOUS les éliminatoires. Un score
 * élevé ne rachète jamais un éliminatoire manqué — c'est précisément ce que
 * ce cadre existe pour empêcher.
 */

export const CATEGORIES = [
  {
    key: 'eliminatoire',
    label: 'Éliminatoires',
    hint: 'OUI ou NON. Un seul NON ferme le dossier.',
    tone: 'danger',
  },
  {
    key: 'decisif',
    label: 'Décisifs',
    hint: 'Ce qui départage deux candidates qui passent les éliminatoires.',
    tone: 'accent',
  },
  {
    key: 'bonus',
    label: 'Bonus',
    hint: 'Agréable, jamais déterminant.',
    tone: 'muted',
  },
]

export const STATUSES = [
  { key: 'en_cours', label: 'En cours' },
  { key: 'retenue', label: 'Retenue' },
  { key: 'eliminee', label: 'Éliminée' },
  { key: 'fermee', label: 'Fermée' },
]

export const VERDICTS = {
  eliminee: { label: 'ÉLIMINÉE', tone: 'danger' },
  passe: { label: 'PASSE LES ÉLIMINATOIRES', tone: 'ok' },
  a_verifier: { label: 'À VÉRIFIER', tone: 'warn' },
}

/** Les critères d'une catégorie, dans l'ordre voulu. */
export function byCategory(criteria, category) {
  return criteria
    .filter((c) => c.category === category && c.active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
}

/** Index des notes d'une candidate, par criterion_id. */
export function indexScores(scores, candidateId) {
  const out = {}
  for (const s of scores) {
    if (s.candidate_id === candidateId) out[s.criterion_id] = s
  }
  return out
}

/**
 * Le score total : somme de (poids × note) sur les décisifs et les bonus.
 * Les éliminatoires ne comptent pas de points — ils ouvrent ou ferment,
 * ils ne nuancent pas.
 */
export function totalScore(criteria, scoresByCriterion) {
  let total = 0
  for (const c of criteria) {
    if (c.category === 'eliminatoire' || c.active === false) continue
    const note = scoresByCriterion[c.id]?.score
    if (typeof note === 'number') total += (c.weight ?? 1) * note
  }
  return total
}

/** Le maximum atteignable, recalculé depuis les critères : il suit leurs changements. */
export function maxScore(criteria) {
  let max = 0
  for (const c of criteria) {
    if (c.category === 'eliminatoire' || c.active === false) continue
    max += (c.weight ?? 1) * (c.max_score ?? 5)
  }
  return max
}

/**
 * Le verdict. Il précède le score et le domine :
 *   - un seul NON          → ÉLIMINÉE
 *   - tous les OUI remplis → PASSE
 *   - sinon                → À VÉRIFIER (il reste des éliminatoires sans réponse)
 */
export function verdict(criteria, scoresByCriterion) {
  const elim = byCategory(criteria, 'eliminatoire')
  if (elim.length === 0) return VERDICTS.a_verifier

  let oui = 0
  for (const c of elim) {
    const passed = scoresByCriterion[c.id]?.passed
    if (passed === false) return VERDICTS.eliminee
    if (passed === true) oui += 1
  }
  return oui === elim.length ? VERDICTS.passe : VERDICTS.a_verifier
}

/** Combien d'éliminatoires attendent encore une réponse. */
export function pendingEliminatories(criteria, scoresByCriterion) {
  return byCategory(criteria, 'eliminatoire').filter(
    (c) => typeof scoresByCriterion[c.id]?.passed !== 'boolean'
  ).length
}
