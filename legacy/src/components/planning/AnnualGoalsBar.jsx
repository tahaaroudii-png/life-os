import { VOW, estArabe } from '../../lib/goals'
import '../../styles/vow.css'

/**
 * Les objectifs de l'année, relus depuis le 31 décembre.
 *
 * Énoncés au passé et datés de la fin de l'année : on ne vise plus, on
 * se souvient. C'est le seul rôle de ce bloc sur l'écran du matin — pas
 * de jauge, pas de pourcentage, pas de case à cocher ; la mesure vit sur
 * la page Objectifs.
 *
 * `compact` : la même promesse, posée en tête du formulaire d'ajout de
 * tâche. Elle ne s'accroche plus en haut de l'écran et laisse tomber la
 * date et la devise — dans une feuille de saisie, la place appartient au
 * champ qu'on remplit. Ne reste que ce qui doit peser sur le choix : les
 * phrases elles-mêmes.
 */
export default function AnnualGoalsBar({ compact = false }) {
  if (VOW.length === 0) return null

  // La date de fin d'année, en tête : c'est elle qui met les phrases au
  // passé. « Tu ne vises plus, tu te souviens. »
  const dateFin = '31 décembre 2026'

  return (
    <section className={`vow ${compact ? 'vow--compact' : ''}`}>

      {!compact && <p className="vow__date">{dateFin}</p>}
      <ul className="vow__list">
        {VOW.map(({ id, texte }) => (
          <li key={id} className={`vow__line ${estArabe(texte) ? 'is-ar' : ''}`}>
            {texte}
          </li>
        ))}
      </ul>

      {!compact && <p className="vow__motto">Believe and you shall receive</p>}
    </section>
  )
}
