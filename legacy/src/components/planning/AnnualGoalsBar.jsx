import { useEffect, useMemo, useRef } from 'react'
import { useGoals } from '../../hooks/useGoals'
import { labelAccompli, estArabe } from '../../lib/goals'

/**
 * Les objectifs de l'année, relus depuis le 31 décembre.
 *
 * Énoncés au passé et datés de la fin de l'année : on ne vise plus, on
 * se souvient. C'est le seul rôle de ce bloc sur l'écran du matin — pas
 * de jauge, pas de pourcentage, pas de case à cocher ; la mesure vit sur
 * la page Objectifs.
 */
export default function AnnualGoalsBar() {
  const { state } = useGoals()
  const ref = useRef(null)

  /* Le bloc se cale juste sous l'en-tête, qui est lui-même collant. Sa
     hauteur dépend de la largeur de l'écran, donc on la mesure plutôt
     que de la deviner : un nombre en dur laisserait un trou ou un
     recouvrement selon le téléphone. */
  useEffect(() => {
    const poser = () => {
      const entete = document.querySelector('.app-header')
      const h = entete ? entete.getBoundingClientRect().height : 0
      if (ref.current) ref.current.style.setProperty('--vow-top', `${Math.round(h)}px`)
    }
    poser()
    window.addEventListener('resize', poser)
    return () => window.removeEventListener('resize', poser)
  }, [state])

  // Tous les objectifs, les privés compris : cet écran est le sien, et un
  // objectif caché le matin est un objectif qui ne pèse pas sur la journée.
  const visibles = useMemo(() => state?.goals || [], [state])

  if (visibles.length === 0) return null

  const card = state?.card || {}
  const dateFin = card.deadline
    ? new Date(card.deadline + 'T12:00:00').toLocaleDateString('fr-FR',
        { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <section className="vow" ref={ref}>
      {dateFin && <p className="vow__date">{dateFin}</p>}

      <ul className="vow__list">
        {visibles.map((g) => {
          const texte = labelAccompli(g)
          return (
            <li key={g.id} className={`vow__line ${estArabe(texte) ? 'is-ar' : ''}`}>
              {texte}
            </li>
          )
        })}
      </ul>

      {card.motto && <p className="vow__motto">{card.motto}</p>}
    </section>
  )
}
