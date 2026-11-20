/**
 * Lit une table entière, par tranches.
 *
 * PostgREST plafonne toute réponse à 1000 lignes. Sans ORDER BY, les 1000
 * rendues ne sont même pas les mêmes d'un appel à l'autre : passé ce seuil,
 * une requête ne renvoie plus l'état du monde mais un échantillon. Une
 * case cochée peut donc disparaître du lot et l'écran la croire non faite.
 *
 * Le plafond ne prévient pas : la réponse est un succès, simplement
 * tronquée. On pagine donc toujours, et on ordonne, pour que le résultat
 * soit complet et stable.
 */
const TRANCHE = 1000

export async function fetchAll(construireRequete, { ordre } = {}) {
  const tout = []
  for (let debut = 0; ; debut += TRANCHE) {
    let q = construireRequete()
    if (ordre) q = q.order(ordre.colonne, { ascending: ordre.ascendant !== false })
    const { data, error } = await q.range(debut, debut + TRANCHE - 1)
    if (error) throw error
    tout.push(...(data || []))
    if (!data || data.length < TRANCHE) return tout
  }
}
