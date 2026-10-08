import { useEffect, useState } from 'react'

/**
 * Sheet minimaliste pour ajuster l'heure prévue d'une tâche (task.scheduled_time).
 * S'ouvre en tapant sur la zone horaire d'une tâche.
 */
export default function TimeEditSheet({ open, task, onSave, onClose }) {
  const [time, setTime] = useState(task?.scheduled_time || '')

  useEffect(() => {
    if (open) setTime(task?.scheduled_time || '')
  }, [open, task])

  if (!open || !task) return null

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <h2 style={{ marginTop: 0 }}>⏰ Ajuster l'heure</h2>
        <p className="muted small" style={{ margin: '0 0 1rem' }}>
          <strong>{task.title}</strong>
        </p>

        <label htmlFor="time-edit-input">Heure prévue</label>
        <input
          id="time-edit-input"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          autoFocus
        />

        <div className="modal-actions" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
          {task.scheduled_time && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => { onSave(null); onClose() }}
              title="Retirer l'heure prévue"
            >
              Retirer l'heure
            </button>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={!time}
            onClick={() => { onSave(time); onClose() }}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}
