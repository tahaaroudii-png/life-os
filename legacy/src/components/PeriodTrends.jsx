import { useMemo } from 'react'
import { ENVELOPES } from '../lib/schema'
import { ENVELOPE_COLORS } from '../lib/chartSetup'
import { allocationFor } from '../lib/budget'
import { formatDH } from '../lib/format'

/**
 * Les périodes passées, rubrique par rubrique.
 *
 * Une seule question gouverne cet écran : est-ce que je dépense plus ou
 * moins que d'habitude, et sur quoi. D'où une ligne par enveloppe, les
 * périodes de la plus ancienne à la plus récente, et l'écart avec la
 * période précédente — un total seul ne dit pas s'il est anormal.
 *
 * Pas de bibliothèque de graphiques ici : des barres en SVG se lisent
 * mieux sur un téléphone qu'un graphe à légende, et pèsent moins.
 */
export default function PeriodTrends({ periods, settings, selectedKey, onSelect }) {
  // Du plus ancien au plus récent, douze périodes au plus : on lit un
  // historique de gauche à droite.
  const serie = useMemo(() => [...periods].reverse().slice(-12), [periods])

  if (serie.length === 0) return null

  return (
    <section className="trends">
      <header className="trends__head">
        <h2>Tendances</h2>
        <span className="muted small">{serie.length} période{serie.length > 1 ? 's' : ''} · du 20 au 19</span>
      </header>

      {ENVELOPES.map((env) => {
        const valeurs = serie.map((p) => Math.max(0, p.byEnvelope[env.key] || 0))
        const budget = allocationFor(settings, env.key)
        const haut = Math.max(budget, ...valeurs, 1)
        const dernier = valeurs[valeurs.length - 1] ?? 0
        const precedent = valeurs.length > 1 ? valeurs[valeurs.length - 2] : null
        const ecart = precedent == null || precedent === 0 ? null
          : Math.round(((dernier - precedent) / precedent) * 100)

        return (
          <article className="trend" key={env.key}>
            <div className="trend__head">
              <span className="trend__name">
                <i className="trend__dot" style={{ background: ENVELOPE_COLORS[env.key] }} />
                {env.label}
              </span>
              <span className="trend__now">
                {formatDH(dernier)}
                {ecart != null && (
                  <em className={ecart > 0 ? 'is-up' : ecart < 0 ? 'is-down' : ''}>
                    {ecart > 0 ? '+' : ''}{ecart} %
                  </em>
                )}
              </span>
            </div>

            <div className="trend__plot">
              {/* Le trait du budget, à sa hauteur réelle : sans lui, une barre
                  haute ne dit pas si elle est anormale. */}
              {budget > 0 && (
                <span className="trend__budget" style={{ bottom: `${(budget / haut) * 100}%` }} />
              )}
              <div className="trend__bars">
                {serie.map((p, i) => {
                  const v = valeurs[i]
                  const hauteur = Math.round((v / haut) * 100)
                  const depasse = budget > 0 && v > budget
                  const actif = selectedKey === p.key
                  return (
                    <button
                      key={p.key} type="button"
                      className={`trend__bar ${actif ? 'is-active' : ''} ${depasse ? 'is-over' : ''}`}
                      style={{ '--h': `${hauteur}%`, '--c': ENVELOPE_COLORS[env.key] }}
                      title={`${p.label} — ${formatDH(v)}${budget > 0 ? ` sur ${formatDH(budget)}` : ''}`}
                      onClick={() => onSelect(actif ? 'all' : p.key)}
                    >
                      <span />
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Le mois d'ouverture de chaque période, sinon on ne sait pas
                quelle barre on regarde — et sur un téléphone, rien ne survole. */}
            <div className="trend__axis">
              {serie.map((p) => (
                <span key={p.key} className={selectedKey === p.key ? 'is-active' : ''}>
                  {p.start.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}
                </span>
              ))}
            </div>

            {budget > 0 && (
              <p className="trend__foot">
                Budget {formatDH(budget)}
                {dernier > budget
                  ? ` · dépassé de ${formatDH(dernier - budget)}`
                  : ` · il reste ${formatDH(budget - dernier)}`}
              </p>
            )}
          </article>
        )
      })}

      <p className="trends__hint">
        Touche une barre pour filtrer le tableau sur cette période.
      </p>
    </section>
  )
}
