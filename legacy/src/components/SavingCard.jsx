import { formatDH, formatPercent } from '../lib/format'

/**
 * Une enveloppe d'épargne : fond d'urgence, mariage, appartement.
 *
 * Toutes se lisent de la même façon — un solde, un objectif, et d'où sort
 * ce solde. Un total sans sa composition ne se vérifie pas : quand il
 * paraît faux, on ne sait pas quoi corriger.
 */
export default function SavingCard({ state, onVerser }) {
  if (!state) return null
  const { label, icone, cumulated, goal, percent, monthsRemaining,
          totalAllocated, totalDeposited, totalSpent } = state

  return (
    <section className="fund">
      <header className="fund__head">
        <h2>{icone ? `${icone} ` : ''}{label}</h2>
        {goal > 0 && <span className="fund__pct">{formatPercent(percent)}</span>}
      </header>

      {/* Le solde en grand : c'est le seul chiffre qu'il vient chercher. */}
      <p className="fund__amount">
        {formatDH(cumulated)}
        {goal > 0 && <span> sur {formatDH(goal)}</span>}
      </p>

      {goal > 0 && (
        <div className="fund__track">
          <div className="fund__fill" style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
      )}

      <p className="fund__eta">
        {monthsRemaining === 0
          ? 'Objectif atteint.'
          : monthsRemaining
          ? `Au rythme actuel, atteint dans ${monthsRemaining} mois.`
          : 'Fixe un objectif dans Réglages pour suivre la progression.'}
      </p>

      <dl className="fund__detail">
        <div>
          <dt>Mis de côté chaque mois</dt>
          <dd>{formatDH(totalAllocated)}</dd>
        </div>
        <div>
          <dt>Versements</dt>
          <dd className={totalDeposited > 0 ? 'is-plus' : ''}>
            {totalDeposited > 0 ? `+ ${formatDH(totalDeposited)}` : '—'}
          </dd>
        </div>
        <div>
          <dt>Retraits</dt>
          <dd className={totalSpent > 0 ? 'is-minus' : ''}>
            {totalSpent > 0 ? `− ${formatDH(totalSpent)}` : '—'}
          </dd>
        </div>
      </dl>

      <button type="button" className="btn-secondary fund__add" onClick={onVerser}>
        Verser sur {label.toLowerCase()}
      </button>
    </section>
  )
}
