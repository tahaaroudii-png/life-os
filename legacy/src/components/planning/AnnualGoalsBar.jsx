import { useMemo, useState } from 'react'
import { useGoals } from '../../hooks/useGoals'
import { DOMAINS } from '../../lib/goals'

/**
 * Les objectifs de l'année, écrits, devant soi au moment de planifier.
 *
 * Volontairement sans jauge, sans pourcentage, sans verdict et sans case à
 * cocher : la mesure vit sur la page Objectifs. Ici on relit ce qu'on s'est
 * promis avant de choisir ce qu'on fait de la journée — rien d'autre.
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
    <section className="agoals">
      <header className="agoals__head">
        <h2>{card.title || `Objectifs ${annee}`}</h2>
      </header>

      {card.motto && <p className="agoals__motto">{card.motto}</p>}

      <ul className="agoals__list">
        {visibles.map((g) => (
          <li key={g.id} className="agoal">
            <span className="agoal__dot" style={{ background: DOMAINS[g.domain]?.light || 'var(--text-3)' }} />
            <div>
              <p className="agoal__label">{g.labelAr || g.label}</p>
              {g.subtitle && <p className="agoal__sub">{g.subtitle}</p>}
            </div>
          </li>
        ))}
      </ul>

      {nbPrives > 0 && (
        <button type="button" className="btn-link agoals__toggle"
                onClick={() => setShowPrivate((v) => !v)}>
          {showPrivate ? 'Masquer les objectifs privés' : `Afficher les ${nbPrives} objectifs privés`}
        </button>
      )}
    </section>
  )
}
