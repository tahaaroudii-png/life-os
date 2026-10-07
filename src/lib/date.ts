/**
 * Le seul module de dates de l'application.
 *
 * L'ancienne app en avait deux — lib/ecom.js et lib/planning.js — l'un
 * en UTC, l'autre en local, chacun exportant son `todayKey`. Les décalages
 * d'un jour sur les séries venaient de là. Il n'y en a plus qu'un, et rien
 * d'autre dans le code n'a le droit de construire une clé de date.
 *
 * Convention : une « clé » est une date nue au format `YYYY-MM-DD`,
 * calée sur le fuseau local de l'utilisateur (Africa/Casablanca), jamais
 * sur UTC. C'est ce que la colonne `date` de Postgres attend.
 */

export type DateKey = string

const PAD = (n: number) => String(n).padStart(2, '0')

/** Clé locale d'un objet Date. */
export function toKey(d: Date): DateKey {
  return `${d.getFullYear()}-${PAD(d.getMonth() + 1)}-${PAD(d.getDate())}`
}

/** Aujourd'hui, dans le fuseau de l'utilisateur. */
export function todayKey(): DateKey {
  return toKey(new Date())
}

/** Normalise une valeur venue de la base (`2026-10-07` ou un ISO complet). */
export function asKey(value: string | Date): DateKey {
  return typeof value === 'string' ? value.slice(0, 10) : toKey(value)
}

/**
 * Décale une clé de N jours. Le calcul passe par UTC pour qu'un changement
 * d'heure ne fasse pas sauter ou répéter un jour : on ne manipule que des
 * dates nues, l'heure n'intervient jamais.
 */
export function addDays(key: DateKey, days: number): DateKey {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return `${dt.getUTCFullYear()}-${PAD(dt.getUTCMonth() + 1)}-${PAD(dt.getUTCDate())}`
}

/** Nombre de jours entiers de `from` à `to`. Négatif si `to` précède `from`. */
export function daysBetween(from: DateKey, to: DateKey): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number]
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

/** Jour de la semaine ISO : 1 = lundi … 7 = dimanche. */
export function isoWeekday(key: DateKey): number {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return wd === 0 ? 7 : wd
}

/** Lundi de la semaine qui contient `key`. */
export function startOfWeek(key: DateKey): DateKey {
  return addDays(key, -(isoWeekday(key) - 1))
}

/** Les clés de `from` à `to`, bornes incluses. */
export function range(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = []
  const n = daysBetween(from, to)
  for (let i = 0; i <= n; i++) out.push(addDays(from, i))
  return out
}

const JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'] as const
const MOIS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin',
              'juil', 'août', 'sept', 'oct', 'nov', 'déc'] as const

/** « mar 7 oct » — l'affichage court des listes. */
export function formatShort(key: DateKey): string {
  const [, m, d] = key.split('-').map(Number) as [number, number, number]
  return `${JOURS.at(isoWeekday(key) - 1)} ${d} ${MOIS.at(m - 1)}`
}

/** « 7 octobre 2026 » — l'affichage des en-têtes. */
export function formatLong(key: DateKey): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

/** « 09:30 » depuis une colonne `time` de Postgres (`09:30:00`). */
export function formatTime(t: string | null): string {
  if (!t) return ''
  const [h, m] = t.split(':')
  return `${String(h).padStart(2, '0')}:${m ?? '00'}`
}
