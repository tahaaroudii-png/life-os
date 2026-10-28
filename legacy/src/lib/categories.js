/**
 * La catégorie d'une dépense, lue dans ce qui était déjà écrit.
 *
 * Le schéma ne connaît que quatre enveloppes, et « Vie » en absorbe les
 * trois quarts : l'analyse ne pouvait donc rien dire d'autre que « tu
 * dépenses dans Vie ». L'information manquante n'était pas absente, elle
 * était dans la note — « carburant », « INWI abonnement », « nourriture ».
 * On la lit, sans rien demander de plus à la saisie et sans toucher à la
 * base.
 *
 * Trois natures, parce que c'est la distinction qui décide :
 *   fixe         — ce qui tombe chaque mois quoi qu'il arrive. Le plancher.
 *   variable     — ce qui dépend du mois, donc ce sur quoi on peut agir.
 *   exceptionnel — ce qui ne se reproduira pas, et qu'il serait faux de
 *                  projeter sur les mois suivants.
 */

export const NATURES = {
  fixe: { label: 'Fixe', help: 'Tombe chaque mois' },
  variable: { label: 'Variable', help: 'Dépend du mois' },
  exceptionnel: { label: 'Exceptionnel', help: 'Ne se reproduit pas' },
}

/**
 * Règles de reconnaissance, dans l'ordre : la première qui matche gagne.
 * Les plus spécifiques passent donc avant les plus larges — « frais
 * bancaires » avant « virement », « assurance voiture » avant « voiture ».
 */
export const CATEGORIES = [
  { key: 'amendes', label: 'Amendes & pénalités', icon: '🚫', nature: 'exceptionnel', leak: true,
    rules: /p[ée]nalit|exc[eè]s de vitesse|amende|contravention|manque signal|contredanse/i },
  { key: 'frais', label: 'Frais bancaires & pertes', icon: '🕳️', nature: 'variable', leak: true,
    rules: /frais bancaire|agios|commission|perdu|[eé]gar[ée]|gab\b/i },
  { key: 'abonnements', label: 'Abonnements', icon: '🔁', nature: 'fixe',
    rules: /abonnement|inwi|orange|maroc t[ée]l[ée]com|\biam\b|wifi|internet|claude|chatgpt|netflix|spotify|subscription|upgrade|forfait/i },
  { key: 'maison', label: 'Maison & charges', icon: '🏠', nature: 'fixe',
    rules: /loyer|[ée]lectricit|lydec|redal|amendis|\beau\b|butane|gaz|syndic|m[ée]nage|taxe (d')?habitation/i },
  { key: 'famille', label: 'Parents & famille', icon: '👪', nature: 'fixe',
    rules: /m[èe]re|p[èe]re|maman|papa|lwalid|walid|parents?|sahb lwalid|fr[èe]re|soeur|s(œ)ur|famille/i },
  { key: 'sante', label: 'Santé', icon: '➕', nature: 'variable',
    rules: /pharmacie|m[ée]decin|docteur|tbib|clinique|h[ôo]pital|dentiste|analyse|ordonnance|consultation|psychiatre|neuro|lunette/i },
  { key: 'voiture', label: 'Voiture (entretien)', icon: '🔧', nature: 'exceptionnel',
    rules: /r[ée]paration|vidange|pneu|m[ée]canic|garage|visite technique|assurance|carrosserie|batterie|voiture/i },
  { key: 'carburant', label: 'Carburant & route', icon: '⛽', nature: 'variable',
    rules: /carburant|mazot|essence|gasoil|diesel|autoroute|p[ée]age|takepower|taxi|\btrain\b|transport/i },
  { key: 'nourriture', label: 'Nourriture', icon: '🍲', nature: 'variable',
    rules: /nourritur|d[ée]jeuner|d[îi]ner|petit d[ée]j|caf[ée]|repas|restau|bilaban|[ée]picerie|souk|march[ée]|courses|pain|l(ait|ben)|snack/i },
  { key: 'dons', label: 'Dons & zakat', icon: '🤲', nature: 'variable',
    rules: /zakat|sadaqa|aum[ôo]ne|\bdon\b|charit|mosqu[ée]e|orphelin/i },
  { key: 'habillement', label: 'Habillement & soins', icon: '👕', nature: 'variable',
    rules: /v[êe]tement|habit|chaussure|jean|chemise|coiffeur|barbier|hammam|salon/i },
  { key: 'pub', label: 'Publicité & outils', icon: '📣', nature: 'variable',
    rules: /tiktok|meta|facebook|\bsnap|google ads|\bads?\b|light ?funnels|shopify|\bpub\b|cr[ée]a|influenceur|ugc/i },
  { key: 'stock', label: 'Stock & marchandise', icon: '📦', nature: 'variable',
    rules: /stock|marchandise|sl3a|fournisseur|achat produit|[ée]chantillon|sample|douane|fret|livraison/i },
  { key: 'sortie', label: 'Sorties & loisirs', icon: '🎬', nature: 'variable',
    rules: /sortie|cin[ée]ma|voyage|h[ôo]tel|week-?end|bled|vacance|jeu/i },
]

export const DIVERS = { key: 'divers', label: 'Non classé', icon: '❓', nature: 'variable' }

export const CATEGORY_BY_KEY = Object.fromEntries(
  [...CATEGORIES, DIVERS].map((c) => [c.key, c])
)

/* ------------------------------------------------------------------ */
/* Corrections manuelles                                              */
/* ------------------------------------------------------------------ */

const OVERRIDES_KEY = 'budget.categories.v1'

function readOverrides() {
  try {
    return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}')
  } catch {
    return {}
  }
}

export function getOverrides() {
  return readOverrides()
}

/** Reclasser une transaction à la main — la règle automatique s'efface pour elle. */
export function setOverride(txId, categoryKey) {
  if (!txId) return
  const all = readOverrides()
  if (categoryKey) all[txId] = categoryKey
  else delete all[txId]
  try {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(all))
  } catch {
    /* mode privé, quota : la règle automatique reprend la main, sans casser l'écran */
  }
  window.dispatchEvent(new Event('budget-categories-changed'))
}

/* ------------------------------------------------------------------ */
/* Classement                                                         */
/* ------------------------------------------------------------------ */

/** La catégorie déduite de la note seule, sans tenir compte des corrections. */
export function categorizeByRules(note, envelope) {
  const text = String(note || '')
  for (const c of CATEGORIES) {
    if (c.rules.test(text)) return c
  }
  // Une dépense de réinvestissement sans note reconnue reste de la publicité
  // dans neuf cas sur dix : c'est là que part ce budget.
  if (envelope === 'reinvest') return CATEGORY_BY_KEY.pub
  return DIVERS
}

/** La catégorie retenue pour une transaction : la correction d'abord, la règle ensuite. */
export function categoryOf(tx, overrides = null) {
  const ov = overrides || readOverrides()
  const forced = tx?.id && ov[tx.id]
  if (forced && CATEGORY_BY_KEY[forced]) return CATEGORY_BY_KEY[forced]
  return categorizeByRules(tx?.note, tx?.envelope)
}

/** Vrai pour l'argent qui n'a rien acheté : amendes, frais, sommes perdues. */
export function isLeak(category) {
  return Boolean(category?.leak)
}
