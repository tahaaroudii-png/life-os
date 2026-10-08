import { useState } from 'react'
import { AXES, todayKey } from '../../lib/planning'

/**
 * Modal "+", ouvert depuis la vue Aujourd'hui.
 * Permet d'ajouter les 3 types de tâches :
 *   - HABITUDE quotidienne (réapparaît chaque jour)
 *   - Tâche PONCTUELLE (aujourd'hui uniquement)
 *   - DÉFI PROGRESSIF (nombre qui monte chaque jour)
 */
export default function QuickAddTaskModal({ open, onClose, onSubmit }) {
  const [title, setTitle] = useState('')
  const [axis, setAxis] = useState(AXES[0].key)
  // Défaut : tâche du jour (usage majoritaire — les habitudes se créent
  // rarement, une bonne fois pour toutes, tandis que les ponctuelles se
  // saisissent tout le temps depuis "+".
  const [type, setType] = useState('oneoff')
  const [time, setTime] = useState('')
  const [startValue, setStartValue] = useState('10')
  const [increment, setIncrement] = useState('1')
  const [startDate, setStartDate] = useState(todayKey())
  // Date de planification d'une tâche ponctuelle : aujourd'hui par défaut,
  // mais peut être n'importe quel jour futur (ou même antérieur, ex. pour
  // rattraper une tâche oubliée dans l'historique).
  const [oneoffDate, setOneoffDate] = useState(todayKey())
  // Streak déjà pratiqué IRL avant l'installation — backfille N logs.
  const [seedDays, setSeedDays] = useState('0')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

  if (!open) return null

  function reset() {
    setTitle('')
    setAxis(AXES[0].key)
    setType('oneoff')
    setTime('')
    setStartValue('10')
    setIncrement('1')
    setStartDate(todayKey())
    setOneoffDate(todayKey())
    setSeedDays('0')
    setErrorMsg(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setErrorMsg(null)
    if (!title.trim()) return

    if (type === 'progressive') {
      if (!startDate) {
        setErrorMsg('Choisis une date de départ pour le défi progressif.')
        return
      }
      if (startValue === '' || Number.isNaN(Number(startValue))) {
        setErrorMsg('Valeur de départ invalide.')
        return
      }
      if (increment === '' || Number.isNaN(Number(increment))) {
        setErrorMsg('Incrément invalide.')
        return
      }
    }

    setSubmitting(true)
    try {
      await onSubmit({
        title: title.trim(),
        axis,
        type,
        scheduled_time: time || null,
        start_value: type === 'progressive' ? Number(startValue) : null,
        daily_increment: type === 'progressive' ? Number(increment) : null,
        start_date: type === 'progressive' ? startDate : null,
        seed_days: type === 'habit' ? Math.max(0, Number(seedDays) || 0) : 0,
        oneoff_date: type === 'oneoff' ? (oneoffDate || todayKey()) : null,
      })
      reset()
      onClose()
    } catch (err) {
      setErrorMsg(err?.message || 'Erreur inconnue à la création.')
    } finally {
      setSubmitting(false)
    }
  }

  const helper =
    type === 'habit'
      ? 'Cette tâche réapparaîtra automatiquement chaque jour.'
      : type === 'oneoff'
        ? oneoffDate === todayKey()
          ? "Cette tâche apparaîtra aujourd'hui uniquement."
          : `Cette tâche apparaîtra uniquement le ${oneoffDate}.`
        : `Objectif quotidien = ${startValue || 0} + ${increment || 0} par jour, à partir du ${startDate || '…'}.`

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <h2 style={{ marginTop: 0 }}>Nouvelle tâche</h2>

        <form onSubmit={handleSubmit}>
          <label>Type de tâche</label>
          <div className="type-picker" role="radiogroup" aria-label="Type de tâche">
            <button
              type="button"
              role="radio"
              aria-checked={type === 'oneoff'}
              onClick={() => setType('oneoff')}
              className={`type-pill ${type === 'oneoff' ? 'type-pill--active' : ''}`}
            >
              <span className="type-pill__icon" aria-hidden="true">📌</span>
              <span className="type-pill__title">Tâche d'aujourd'hui</span>
              <span className="type-pill__sub">Une seule journée</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={type === 'habit'}
              onClick={() => setType('habit')}
              className={`type-pill ${type === 'habit' ? 'type-pill--active' : ''}`}
            >
              <span className="type-pill__icon" aria-hidden="true">🔁</span>
              <span className="type-pill__title">Habitude</span>
              <span className="type-pill__sub">Chaque jour</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={type === 'progressive'}
              onClick={() => setType('progressive')}
              className={`type-pill ${type === 'progressive' ? 'type-pill--active' : ''}`}
            >
              <span className="type-pill__icon" aria-hidden="true">🏋️</span>
              <span className="type-pill__title">Défi progressif</span>
              <span className="type-pill__sub">+N chaque jour</span>
            </button>
          </div>
          <p className="muted small" style={{ margin: '0.5rem 0 0.75rem' }}>{helper}</p>

          <label htmlFor="task-title">Titre</label>
          <input
            id="task-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              type === 'habit'
                ? 'Ex. Prière du Fajr'
                : type === 'progressive'
                  ? 'Ex. Pompes'
                  : 'Ex. Appeler maman'
            }
            autoFocus
          />

          <label htmlFor="task-time">Heure (optionnel)</label>
          <input
            id="task-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />

          {type === 'oneoff' && (
            <>
              <label htmlFor="task-date">Pour quel jour ?</label>
              <input
                id="task-date"
                type="date"
                value={oneoffDate}
                min={todayKey()}
                onChange={(e) => setOneoffDate(e.target.value)}
              />
              <p className="muted small" style={{ margin: '-0.25rem 0 0.75rem' }}>
                Aujourd'hui par défaut. Choisis une date future pour planifier à l'avance.
              </p>
            </>
          )}

          {type === 'habit' && (
            <>
              <label htmlFor="task-seed">
                Streak déjà pratiqué avant aujourd'hui (optionnel)
              </label>
              <input
                id="task-seed"
                type="number"
                min="0"
                inputMode="numeric"
                value={seedDays}
                onChange={(e) => setSeedDays(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
              />
              <p className="muted small" style={{ margin: '-0.25rem 0 0.75rem' }}>
                {Number(seedDays) > 0
                  ? `Streak initial : ${seedDays}. Aujourd'hui reste à cocher — après coche, streak = ${Number(seedDays) + 1}.`
                  : "Nombre de jours consécutifs déjà pratiqués IRL, hors aujourd'hui."}
              </p>
            </>
          )}

          {type === 'progressive' && (
            <div className="progressive-fields">
              <div>
                <label htmlFor="task-start">Valeur de départ</label>
                <input
                  id="task-start"
                  type="number"
                  value={startValue}
                  onChange={(e) => setStartValue(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="task-inc">Incrément / jour</label>
                <input
                  id="task-inc"
                  type="number"
                  value={increment}
                  onChange={(e) => setIncrement(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="task-sdate">Date de départ</label>
                <input
                  id="task-sdate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
            </div>
          )}

          <label>Axe</label>
          <div className="envelope-picker">
            {AXES.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => setAxis(a.key)}
                className={`envelope-pill ${axis === a.key ? 'envelope-pill--active' : ''}`}
                style={axis === a.key ? { background: a.color, borderColor: a.color } : undefined}
              >
                <span aria-hidden="true">{a.icon}</span> {a.label}
              </button>
            ))}
          </div>

          {errorMsg && <p className="error-text" style={{ marginTop: '0.75rem' }}>{errorMsg}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !title.trim()}>
              {submitting ? 'Ajout…' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
