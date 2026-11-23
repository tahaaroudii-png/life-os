import { useState } from 'react'
import { formatDH } from '../lib/format'
import '../styles/epargne.css'

/**
 * Une enveloppe d'épargne : fond d'urgence, mariage, appartement.
 *
 * Ce ne sont pas des lignes comptables mais ses objectifs de l'année, donc
 * chacune porte sa couleur : on reconnaît le mariage sans lire son nom.
 * L'arc dit la progression d'un coup d'œil ; le détail — d'où sort ce
 * total — attend qu'on tape la carte, parce qu'un solde sans sa
 * composition ne se vérifie pas, mais trois compositions empilées en
 * permanence rendraient l'écran illisible.
 */
const TEINTES = {
  urgence:     { de: '#0e7490', a: '#164e63' },
  mariage:     { de: '#9d174d', a: '#701a3f' },
  appart_mere: { de: '#166534', a: '#14532d' },
}
const DEFAUT = { de: '#334155', a: '#1e293b' }

const RAYON = 38
const LONGUEUR_ARC = Math.PI * RAYON

export default function SavingCard({ state, onVerser }) {
  const [ouvert, setOuvert] = useState(false)
  if (!state) return null

  const { key, label, icone, cumulated, goal, percent, monthsRemaining,
          totalAllocated, totalDeposited, totalSpent } = state

  const teinte = TEINTES[key] || DEFAUT
  const rempli = Math.max(0, Math.min(100, percent || 0))
  const offset = LONGUEUR_ARC * (1 - rempli / 100)

  return (
    <section
      className={`saving ${ouvert ? 'is-open' : ''}`}
      style={{ '--de': teinte.de, '--a': teinte.a }}
    >
      <button type="button" className="saving__main" onClick={() => setOuvert((v) => !v)}>
        <span className="saving__gauge">
          <svg width="92" height="56" viewBox="0 0 92 56" aria-hidden="true">
            <path d="M8 50 A38 38 0 0 1 84 50" fill="none" stroke="rgba(255,255,255,.26)"
                  strokeWidth="9" strokeLinecap="round" />
            {goal > 0 && (
              <path d="M8 50 A38 38 0 0 1 84 50" fill="none" stroke="#fff"
                    strokeWidth="9" strokeLinecap="round"
                    strokeDasharray={LONGUEUR_ARC} strokeDashoffset={offset} />
            )}
          </svg>
          {goal > 0 && <span className="saving__pct">{Math.round(percent)}%</span>}
        </span>

        <span className="saving__body">
          <span className="saving__name">{icone ? `${icone} ` : ''}{label}</span>
          <span className="saving__amount">{formatDH(cumulated)}</span>
          <span className="saving__goal">
            {goal > 0 ? `sur ${formatDH(goal)}` : 'aucun objectif fixé'}
          </span>
          <span className="saving__eta">
            {monthsRemaining === 0
              ? 'Objectif atteint.'
              : monthsRemaining
              ? `Atteint dans ${monthsRemaining} mois à ce rythme.`
              : ''}
          </span>
        </span>

        <span className="saving__chevron" aria-hidden="true">{ouvert ? '▴' : '▾'}</span>
      </button>

      {ouvert && (
        <dl className="saving__detail">
          <div>
            <dt>Mis de côté</dt>
            <dd>{formatDH(totalAllocated)}</dd>
          </div>
          <div>
            <dt>Versements</dt>
            <dd>{totalDeposited > 0 ? `+ ${formatDH(totalDeposited)}` : '—'}</dd>
          </div>
          <div>
            <dt>Retraits</dt>
            <dd>{totalSpent > 0 ? `− ${formatDH(totalSpent)}` : '—'}</dd>
          </div>
        </dl>
      )}

      <button type="button" className="saving__verser" onClick={onVerser}>
        Verser une somme
      </button>
    </section>
  )
}
