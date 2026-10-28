import { useMemo, useState } from 'react'
import { useGoals } from '../../hooks/useGoals'
import { DOMAINS } from '../../lib/goals'

/**
 * La page qu'on relit le matin.
 *
 * Ce n'est pas une liste de données : c'est ce que Tahar s'est promis,
 * dans ses mots, dont la moitié en arabe. D'où un panneau sombre — le
 * seul de l'écran — pour qu'on le lise avant les tâches ; l'arabe en
 * Amiri, à sa taille, parce que c'est le cœur de la chose ; et un filet
 * de couleur par domaine, qui porte une information plutôt qu'il ne
 * décore. Aucune mesure : elle vit sur la page Objectifs.
 */
export default function AnnualGoalsBar() {
  const { state } = useGoals()
  const [showPrivate, setShowPrivate] = useState(false)

  const { visibles, nbPrives } = useMemo(() => {
    const rows = state?.goals || []
    return {
      visibles: rows.filter((g) => showPrivate || !g.private),
      nbPrives: rows.filter((g) => g.private).length,
    }
  }, [state, showPrivate])

  if (visibles.length === 0) return null

  const card = state?.card || {}
  const annee = (card.deadline || '').slice(0, 4)

  return (
    <section className="vow">
      <p className="vow__question">{card.title || `Objectifs ${annee}`}</p>

      <ul className="vow__list">
        {visibles.map((g) => {
          const arabe = !!g.labelAr
          return (
            <li key={g.id} className="vow__item"
                style={{ '--dom': DOMAINS[g.domain]?.light || 'currentColor' }}>
              <p className={`vow__goal ${arabe ? 'is-ar' : ''}`} lang={arabe ? 'ar' : 'fr'}>
                {g.labelAr || g.label}
              </p>
              {g.subtitle && <p className="vow__sub">{g.subtitle}</p>}
            </li>
          )
        })}
      </ul>

      {card.motto && <p className="vow__motto">{card.motto}</p>}

      {nbPrives > 0 && (
        <button type="button" className="vow__toggle"
                onClick={() => setShowPrivate((v) => !v)}>
          {showPrivate ? 'Masquer les objectifs privés' : `+ ${nbPrives} objectifs privés`}
        </button>
      )}
    </section>
  )
}
