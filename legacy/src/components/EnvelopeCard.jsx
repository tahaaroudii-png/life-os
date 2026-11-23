import { useState } from 'react'
import { formatDH } from '../lib/format'
import '../styles/epargne.css'

/**
 * Une enveloppe, qu'elle dépense ou qu'elle épargne.
 *
 * Les six se lisent de la même façon : un arc pour l'avancée, un montant
 * qui domine la carte, une couleur propre à chacune — on reconnaît le
 * mariage sans lire son nom. Le détail attend qu'on tape : un solde sans
 * sa composition ne se vérifie pas, mais six compositions ouvertes en
 * permanence rendraient l'écran illisible.
 *
 * Ce que dit le grand chiffre dépend de la nature de l'enveloppe. Pour
 * celles qui repartent à zéro le 20, c'est ce qu'il RESTE — la seule
 * question qu'on se pose devant elles. Pour celles qui s'accumulent,
 * c'est ce qui est déjà là.
 */
const TEINTES = {
  vie:            { de: '#1d4ed8', a: '#1e3a8a' },
  reinvest:       { de: '#b45309', a: '#7c2d12' },
  divertissement: { de: '#7e22ce', a: '#581c87' },
  urgence:        { de: '#0e7490', a: '#164e63' },
  mariage:        { de: '#9d174d', a: '#701a3f' },
  appart_mere:    { de: '#166534', a: '#14532d' },
}
const DEFAUT = { de: '#334155', a: '#1e293b' }
const DEPASSE = { de: '#b91c1c', a: '#7f1d1d' }

// Arc large : à 92 px de large le pourcentage était illisible sur un
// téléphone. Le demi-cercle porte maintenant le chiffre à l'intérieur.
const L = 132
const H = 82
const R = 56
const ARC = Math.PI * R

export default function EnvelopeCard({ state, onAction }) {
  const [ouvert, setOuvert] = useState(false)
  if (!state) return null

  const epargne = state.goal !== undefined
  const depasse = !epargne && state.ratio >= 1

  const teinte = depasse ? DEPASSE : (TEINTES[state.key] || DEFAUT)
  const pourcent = epargne
    ? Math.round(state.percent || 0)
    : Math.round((Number.isFinite(state.ratio) ? state.ratio : 0) * 100)
  const rempli = Math.max(0, Math.min(100, pourcent))
  const offset = ARC * (1 - rempli / 100)

  const grandChiffre = epargne ? state.cumulated : state.remaining
  const sousTitre = epargne
    ? (state.goal > 0 ? `sur ${formatDH(state.goal)}` : 'aucun objectif fixé')
    : `restant sur ${formatDH(state.allocated)}`

  const lignes = epargne
    ? [['Versé', state.totalDeposited > 0 ? formatDH(state.totalDeposited) : '—'],
       ['Retiré', state.totalSpent > 0 ? `− ${formatDH(state.totalSpent)}` : '—'],
       ['Prévu / mois', state.monthlyAllocation > 0 ? formatDH(state.monthlyAllocation) : '—']]
    : [['Alloué', formatDH(state.allocated)],
       ['Dépensé', formatDH(state.spent)],
       ['Restant', formatDH(state.remaining)]]

  return (
    <section className="saving" style={{ '--de': teinte.de, '--a': teinte.a }}>
      <button type="button" className="saving__main" onClick={() => setOuvert((v) => !v)}>
        <span className="saving__gauge">
          <svg width={L} height={H} viewBox={`0 0 ${L} ${H}`} aria-hidden="true">
            <path d={`M10 ${H - 10} A${R} ${R} 0 0 1 ${L - 10} ${H - 10}`} fill="none"
                  stroke="rgba(255,255,255,.26)" strokeWidth="11" strokeLinecap="round" />
            <path d={`M10 ${H - 10} A${R} ${R} 0 0 1 ${L - 10} ${H - 10}`} fill="none"
                  stroke="#fff" strokeWidth="11" strokeLinecap="round"
                  strokeDasharray={ARC} strokeDashoffset={offset} />
          </svg>
          <span className="saving__pct">{pourcent}%</span>
          <span className="saving__pctlbl">{epargne ? 'atteint' : 'consommé'}</span>
        </span>

        <span className="saving__body">
          <span className="saving__name">{state.icone ? `${state.icone} ` : ''}{state.label}</span>

          {/* D'où vient l'argent, et combien il en tombe chaque mois. Deux
              repères qu'on cherchait jusqu'ici dans les Réglages. */}
          {epargne && (state.source || state.monthlyAllocation > 0) && (
            <span className="saving__tags">
              {state.source && <span className="saving__tag">{state.source}</span>}
              {state.monthlyAllocation > 0 && (
                <span className="saving__tag">
                  Apport mensuel {formatDH(state.monthlyAllocation)}
                </span>
              )}
            </span>
          )}
          <span className="saving__amount">{formatDH(grandChiffre)}</span>
          <span className="saving__goal">{sousTitre}</span>
          {epargne && state.monthsRemaining != null && (
            <span className="saving__eta">
              {state.monthsRemaining === 0
                ? 'Objectif atteint.'
                : `${state.monthsRemaining} mois au rythme prévu.`}
            </span>
          )}
          {epargne && state.goal > 0 && state.monthsRemaining == null && (
            <span className="saving__eta">Fixe un montant mensuel dans Réglages.</span>
          )}
          {depasse && <span className="saving__eta">Budget dépassé.</span>}
        </span>

        <span className="saving__chevron" aria-hidden="true">{ouvert ? '▴' : '▾'}</span>
      </button>

      {ouvert && (
        <dl className="saving__detail">
          {lignes.map(([dt, dd]) => (
            <div key={dt}>
              <dt>{dt}</dt>
              <dd>{dd}</dd>
            </div>
          ))}
        </dl>
      )}

      <button type="button" className="saving__verser" onClick={onAction}>
        {epargne ? 'Verser une somme' : 'Ajouter une dépense'}
      </button>
    </section>
  )
}
