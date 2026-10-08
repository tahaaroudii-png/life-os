import { useState } from 'react'
import { ENVELOPES } from '../lib/schema'
import { loanNote, depositNote } from '../lib/budget'
import { useTransactions } from '../hooks/useTransactions'

/**
 * Modal de saisie rapide — 3 types :
 *  - Dépense (amount > 0) : sortie normale, consomme l'enveloppe
 *  - Ajout   (amount < 0) : entrée (bonus, cadeau, remboursement, ré-approvisionnement)
 *  - Prêt    (amount > 0, note [PRÊT]) : dépense à rembourser au prochain salaire
 */
const TYPES = [
  { key: 'expense', label: '– Dépense',  color: 'var(--state-crit, #dc2626)' },
  { key: 'income',  label: '+ Ajout',    color: 'var(--state-good, #16a34a)' },
  { key: 'loan',    label: '⟲ Prêt',     color: 'var(--state-warn, #d97706)' },
]

/** Accepte « 20 000 », « 20,5 », « 20.5 ». Renvoie NaN si rien d'exploitable. */
export function parseAmount(raw) {
  if (typeof raw !== 'string') return Number(raw)
  const cleaned = raw.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')
  return parseFloat(cleaned)
}

export default function QuickAddModal({ open, onClose, defaultEnvelope }) {
  const { addTransaction } = useTransactions()
  const [amount, setAmount] = useState('')
  const [envelope, setEnvelope] = useState(defaultEnvelope || ENVELOPES[0].key)
  const [note, setNote] = useState('')
  const [type, setType] = useState('expense')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(null)

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    // « 20 000 » et « 20,5 » sont des montants valides pour qui écrit en
    // français. parseFloat s'arrête à la première espace ou virgule et
    // transformait 20 000 en 20 : le gros montant disparaissait en silence.
    const numAmount = parseAmount(amount)
    if (!numAmount || numAmount <= 0) return

    setSubmitting(true)
    // Signe et note selon le type
    const signedAmount = type === 'income' ? -Math.abs(numAmount) : Math.abs(numAmount)
    let finalNote = note
    if (type === 'loan') finalNote = loanNote(note)
    // Un versement sur le fond d'urgence est nommé : sans cela, impossible
    // de distinguer plus tard un apport d'un retrait annulé.
    else if (type === 'income' && envelope === 'urgence') finalNote = depositNote(note)

    const result = await addTransaction.mutateAsync({
      amount: signedAmount, envelope, note: finalNote,
    })
    setSubmitting(false)

    setAmount('')
    setNote('')
    setType('expense')
    setFeedback(result.queued ? 'queued' : 'ok')
    setTimeout(() => { setFeedback(null); onClose() }, 700)
  }

  const currentType = TYPES.find((t) => t.key === type)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <h2>Nouveau mouvement</h2>

        <form onSubmit={handleSubmit}>
          <label>Type</label>
          <div className="tx-type-picker" role="tablist">
            {TYPES.map((t) => (
              <button
                key={t.key} type="button" role="tab"
                aria-selected={type === t.key}
                className={`tx-type ${type === t.key ? 'is-active' : ''}`}
                style={type === t.key ? { '--tx-color': t.color } : undefined}
                onClick={() => setType(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <label htmlFor="qa-amount">Montant (DH)</label>
          <input
            id="qa-amount" type="text" inputMode="decimal"
            required autoFocus placeholder="0"
            value={amount} onChange={(e) => setAmount(e.target.value)}
            className="input-amount"
            style={{ borderColor: currentType?.color, color: currentType?.color }}
          />

          <label>Enveloppe</label>
          <div className="envelope-picker">
            {ENVELOPES.map((env) => (
              <button
                type="button" key={env.key}
                className={`envelope-pill ${envelope === env.key ? 'envelope-pill--active' : ''}`}
                onClick={() => setEnvelope(env.key)}
              >
                {env.label}
              </button>
            ))}
          </div>

          <label htmlFor="qa-note">Note (optionnel)</label>
          <input
            id="qa-note" type="text"
            placeholder={
              type === 'income' ? 'Ex. Cadeau, remboursement, bonus…'
              : type === 'loan'  ? 'Ex. Panne voiture urgente'
              : 'Ex. Courses, essence…'
            }
            value={note} onChange={(e) => setNote(e.target.value)}
          />

          {type === 'loan' && (
            <p className="muted small" style={{ marginTop: '0.5rem' }}>
              🔄 Compté ce mois, à rembourser au prochain salaire.
            </p>
          )}
          {type === 'income' && (
            <p className="muted small" style={{ marginTop: '0.5rem' }}>
              💰 Ajoute au restant de l'enveloppe. Sur "{ENVELOPES.find((e) => e.key === envelope)?.label}",
              cela {envelope === 'urgence' ? 'renforce le fond d\'urgence' : 'augmente le budget restant du mois'}.
            </p>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
            <button
              type="submit" className="btn-primary" disabled={submitting}
              style={{ background: currentType?.color, borderColor: currentType?.color }}
            >
              {submitting ? '…' : `Ajouter ${currentType?.label?.slice(2) || ''}`.trim()}
            </button>
          </div>

          {feedback === 'queued' && <p className="muted small">📥 Hors-ligne : sera synchronisé au retour du réseau.</p>}
          {feedback === 'ok' && <p className="muted small">✅ Enregistré.</p>}
        </form>
      </div>
    </div>
  )
}
