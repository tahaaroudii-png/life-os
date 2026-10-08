import { useEffect, useState } from 'react'
import { addDays, todayKey } from '../../lib/planning'
import { formatDateFR } from '../../lib/format'

/**
 * Sheet pour reporter une tâche à une date ultérieure.
 * Accepte aussi une heure prévue optionnelle — appliquée à la tâche.
 */
export default function PostponeSheet({ open, currentDate, currentTime, taskTitle, onPick, onClose }) {
  const today = todayKey()
  const [customDate, setCustomDate] = useState(addDays(today, 1))
  const [time, setTime] = useState(currentTime || '')

  useEffect(() => {
    if (open) {
      // Si la tâche est déjà dans le futur, l'utilisateur veut probablement
      // la ramener à aujourd'hui → défaut aujourd'hui. Sinon défaut demain.
      const defaultDate = currentDate && currentDate > today ? today : addDays(today, 1)
      setCustomDate(defaultDate)
      setTime(currentTime || '')
    }
  }, [open, currentDate, currentTime, today])

  if (!open) return null

  const isFuture = currentDate && currentDate > today
  const quickOptions = isFuture
    ? [
        { key: 'today', label: "Ramener à aujourd'hui", date: today },
        { key: 't',     label: 'Demain', date: addDays(today, 1) },
        { key: 'w',     label: 'Dans 1 semaine', date: addDays(today, 7) },
      ]
    : [
        { key: 't', label: 'Demain', date: addDays(today, 1) },
        { key: 'a', label: 'Après-demain', date: addDays(today, 2) },
        { key: 'w', label: 'Dans 1 semaine', date: addDays(today, 7) },
      ]

  function pick(date) {
    onPick({ date, time: time || null })
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <h2 style={{ marginTop: 0 }}>📅 Reporter la tâche</h2>
        <p className="muted small" style={{ margin: '0 0 1rem' }}>
          <strong>{taskTitle}</strong>
          {currentDate && <> — actuellement le {formatDateFR(currentDate)}</>}
        </p>

        <div className="postpone-quick">
          {quickOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className="postpone-quick__btn"
              onClick={() => pick(opt.date)}
            >
              <span className="postpone-quick__label">{opt.label}</span>
              <span className="postpone-quick__date">{formatDateFR(opt.date)}</span>
            </button>
          ))}
        </div>

        <label htmlFor="postpone-custom">Autre date</label>
        <input
          id="postpone-custom"
          type="date"
          value={customDate}
          min={today}
          onChange={(e) => setCustomDate(e.target.value)}
        />

        <label htmlFor="postpone-time" style={{ marginTop: '0.75rem' }}>Heure prévue (optionnel)</label>
        <input
          id="postpone-time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => pick(customDate)}
            disabled={!customDate || (currentDate && customDate === currentDate)}
          >
            {customDate === today ? "Ramener à aujourd'hui" : `Déplacer au ${formatDateFR(customDate)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
