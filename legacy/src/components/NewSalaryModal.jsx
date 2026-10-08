import { useEffect, useState } from 'react'
import { useSettings } from '../hooks/useSettings'
import { formatDH } from '../lib/format'
import { ENVELOPES } from '../lib/schema'

/**
 * Modal "Nouveau salaire du mois" — met à jour `settings.monthly_income`.
 * Le nouveau montant s'applique immédiatement au mois en cours (les
 * enveloppes qui repartent à zéro sont recalculées automatiquement).
 */
export default function NewSalaryModal({ open, onClose }) {
  const { settings, updateSettings } = useSettings()
  const [income, setIncome] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => {
    if (open) {
      setIncome(String(settings?.monthly_income || ''))
      setFeedback(null)
    }
  }, [open, settings?.monthly_income])

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    const n = parseFloat(income)
    if (!n || n <= 0) return
    setSubmitting(true)
    try {
      await updateSettings.mutateAsync({ monthly_income: n })
      setFeedback('ok')
      setTimeout(() => { setFeedback(null); onClose() }, 700)
    } catch (err) {
      setFeedback('err')
    } finally {
      setSubmitting(false)
    }
  }

  const preview = parseFloat(income) || 0
  const rows = preview > 0 ? ENVELOPES.map((e) => ({
    label: e.label,
    amount: (preview * (Number(settings?.[e.pctField]) || 0)) / 100,
  })) : []

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <h2>💰 Nouveau salaire du mois</h2>
        <p className="muted small">
          Enregistre le montant reçu ce mois. La répartition en 4 enveloppes se recalcule aussitôt.
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="ns-income">Salaire du mois (DH)</label>
          <input
            id="ns-income" type="number" inputMode="decimal" step="0.01" min="0"
            required autoFocus placeholder="Ex. 12000"
            value={income} onChange={(e) => setIncome(e.target.value)}
            className="input-amount"
          />

          {rows.length > 0 && (
            <div className="salary-preview">
              <p className="muted small" style={{ margin: '0.5rem 0 0.35rem' }}>Aperçu de la répartition :</p>
              <ul>
                {rows.map((r) => (
                  <li key={r.label}>
                    <span>{r.label}</span>
                    <strong>{formatDH(r.amount)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? '…' : 'Enregistrer'}
            </button>
          </div>

          {feedback === 'ok' && <p className="muted small">✅ Salaire mis à jour.</p>}
          {feedback === 'err' && <p className="error-text">Erreur — vérifiez la connexion.</p>}
        </form>
      </div>
    </div>
  )
}
