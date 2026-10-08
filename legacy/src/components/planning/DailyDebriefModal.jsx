import { useEffect, useState } from 'react'
import { AXIS_BY_KEY } from '../../lib/planning'
import { formatDateFR } from '../../lib/format'

/**
 * Bilan quotidien du soir — NON-NÉGOCIABLE.
 *
 *   - La modale ne se ferme PAS au clic sur l'overlay ni à Escape :
 *     l'utilisateur doit choisir entre "Enregistrer" et "Snooze 15 min".
 *   - Pas de bouton "passer" définitif — le snooze est court, le bilan
 *     revient tant qu'il n'est pas fait.
 */
export default function DailyDebriefModal({
  open, dateKey, incompleteItems = [], existingReason = '',
  onSave, onSnooze,
}) {
  const [reason, setReason] = useState(existingReason)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setReason(existingReason || '')
  }, [open, existingReason])

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await onSave(reason.trim())
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="modal-overlay modal-overlay--locked"
      role="dialog"
      aria-modal="true"
      aria-labelledby="debrief-title"
    >
      <div className="modal-sheet modal-sheet--wide">
        <h2 id="debrief-title" style={{ marginTop: 0 }}>🌙 Bilan du soir</h2>
        <p className="muted small" style={{ margin: '0 0 1rem' }}>
          {formatDateFR(dateKey)} — {incompleteItems.length} tâche{incompleteItems.length > 1 ? 's' : ''} non
          {incompleteItems.length > 1 ? ' cochées' : ' cochée'}. Deux minutes pour dire ce qui s'est passé.
          Tes réponses seront analysées pour repérer les patterns.
        </p>

        {incompleteItems.length > 0 && (
          <ul className="debrief-list">
            {incompleteItems.map((t) => {
              const axis = AXIS_BY_KEY[t.axis]
              return (
                <li key={t.id} className="debrief-item">
                  <span className="debrief-dot" style={{ background: axis?.color }} aria-hidden="true" />
                  <span className="debrief-item__title">{t.title}</span>
                  <span className="debrief-item__axis">{axis?.label}</span>
                </li>
              )
            })}
          </ul>
        )}

        <form onSubmit={handleSubmit}>
          <label htmlFor="debrief-reason">Raison / notes</label>
          <textarea
            id="debrief-reason"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex. Journée intense au bureau, oublié après le sport, mal dormi, invité chez la famille…"
            autoFocus
          />
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onSnooze}>
              Snooze 15 min
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? '…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
