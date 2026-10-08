// E-commerce — un seul type d'objet (movement), 6 kinds, un localStorage.
// Rien ne quitte le navigateur. Pas de framework, pas de dépendance externe.

export const KEY = 'ecom.v1'    // conservée pour retro-compat lecture
export const KEY_V2 = 'ecom.v2' // clé effective de l'état v2

export const SOURCES = [
  { key: 'codpartner',    label: 'CODPartner' },
  { key: 'codnetwork',    label: 'COD Network' },
  { key: 'tiktok',        label: 'TikTok' },
  { key: 'snapchat',      label: 'Snapchat' },
  { key: 'shopify',       label: 'Shopify' },
  { key: 'lightfunnels',  label: 'LightFunnels' },
  { key: 'llc',           label: 'LLC / admin' },
  { key: 'perso',         label: 'Perso' },
  { key: 'autre',         label: 'Autre' },
]

export const KINDS = [
  { key: 'revenue',    label: 'Recette',      sign: +1, color: '#16a34a' },
  { key: 'ads',        label: 'Publicité',    sign: -1, color: '#dc2626' },
  { key: 'stock',      label: 'Stock',        sign: -1, color: '#7c3aed' },
  { key: 'logistics',  label: 'Logistique',   sign: -1, color: '#0891b2' },
  { key: 'callcenter', label: 'Call center',  sign: -1, color: '#ea580c' },
  { key: 'overhead',   label: 'Frais fixes',  sign: -1, color: '#64748b' },
]

export const KIND_BY_KEY = Object.fromEntries(KINDS.map((k) => [k.key, k]))
export const SOURCE_BY_KEY = Object.fromEntries(SOURCES.map((s) => [s.key, s]))
export const KIND_KEYS = KINDS.map((k) => k.key)
export const PERIODS = ['daily', 'weekly', 'monthly', 'oneoff']

// ---------- Extensions modèle v2 ----------
export const MARKETS = [
  { key: 'KSA', label: 'Arabie Saoudite', currency: 'SAR', usd: 3.75 },
  { key: 'UAE', label: 'Émirats',         currency: 'AED', usd: 3.6725 },
  { key: 'KWT', label: 'Koweït',          currency: 'KWD', usd: 0.307 },
  { key: 'QAT', label: 'Qatar',           currency: 'QAR', usd: 3.64 },
  { key: 'BHR', label: 'Bahreïn',         currency: 'BHD', usd: 0.376 },
  { key: 'OMN', label: 'Oman',            currency: 'OMR', usd: 0.385 },
  { key: 'MAR', label: 'Maroc',           currency: 'MAD', usd: 9.5 },
]
export const MARKET_BY_KEY = Object.fromEntries(MARKETS.map((m) => [m.key, m]))

export const PLATFORMS = [
  { key: 'tiktok',   label: 'TikTok Ads' },
  { key: 'snapchat', label: 'Snapchat Ads' },
  { key: 'meta',     label: 'Meta Ads' },
]

export const PRODUCT_STATUS = [
  { key: 'testing',      label: 'En test' },
  { key: 'active',       label: 'Actif' },
  { key: 'liquidating',  label: 'Écoulement' },
  { key: 'killed',       label: 'Tué' },
]

export const CAMPAIGN_STATUS = ['active', 'paused', 'ended']

export const CREATIVE_FORMATS = [
  { key: 'faceless',     label: 'Faceless' },
  { key: 'ugc_creator',  label: 'UGC créateur' },
  { key: 'static',       label: 'Statique' },
  { key: 'carousel',     label: 'Carrousel' },
]

export const ANGLE_CATEGORIES = [
  { key: 'trust',   label: 'Trust' },
  { key: 'pain',    label: 'Pain' },
  { key: 'status',  label: 'Status' },
  { key: 'novelty', label: 'Novelty' },
  { key: 'price',   label: 'Price' },
  { key: 'social',  label: 'Social' },
]

// Taux SAR par défaut est celui du réel (peg 3,75). Le brief vérifie la formule
// avec ~8,2 USD sur bundle KSA — ça correspond à taux 4,0 (usage arrondi).
// Je garde 3,75 (le vrai) et documente l'écart de ~10 % dans le message.
export function convertToUSD(amount, currency, settings) {
  const a = Number(amount) || 0
  if (!settings) return a
  if (currency === settings.baseCurrency) return a
  // MARKETS override localStorage rates si présent
  const m = MARKETS.find((mk) => mk.currency === currency)
  const rate = settings.rates?.[currency] ?? m?.usd
  if (!rate) return a
  return a / rate
}

// -----------------------------------------------------------
// Conversion + formatage
// -----------------------------------------------------------

/** Convertit un montant vers la devise de base en utilisant les taux actuels. */
export function toBase(amount, currency, settings) {
  const a = Number(amount) || 0
  if (!settings) return a
  if (currency === settings.baseCurrency) return a
  const rate = settings.rates?.[currency]
  if (!rate) return a
  // rates[X] = "1 USD = X unités de X". Donc pour convertir X → USD : montant / rate.
  return a / rate
}

const round2 = (n) => Math.round(Number(n) * 100) / 100

const _nf = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export function formatMoney(amount, currency = 'USD') {
  const s = _nf.format(Math.abs(Number(amount) || 0))
  const sign = (Number(amount) || 0) < 0 ? '-' : ''
  const sym = currency === 'USD' ? '$' : currency === 'MAD' ? 'DH' : currency
  return `${sign}${s} ${sym}`
}

export function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function daysBetween(fromKey, toKey) {
  if (!fromKey || !toKey) return 0
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  const a = Date.UTC(fy, fm - 1, fd)
  const b = Date.UTC(ty, tm - 1, td)
  return Math.round((b - a) / 86_400_000)
}

export function addDays(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

// -----------------------------------------------------------
// Formules
// -----------------------------------------------------------

/** Contribution algébrique d'un mouvement au net (en devise de base). */
export function netMovement(m, settings) {
  const sign = KIND_BY_KEY[m.kind]?.sign ?? -1
  return sign * toBase(m.amount, m.currency, settings)
}

/** Filtre les mouvements datés dans [from, to] (bornes incluses). */
export function inRange(movements, fromKey, toKey) {
  return movements.filter((m) => !m.undated && m.date >= fromKey && m.date <= toKey)
}

export function netPeriod(movements, fromKey, toKey, settings) {
  return round2(inRange(movements, fromKey, toKey).reduce((s, m) => s + netMovement(m, settings), 0))
}

export function netUndated(movements, settings) {
  return round2(movements.filter((m) => m.undated).reduce((s, m) => s + netMovement(m, settings), 0))
}

export function netTotal(movements, settings) {
  return round2(netPeriod(movements, settings.startDate, todayKey(), settings) + netUndated(movements, settings))
}

export function totalRevenue(movements, settings) {
  return round2(movements
    .filter((m) => m.kind === 'revenue')
    .reduce((s, m) => s + toBase(m.amount, m.currency, settings), 0))
}

export function totalSpend(movements, settings) {
  return round2(movements
    .filter((m) => m.kind !== 'revenue')
    .reduce((s, m) => s + toBase(m.amount, m.currency, settings), 0))
}

export function spendByKind(movements, settings) {
  const out = Object.fromEntries(KIND_KEYS.filter((k) => k !== 'revenue').map((k) => [k, 0]))
  for (const m of movements) {
    if (m.kind === 'revenue') continue
    if (out[m.kind] === undefined) continue
    out[m.kind] += toBase(m.amount, m.currency, settings)
  }
  for (const k of Object.keys(out)) out[k] = round2(out[k])
  return out
}

export function adsShare(movements, settings) {
  const s = spendByKind(movements, settings)
  const totalS = Object.values(s).reduce((a, b) => a + b, 0)
  if (totalS <= 0) return 0
  return s.ads / totalS
}

export function burnRate(movements, settings) {
  const to = todayKey()
  const from = addDays(to, -29)
  const rev = inRange(movements, from, to).filter((m) => m.kind === 'revenue')
    .reduce((s, m) => s + toBase(m.amount, m.currency, settings), 0)
  const sp = inRange(movements, from, to).filter((m) => m.kind !== 'revenue')
    .reduce((s, m) => s + toBase(m.amount, m.currency, settings), 0)
  return round2(sp - rev)
}

export function stockValue(positions) {
  return round2((positions?.stock || []).reduce((s, r) => s + (Number(r.units) || 0) * (Number(r.unitCost) || 0), 0))
}

/** Alerte prioritaire (une seule, la plus urgente). */
export function primaryAlert(movements, positions, settings) {
  const share = adsShare(movements, settings)
  if (share > 0.45) return {
    tone: 'warn',
    text: `La publicité représente ${(share * 100).toFixed(0)} % de tout ce que tu dépenses.`,
  }
  const burn = burnRate(movements, settings)
  if (burn > 0) return {
    tone: 'crit',
    text: `Tu perds ${formatMoney(burn, settings.baseCurrency)} sur les 30 derniers jours au rythme actuel.`,
  }
  const stock = stockValue(positions)
  const net = netTotal(movements, settings)
  if (net < 0 && stock > Math.abs(net)) return {
    tone: 'warn',
    text: `${formatMoney(stock, settings.baseCurrency)} dorment en stock, plus que ta perte cumulée.`,
  }
  return { tone: 'ok', text: 'Rien à signaler ce mois-ci.' }
}

// -----------------------------------------------------------
// Série "net cumulé jour par jour" pour la courbe
// -----------------------------------------------------------
export function cumulativeSeries(movements, fromKey, toKey, settings) {
  const bucket = new Map()
  for (const m of movements) {
    if (m.undated || m.date < fromKey || m.date > toKey) continue
    const prev = bucket.get(m.date) || 0
    bucket.set(m.date, prev + netMovement(m, settings))
  }
  const days = daysBetween(fromKey, toKey)
  const out = []
  let cum = 0
  for (let i = 0; i <= days; i++) {
    const d = addDays(fromKey, i)
    cum += bucket.get(d) || 0
    out.push({ date: d, value: round2(cum) })
  }
  return out
}

// -----------------------------------------------------------
// Défauts feeGrid + decisionRules (v2)
// -----------------------------------------------------------

export function defaultFeeGrid() {
  return {
    leadFee: 0.50,
    confirmFee: 1.00,
    deliveredFee: 2.00,
    shippingFee: { KSA: 2.99, UAE: 4.99, default: 5.99 },
    returnFee: 4.99,
    fulfillmentFee: 0.00,
    codCommission: 0.05,
    fxFee: 0.015,
  }
}

export function defaultDecisionRules() {
  return {
    winner: { ctrMin: 0.02, confMin: 0.40, cplMax: 4, netPerDelivMin: 10 },
    kill:   { ctrMax: 0.015, cpdMax: 15, confMax: 0.30 },
    minLeadsForVerdict: 20,
    minDaysForVerdict: 7,
  }
}

// -----------------------------------------------------------
// Formule plafond CPL
// -----------------------------------------------------------

/** Renvoie prix par livraison en USD selon variante (single/bundle2/bundle3). */
export function unitPriceUSD(product, variant, settings) {
  const p = product?.pricing?.[variant]
  if (!p) return 0
  return convertToUSD(p.price, p.currency, settings)
}

/** Coût produit d'une "livraison" selon variante (bundle N = N × cogs). */
export function unitCogsForVariant(product, variant) {
  const cogs = Number(product?.cogs) || 0
  if (variant === 'bundle2') return cogs * 2
  if (variant === 'bundle3') return cogs * 3
  return cogs
}

/**
 * Marge par livraison + Plafond CPL selon la formule du brief §3.2.
 * Renvoie aussi le détail des composantes pour affichage.
 */
export function computeCPLCap({ product, variant = 'single', confRate, delivRate, settings }) {
  const grid = settings.feeGrid || defaultFeeGrid()
  const P = unitPriceUSD(product, variant, settings)
  const F = unitCogsForVariant(product, variant)
  const market = product?.market || 'KSA'
  const shipping = grid.shippingFee?.[market] ?? grid.shippingFee?.default ?? 0
  const c = Math.max(0, Math.min(1, Number(confRate) || 0))
  const d = Math.max(0, Math.min(1, Number(delivRate) || 0))

  const margeParLivraison =
    P - F - shipping - grid.deliveredFee
    - (grid.codCommission + grid.fxFee) * P
    - (grid.fulfillmentFee || 0)

  const plafondCPL =
    c * d * margeParLivraison
    - grid.leadFee
    - c * grid.confirmFee
    - c * (1 - d) * grid.returnFee

  return {
    P, F, shipping, c, d,
    margeParLivraison: round2(margeParLivraison),
    plafondCPL: round2(plafondCPL),
    variant, market,
  }
}

// -----------------------------------------------------------
// KPIs produit (fenêtre glissante)
// -----------------------------------------------------------

/** Somme un champ des mouvements 'ads' pour un produit sur [from,to]. */
function adsSpendForProduct(movements, productId, fromKey, toKey, settings) {
  let s = 0
  for (const m of movements) {
    if (m.kind !== 'ads' || m.productId !== productId) continue
    if (m.undated) continue
    if (m.date < fromKey || m.date > toKey) continue
    s += toBase(m.amount, m.currency, settings)
  }
  return s
}

/** Somme un champ des `daily` pour un produit — via les campagnes du produit. */
function dailyFieldForProduct(daily, campaigns, productId, field, fromKey, toKey) {
  const campIds = new Set(campaigns.filter((c) => c.productId === productId).map((c) => c.id))
  let s = 0
  for (const d of daily) {
    if (!campIds.has(d.campaignId)) continue
    if (d.date < fromKey || d.date > toKey) continue
    s += Number(d[field]) || 0
  }
  return s
}

/**
 * KPIs 6-en-1 d'un produit sur une fenêtre glissante.
 * `confirmed` et `delivered` viennent des mouvements `daily_import` de type
 * revenue avec `confirmed_count` / `delivered_count` si disponible (§6),
 * sinon des relevés hebdo — pour l'instant on utilise ce que l'utilisateur
 * remplit dans `daily` (leads + confirmed + delivered facultatifs).
 */
export function productKPIs({ product, movements, daily, campaigns, settings, days = 7 }) {
  const to = todayKey()
  const from = addDays(to, -(days - 1))
  const leads     = dailyFieldForProduct(daily, campaigns, product.id, 'leads', from, to)
  const confirmed = dailyFieldForProduct(daily, campaigns, product.id, 'confirmed', from, to)
  const delivered = dailyFieldForProduct(daily, campaigns, product.id, 'delivered', from, to)
  const spend     = adsSpendForProduct(movements, product.id, from, to, settings)
  const revenue   = dailyFieldForProduct(daily, campaigns, product.id, 'revenueUSD', from, to)
  const cpl = leads > 0 ? spend / leads : 0
  const cpd = delivered > 0 ? spend / delivered : 0
  const confRate = leads > 0 ? confirmed / leads : 0
  const delivRate = confirmed > 0 ? delivered / confirmed : 0
  const netPerDeliv = delivered > 0 ? (revenue - spend) / delivered : 0
  return {
    leads, confirmed, delivered, spend, revenue,
    cpl: round2(cpl), cpd: round2(cpd),
    confRate, delivRate, netPerDeliv: round2(netPerDeliv),
    windowFrom: from, windowTo: to,
  }
}

/** Verdict SCALE / OPTIMISER / KILL / EN TEST — §4. */
export function verdictFor({ kpis, rules, ctr = 0 }) {
  const r = rules || defaultDecisionRules()
  const minL = r.minLeadsForVerdict ?? 20
  if (kpis.leads < minL || kpis.confirmed < minL) {
    return { key: 'testing', label: 'EN TEST', tone: 'neutral', reason: `Échantillon insuffisant (${kpis.confirmed} confirmés < ${minL})` }
  }
  // Winner : 3/4 critères
  const wins = [
    ctr >= r.winner.ctrMin,
    kpis.confRate >= r.winner.confMin,
    kpis.cpl > 0 && kpis.cpl <= r.winner.cplMax,
    kpis.netPerDeliv >= r.winner.netPerDelivMin,
  ].filter(Boolean).length
  if (wins >= 3) return { key: 'scale', label: 'SCALE', tone: 'good' }
  // Kill : 2/3 critères
  const kills = [
    ctr > 0 && ctr < r.kill.ctrMax,
    kpis.cpd > 0 && kpis.cpd > r.kill.cpdMax,
    kpis.confRate > 0 && kpis.confRate < r.kill.confMax,
  ].filter(Boolean).length
  if (kills >= 2) return { key: 'kill', label: 'KILL', tone: 'bad' }
  return { key: 'optimise', label: 'OPTIMISER', tone: 'warn' }
}

// -----------------------------------------------------------
// Jauge CPL
// -----------------------------------------------------------
export function cplGauge(kpis, plafond) {
  if (plafond <= 0) return { ratio: Infinity, tone: 'bad', label: 'Non rentable au prix actuel' }
  if (kpis.cpl <= 0) return { ratio: 0, tone: 'neutral', label: '—' }
  const ratio = kpis.cpl / plafond
  if (ratio < 0.70) return { ratio, tone: 'good', label: 'Marge confortable' }
  if (ratio <= 1.00) return { ratio, tone: 'warn', label: 'Rentable mais serré' }
  return { ratio, tone: 'bad', label: 'Tu perds de l\'argent sur chaque lead' }
}

// -----------------------------------------------------------
// Stock — couverture, valeur immobilisée, alertes (§7)
// -----------------------------------------------------------

/** Livraisons totales du produit sur les N derniers jours (via daily). */
function deliveredLastNDays(daily, campaigns, productId, days = 30) {
  const to = todayKey()
  const from = addDays(to, -(days - 1))
  return dailyFieldForProduct(daily, campaigns, productId, 'delivered', from, to)
}

/** joursDeCouverture + valeurImmobilisée + lastMovementAt par ligne stock. */
export function stockRowMetrics({ row, product, daily, campaigns, movements, todayK }) {
  const units = Number(row.units) || 0
  const unitCost = Number(row.unitCost) || 0
  const valueImmob = round2(units * unitCost)
  const delivered30 = product ? deliveredLastNDays(daily, campaigns, product.id, 30) : 0
  const dailyRate = delivered30 / 30
  const coverage = dailyRate > 0 ? Math.round(units / dailyRate) : Infinity
  // Dernier mouvement stock du produit
  let lastMovement = null
  for (const m of movements) {
    if (m.kind !== 'stock') continue
    if (product && m.productId !== product.id) continue
    if (m.undated) continue
    if (!lastMovement || m.date > lastMovement) lastMovement = m.date
  }
  const daysSinceLast = lastMovement ? daysBetween(lastMovement, todayK) : null
  return { units, unitCost, valueImmob, delivered30, coverage, daysSinceLast, lastMovement }
}

/** Génère les alertes stock d'après les 3 règles du §7.3. */
export function stockAlerts(state) {
  const alerts = []
  const t = todayKey()
  for (const row of state.positions?.stock || []) {
    // Trouver le produit par SKU
    const product = (state.products || []).find((p) => (p.sku || []).includes(row.sku))
    const m = stockRowMetrics({
      row, product,
      daily: state.daily || [],
      campaigns: state.campaigns || [],
      movements: state.movements || [],
      todayK: t,
    })
    if (m.coverage !== Infinity && m.coverage < 14) {
      alerts.push({ tone: 'crit', key: `low-${row.sku}-${row.warehouse}`, sku: row.sku, warehouse: row.warehouse, text: `Rupture dans ${m.coverage} j au rythme actuel (${row.sku} · ${row.warehouse})` })
    } else if (m.coverage !== Infinity && m.coverage > 90) {
      alerts.push({ tone: 'warn', key: `dorm-${row.sku}-${row.warehouse}`, sku: row.sku, warehouse: row.warehouse, text: `Stock dormant — ${formatMoney(m.valueImmob)} immobilisés, ${m.coverage} j d'écoulement (${row.sku} · ${row.warehouse})` })
    }
    if (m.daysSinceLast !== null && m.daysSinceLast > 30) {
      alerts.push({ tone: 'warn', key: `still-${row.sku}-${row.warehouse}`, sku: row.sku, warehouse: row.warehouse, text: `Aucun mouvement depuis ${m.daysSinceLast} j (${row.sku} · ${row.warehouse})` })
    }
  }
  return alerts
}

// -----------------------------------------------------------
// Angles — agrège les stats de toutes les créas qui portent un angle
// -----------------------------------------------------------
export function angleAggregates({ angle, creatives, movements, daily, campaigns, settings, windowDays = 30 }) {
  const to = todayKey()
  const from = addDays(to, -(windowDays - 1))
  const angleCreatives = creatives.filter((c) => c.angleId === angle.id)
  const products = new Set()
  let spend = 0, leads = 0, delivered = 0
  for (const cr of angleCreatives) {
    // Dépenses : mouvements ads liés à la créative
    for (const m of movements) {
      if (m.kind !== 'ads' || m.creativeId !== cr.id) continue
      if (m.undated || m.date < from || m.date > to) continue
      spend += toBase(m.amount, m.currency, settings)
    }
    // Leads/livrés via daily de campagnes qui portent cette créa
    const camp = campaigns.find((c) => c.id === cr.campaignId)
    if (camp?.productId) products.add(camp.productId)
    for (const d of (daily || [])) {
      if (d.creativeId !== cr.id) continue
      if (d.date < from || d.date > to) continue
      leads     += Number(d.leads) || 0
      delivered += Number(d.delivered) || 0
    }
  }
  return {
    angle,
    creativesCount: angleCreatives.length,
    markets: Array.from(new Set(angleCreatives.flatMap((cr) => {
      const camp = campaigns.find((c) => c.id === cr.campaignId)
      const p = (camp?.productId) ? (arguments[0]?.products || []).find(pp => pp.id === camp.productId) : null
      return p?.market ? [p.market] : []
    }))),
    productsCount: products.size,
    spend: round2(spend), leads, delivered,
    cpd: delivered > 0 ? round2(spend / delivered) : 0,
  }
}

// -----------------------------------------------------------
// Saisie du soir : convertit une liste de rows (campaign, spend, leads)
// en 1 mouvement ads + 1 entrée daily par row.
// -----------------------------------------------------------
export function buildEveningEntries({ rows, date, campaigns, products, baseCurrency }) {
  const now = new Date().toISOString()
  const mv = []
  const daily = []
  for (const r of rows) {
    const camp = campaigns.find((c) => c.id === r.campaignId)
    if (!camp) continue
    const spend = Number(r.spend) || 0
    const leads = Number(r.leads) || 0
    if (spend > 0) {
      mv.push({
        id: `mv_${Math.random().toString(36).slice(2, 10)}`,
        createdAt: now,
        date, source: camp.platform || 'autre',
        kind: 'ads',
        amount: round2(spend), currency: r.currency || baseCurrency || 'USD',
        note: `Saisie du soir — ${camp.name}`,
        productId: camp.productId,
        campaignId: camp.id,
        creativeId: r.creativeId || null,
        period: 'daily', undated: false,
      })
    }
    daily.push({
      id: `d_${Math.random().toString(36).slice(2, 10)}`,
      date, campaignId: camp.id,
      creativeId: r.creativeId || null,
      spend: round2(spend), currency: r.currency || baseCurrency || 'USD',
      leads,
      confirmed: 0, delivered: 0, revenueUSD: 0,
      createdAt: now,
    })
  }
  return { movements: mv, daily }
}

// -----------------------------------------------------------
// Seed — historique réel reconstitué au 14 sept. 2026
// -----------------------------------------------------------

function mvId() {
  return `mv_${Math.random().toString(36).slice(2, 10)}`
}

// COD Network — 45 factures hebdomadaires
const CODN_INVOICES = [
  ['2025-09-15',    0.00], ['2025-09-22',    0.00],
  ['2025-10-01',   -1.50], ['2025-10-08',    0.00], ['2025-10-15',   -1.50], ['2025-10-22',   -0.50],
  ['2025-11-01',   -0.50], ['2025-11-08',    0.00], ['2025-11-15',  -10.98], ['2025-11-22',   47.61],
  ['2025-12-01',   -0.50], ['2025-12-08',   -0.50], ['2025-12-15',   -0.50], ['2025-12-22',   27.84],
  ['2026-01-01',   14.30], ['2026-01-08',  107.50], ['2026-01-15',   85.53], ['2026-01-22',   -3.00],
  ['2026-02-01',   77.31], ['2026-02-08',   -0.50], ['2026-02-15',    0.00], ['2026-02-22',    0.00],
  ['2026-03-01',    0.00], ['2026-03-08',    0.00], ['2026-03-15',    0.00], ['2026-03-22',    0.00],
  ['2026-04-01',    0.00], ['2026-04-08',  -12.00], ['2026-04-15',    0.00], ['2026-04-22',    0.00],
  ['2026-05-01',   -8.00], ['2026-05-08',  699.72], ['2026-05-15',   48.09], ['2026-05-22',   58.51],
  ['2026-06-01',  175.59], ['2026-06-08',  173.69], ['2026-06-15',   90.05], ['2026-06-22',  122.16],
  ['2026-07-01',    0.00], ['2026-07-08',    0.00], ['2026-07-15',    0.00], ['2026-07-22',    0.00],
  ['2026-08-01',   -1.00], ['2026-08-08',    0.00], ['2026-08-15',    0.00],
]

// CODPartner — 24 relevés hebdomadaires. Colonnes : date, encaissé, frais totaux, ads, stock.
const CODP_STATEMENTS = [
  ['2026-03-22',    0.00,    0.00,    0.00,    0.00],
  ['2026-03-29',    0.00,   33.97,    0.00,    0.00],
  ['2026-04-05',  401.18,  171.86,    0.00,   83.84],
  ['2026-04-05a',   0.00,   50.00,   50.00,    0.00],   // avance Snapchat (relevé séparé)
  ['2026-04-12',    0.00,    4.00,    0.00,    0.00],
  ['2026-04-19',    0.00,   15.48,    0.00,    0.00],
  ['2026-04-26',   99.57,   62.38,    0.00,   31.44],
  ['2026-05-03',   52.28,   35.05,    0.00,   10.48],
  ['2026-05-10',    0.00,  233.75,  105.00,    0.00],
  ['2026-05-17', 1264.00,  398.43,  105.00,    0.00],
  ['2026-05-24',  285.28,   42.73,    0.00,    0.00],
  ['2026-05-31',    0.00,  738.00,    0.00,  737.00],
  ['2026-06-07',    0.00,  748.50,    0.00,  737.00],
  ['2026-06-14',    0.00,  745.00,    0.00,  737.00],
  ['2026-06-21',  657.09,  298.02,   52.50,    0.00],
  ['2026-06-28',  534.85,  332.14,  210.00,    0.00],
  ['2026-07-05',  273.06,  132.51,    0.00,    0.00],
  ['2026-07-12',  719.62,  548.84,  420.00,    0.00],
  ['2026-07-19',  455.72,  424.88,  157.50,    0.00],
  ['2026-07-26',  645.14,  473.03,  315.00,    0.00],
  ['2026-08-02',  123.00,   10.15,    0.00,    0.00],
  ['2026-08-09',    0.00,    8.00,    0.00,    0.00],
  ['2026-08-16',  234.84,  198.59,  105.00,    0.00],
  ['2026-08-23',    0.00,    3.99,    0.00,    0.00],
]

// Ratios de ventilation du résiduel (callcenter/logistics)
// D'après totaux globaux : cc 694.50 / (cc+log) 1852.54 = 37,49 %
const CC_RATIO = 694.50 / (694.50 + 1158.04)

// Abonnements (overhead)
const SUBS = [
  ['2025-10-25', 'shopify',       1.00],
  ['2025-11-24', 'shopify',       1.00],
  ['2025-12-03', 'lightfunnels',  9.99],
  ['2025-12-24', 'shopify',       0.00],
  ['2026-01-03', 'lightfunnels',  9.99],
  ['2026-01-06', 'lightfunnels',  2.11],
  ['2026-01-23', 'shopify',       8.00],
  ['2026-02-03', 'lightfunnels',  9.99],
  ['2026-02-22', 'shopify',      27.00],
  ['2026-03-03', 'lightfunnels',  9.99],
  ['2026-03-24', 'shopify',      27.00],
  ['2026-04-03', 'lightfunnels',  9.99],
  ['2026-04-23', 'shopify',      36.95],
  ['2026-05-23', 'shopify',      36.95],
  ['2026-06-22', 'shopify',      36.95],
  ['2026-07-22', 'shopify',      36.95],
  ['2026-08-21', 'shopify',      36.95],
  ['2026-09-07', 'lightfunnels',  9.99],
]

const UNDATED = [
  ['tiktok', 'ads',      3487.00, 'USD', '33 130 MAD, compte principal, taux 9,5'],
  ['perso',  'stock',     342.00, 'USD', 'Stock COD Network payé de la poche'],
  ['llc',    'overhead',  250.00, 'USD', 'Dravio Commerce LLC — création'],
]

/**
 * Construit la liste seed des mouvements. Déterministe sauf pour les IDs.
 */
export function buildSeedMovements() {
  const out = []
  const now = new Date().toISOString()
  const push = (o) => out.push({ id: mvId(), createdAt: now, ...o })

  // -------- COD Network : positif = revenue, négatif = logistics
  for (const [rawDate, amount] of CODN_INVOICES) {
    const date = rawDate.replace(/[a-z]$/, '')
    if (amount === 0) continue
    if (amount > 0) {
      push({
        date, source: 'codnetwork', kind: 'revenue',
        amount: round2(amount), currency: 'USD',
        note: `Facture COD Network — période du ${date}`,
        ref: `CODN-${date}`, period: 'weekly', undated: false,
      })
    } else {
      push({
        date, source: 'codnetwork', kind: 'logistics',
        amount: round2(-amount), currency: 'USD',
        note: `Facture COD Network négative (retours nets) — période du ${date}`,
        ref: `CODN-${date}`, period: 'weekly', undated: false,
      })
    }
  }

  // -------- CODPartner : jusqu'à 4 lignes par relevé
  for (const [rawDate, revenue, fees, ads, stock] of CODP_STATEMENTS) {
    const date = rawDate.replace(/[a-z]$/, '')
    const suffix = rawDate.endsWith('a') ? '-b' : ''
    if (revenue > 0) push({
      date, source: 'codpartner', kind: 'revenue',
      amount: round2(revenue), currency: 'USD',
      note: `Encaissement COD — relevé du ${date}`,
      ref: `CODP-${date}${suffix}`, period: 'weekly', undated: false,
    })
    if (ads > 0) push({
      date, source: 'codpartner', kind: 'ads',
      amount: round2(ads), currency: 'USD',
      note: `Avance publicitaire prélevée par CODPartner — ${date}${suffix ? ' (avance Snapchat)' : ''}`,
      ref: `CODP-${date}${suffix}`, period: 'weekly', undated: false,
    })
    if (stock > 0) push({
      date, source: 'codpartner', kind: 'stock',
      amount: round2(stock), currency: 'USD',
      note: `Sourcing / coût stock CODPartner — ${date}`,
      ref: `CODP-${date}${suffix}`, period: 'weekly', undated: false,
    })
    const residual = fees - ads - stock
    if (residual > 0.001) {
      const cc = round2(residual * CC_RATIO)
      const log = round2(residual - cc)
      if (cc > 0) push({
        date, source: 'codpartner', kind: 'callcenter',
        amount: cc, currency: 'USD',
        note: `Call center CODPartner (leads/confirmations/livrés) — ${date}`,
        ref: `CODP-${date}${suffix}`, period: 'weekly', undated: false,
      })
      if (log > 0) push({
        date, source: 'codpartner', kind: 'logistics',
        amount: log, currency: 'USD',
        note: `Logistique CODPartner (shipping/delivery/COD fees) — ${date}`,
        ref: `CODP-${date}${suffix}`, period: 'weekly', undated: false,
      })
    }
  }

  // Coût produit CODP séparé (non ventilé dans les relevés)
  push({
    date: '2026-08-16', source: 'codpartner', kind: 'stock',
    amount: 125.76, currency: 'USD',
    note: 'Coût produit CODPartner — reliquat non ventilé',
    ref: 'CODP-product-cost', period: 'oneoff', undated: false,
  })

  // -------- Abonnements (overhead)
  for (const [date, source, amount] of SUBS) {
    if (amount <= 0) continue
    push({
      date, source, kind: 'overhead',
      amount: round2(amount), currency: 'USD',
      note: `Abonnement ${SOURCE_BY_KEY[source]?.label || source}`,
      period: 'monthly', undated: false,
    })
  }

  // -------- Undated
  for (const [source, kind, amount, currency, note] of UNDATED) {
    push({
      date: '', source, kind,
      amount: round2(amount), currency,
      note, period: 'oneoff', undated: true,
    })
  }

  return out
}

export function buildSeedPositions() {
  return {
    platformBalances: [
      { source: 'codpartner', amount: -1100.66, currency: 'USD', label: 'Solde débiteur' },
      { source: 'codnetwork', amount:   384.90, currency: 'USD', label: 'Factures impayées' },
    ],
    stock: [
      { sku: 'CopOuadiiSpeakerBlack', warehouse: 'Riyadh', units: 174, unitCost: 5.50 },
      { sku: 'CopOuadiiSpeakerWhite', warehouse: 'Riyadh', units: 100, unitCost: 5.50 },
      { sku: 'CopOuadiiSpeakerBlack', warehouse: 'UAE',    units:  18, unitCost: 5.50 },
      { sku: 'CopOuadiiSpeakerWhite', warehouse: 'UAE',    units:  29, unitCost: 5.50 },
    ],
  }
}

export function buildSeedSettings() {
  return {
    baseCurrency: 'USD',
    displaySecondary: 'MAD',
    rates: { MAD: 9.5, SAR: 3.75, AED: 3.6725, KWD: 0.307, QAR: 3.64, BHD: 0.376, OMR: 0.385 },
    startDate: '2025-09-15',
    feeGrid: defaultFeeGrid(),
    decisionRules: defaultDecisionRules(),
  }
}

export function buildSeedProducts() {
  return [
    {
      id: 'prd_speaker',
      name: 'Speaker à induction 5-en-1',
      sku: ['CopOuadiiSpeakerBlack', 'CopOuadiiSpeakerWhite'],
      market: 'KSA',
      platform: 'codpartner',
      status: 'active',
      pricing: {
        single:  { price: 199, currency: 'SAR' },
        bundle2: { price: 359, currency: 'SAR' },
        bundle3: { price: 499, currency: 'SAR' },
      },
      cogs: 5.50,
      s13Score: null,
      launchedAt: '2026-05-01',
      killedAt: null,
    },
  ]
}

export function buildSeedCampaigns() {
  return [
    {
      id: 'cmp_snap_ksa_02',
      productId: 'prd_speaker',
      platform: 'snapchat',
      name: 'Speaker KSA — lot 2',
      market: 'KSA',
      status: 'paused',
      startedAt: '2026-07-12',
      endedAt: null,
      budgetCap: 400,
    },
  ]
}

export function buildSeedAngles() {
  return [
    { id: 'ang_trust',   name: 'Élimination du risque — paiement à la réception', phrase: 'ما تدفع ريال لين تجربه', category: 'trust',   markets: ['KSA', 'UAE'] },
    { id: 'ang_novelty', name: 'Nouveauté — objet inédit',                         phrase: 'اكتشفت شي غير شكل غرفتي',   category: 'novelty', markets: ['KSA'] },
  ]
}

export function buildSeedCreatives() {
  return []
}

export function buildSeedDaily() {
  // Seed stock : 321 unités, ~4 livraisons/semaine = ~17/mois → couverture ~560 j.
  // On crée 30 jours de livraisons pour que le calcul de couverture tombe.
  const now = new Date()
  const out = []
  // 4 livraisons/sem sur prd_speaker via cmp_snap_ksa_02 sur les 30 derniers j
  // Distribue ~17 livraisons sur 30 jours
  for (let i = 0; i < 17; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - Math.round(i * (30 / 17)))
    out.push({
      id: `d_seed_${i}`,
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      campaignId: 'cmp_snap_ksa_02',
      creativeId: null,
      spend: 0, currency: 'USD',
      leads: 0, confirmed: 0, delivered: 1, revenueUSD: 0,
      createdAt: new Date().toISOString(),
    })
  }
  return out
}

export function buildSeedState() {
  return {
    version: 2,
    settings: buildSeedSettings(),
    movements: buildSeedMovements(),
    positions: buildSeedPositions(),
    products: buildSeedProducts(),
    campaigns: buildSeedCampaigns(),
    creatives: buildSeedCreatives(),
    angles: buildSeedAngles(),
    daily: buildSeedDaily(),
  }
}

/** Migre un état v1 vers v2 en ajoutant les collections manquantes. */
export function migrateToV2(state) {
  if (!state || state.version >= 2) return state
  return {
    ...state,
    version: 2,
    settings: {
      ...(state.settings || {}),
      feeGrid: state.settings?.feeGrid || defaultFeeGrid(),
      decisionRules: state.settings?.decisionRules || defaultDecisionRules(),
      rates: {
        ...(state.settings?.rates || {}),
        SAR: 3.75, AED: 3.6725, KWD: 0.307, QAR: 3.64, BHD: 0.376, OMR: 0.385,
      },
    },
    products: state.products || buildSeedProducts(),
    campaigns: state.campaigns || buildSeedCampaigns(),
    creatives: state.creatives || [],
    angles: state.angles || buildSeedAngles(),
    daily: state.daily || buildSeedDaily(),
  }
}

// -----------------------------------------------------------
// Import — parsers minimalistes
// -----------------------------------------------------------

/** Extrait des montants d'un texte de relevé CODPartner. Robuste au bruit.
 *  Retourne une liste de mouvements candidats (sans id).
 */
export function parseCodpStatement(text) {
  const out = []
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)

  // Trouve la Issued Date
  let issued = null
  let ref = null
  for (const l of lines) {
    const md = l.match(/issued\s*date[:\s]+(\d{4}-\d{2}-\d{2})/i)
    if (md) issued = md[1]
    const mr = l.match(/#(INC[\w\d-]+)/i)
    if (mr) ref = mr[1]
  }
  const date = issued || todayKey()

  // Motifs à mapper
  const rules = [
    { rx: /leads\s*entered|leads\s*confirmed|orders?\s*delivered|leads\s*confirmed\s*upsell/i, kind: 'callcenter' },
    { rx: /shipping\s*domestic|delivered\s*domestic|cod\s*fees/i, kind: 'logistics' },
    { rx: /gcc\s*marketing\s*advance|vat\s*for\s*#/i, kind: 'ads' },
    { rx: /sourcing\s*advances|products?\s*cost/i, kind: 'stock' },
    { rx: /cod\s*collected/i, kind: 'revenue' },
  ]
  const skip = /from\s*balance|subtotal|^total\b|affiliate\s*earnings/i

  for (const l of lines) {
    if (skip.test(l)) continue
    for (const r of rules) {
      if (!r.rx.test(l)) continue
      // Extrait le premier nombre "positif" (avec 2 décimales optionnelles)
      const m = l.match(/([\d,]+\.\d{2}|\d+\.\d{2}|\d+)/)
      if (!m) continue
      const amount = Number(String(m[1]).replace(/,/g, ''))
      if (!Number.isFinite(amount) || amount <= 0) continue
      out.push({
        date, source: 'codpartner', kind: r.kind,
        amount: round2(amount), currency: 'USD',
        note: l.slice(0, 140),
        ref: ref ? `#${ref}` : undefined,
        period: 'weekly', undated: false,
      })
      break
    }
  }
  return out
}

/** COD Network — extrait Profits + date + ref d'une facture collée. */
export function parseCodnInvoice(text) {
  const out = []
  const t = String(text || '')
  const mDate = t.match(/(\d{4}-\d{2}-\d{2})/)
  const mRef = t.match(/(?:invoice|ref|facture)\s*#?\s*([\w\d-]+)/i)
  const mProfits = t.match(/profits?\s*[:\s]+(-?[\d,]+\.\d{2}|-?\d+)/i)
  if (mProfits) {
    const amount = Number(String(mProfits[1]).replace(/,/g, ''))
    const date = mDate?.[1] || todayKey()
    const ref = mRef?.[1]
    if (Number.isFinite(amount)) {
      if (amount > 0) {
        out.push({ date, source: 'codnetwork', kind: 'revenue', amount: round2(amount), currency: 'USD', note: `Profits COD Network`, ref, period: 'weekly', undated: false })
      } else if (amount < 0) {
        out.push({ date, source: 'codnetwork', kind: 'logistics', amount: round2(-amount), currency: 'USD', note: `Profits négatifs COD Network`, ref, period: 'weekly', undated: false })
      }
    }
  }
  return out
}

/** TikTok / Snapchat — CSV avec colonnes date, montant, devise (auto-détection). */
export function parseAdsCsv(text, source = 'tiktok') {
  const rows = String(text || '').split('\n').map((r) => r.trim()).filter(Boolean)
  if (rows.length < 2) return []
  const headers = rows[0].split(/[,;\t]/).map((h) => h.trim().toLowerCase())
  const idx = {
    date: headers.findIndex((h) => /date|jour|day/.test(h)),
    amount: headers.findIndex((h) => /amount|spend|cost|montant|coût|depense/.test(h)),
    currency: headers.findIndex((h) => /currency|devise/.test(h)),
  }
  if (idx.date < 0 || idx.amount < 0) return []
  const out = []
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].split(/[,;\t]/).map((c) => c.trim())
    const date = cells[idx.date]
    const amount = Number(String(cells[idx.amount] || '').replace(/[^\d.\-]/g, ''))
    const currency = idx.currency >= 0 ? (cells[idx.currency] || 'USD') : 'USD'
    if (!date || !Number.isFinite(amount) || amount <= 0) continue
    out.push({ date, source, kind: 'ads', amount: round2(amount), currency, note: `Import ${source} ${date}`, period: 'daily', undated: false })
  }
  return out
}

/** Détecte doublons dans l'état actuel : même ref, ou même (date, source, montant). */
export function findDuplicates(candidates, existing) {
  const refs = new Set(existing.filter((m) => m.ref).map((m) => m.ref))
  const triples = new Set(existing.map((m) => `${m.date}|${m.source}|${m.amount}`))
  return candidates.filter((c) => {
    if (c.ref && refs.has(c.ref)) return true
    return triples.has(`${c.date}|${c.source}|${c.amount}`)
  })
}
