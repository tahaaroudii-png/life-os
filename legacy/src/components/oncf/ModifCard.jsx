import { useState } from 'react'
import {
  STAGES,
  STAGE_BY_KEY,
  PRIORITY_BY_KEY,
  progressForStage,
  dueTone,
  formatDueLabel,
  parseJournal,
  appendJournalEntry,
} from '../../lib/oncf'
import ProgressRing from './ProgressRing'

/**
 * Carte d'une modification.
 *
 * Deux modes :
 *   - "priority" (nouvelle vue par défaut) : grande carte, action en cours
 *     mise en avant, journal des remarques en accordéon, sélecteur d'étape
 *     en pied et input rapide "+ remarque".
 *   - "kanban" : carte compacte draggable pour la vue en colonnes par étape.
 */
export default function ModifCard({
  modif, mode = 'priority',
  onOpen, onChangeStage, onAddNote,
  onDragStart, onDragEnd,
}) {
  const stage = STAGE_BY_KEY[modif.stage]
  const prio = PRIORITY_BY_KEY[modif.priority]
  const tone = dueTone(modif.due_date)
  const pct = progressForStage(modif.stage)

  const [noteDraft, setNoteDraft] = useState('')
  const [journalOpen, setJournalOpen] = useState(false)

  const journal = parseJournal(modif.notes)

  const ringSize = mode === 'kanban' ? 52 : 68

  async function submitNote(e) {
    e?.preventDefault?.()
    const text = noteDraft.trim()
    if (!text) return
    const newNotes = appendJournalEntry(modif.notes, text)
    await onAddNote?.(modif.id, newNotes)
    setNoteDraft('')
    setJournalOpen(true)
  }

  const priorityCard = mode === 'priority'

  return (
    <article
      className={`modif-card modif-card--${mode}`}
      draggable={mode === 'kanban'}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{ '--stage-color': stage?.color }}
      onClick={(e) => {
        // Ne pas ouvrir le détail si on interagit avec un contrôle interne.
        if (e.target.closest('select, textarea, input, button, .no-open')) return
        onOpen?.(modif)
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen?.(modif)
        }
      }}
    >
      <div className="modif-card__top">
        <div className="modif-card__title-block">
          <div className="modif-card__title-row">
            <span className={`prio-dot prio-dot--${prio?.key}`} title={`Priorité ${prio?.label}`} />
            <h3 className="modif-card__title">{modif.title}</h3>
          </div>
          <div className="modif-card__stage" style={{ color: stage?.color }}>
            {stage?.label}
          </div>
        </div>
        <ProgressRing pct={pct} size={ringSize} stroke={priorityCard ? 8 : 7} />
      </div>

      <div className="modif-card__meta">
        {modif.equipment && (
          <span className="modif-badge modif-badge--equipment">{modif.equipment}</span>
        )}
        {modif.due_date && (
          <span className={`modif-badge modif-badge--due modif-badge--due-${tone}`}>
            {tone === 'overdue' ? '⏰ ' : tone === 'soon' ? '📌 ' : ''}
            {formatDueLabel(modif.due_date)}
          </span>
        )}
        <span className="modif-badge modif-badge--prio" style={{ color: prio?.color }}>
          {prio?.label}
        </span>
      </div>

      {/* --- Action en cours, très visible --- */}
      <div className={`action-current ${!modif.next_action ? 'action-current--empty' : ''}`}>
        <div className="action-current__label">Action en cours</div>
        <div className="action-current__text">
          {modif.next_action || <em className="muted">Aucune action définie — clique pour renseigner.</em>}
        </div>
      </div>

      {/* --- Journal des remarques --- */}
      {priorityCard && (
        <div className="journal no-open">
          <button
            type="button"
            className="journal__toggle"
            onClick={() => setJournalOpen((v) => !v)}
            aria-expanded={journalOpen}
          >
            <span className="journal__toggle-caret" aria-hidden="true">
              {journalOpen ? '▾' : '▸'}
            </span>
            Journal <span className="journal__count">{journal.entries.length}</span>
          </button>

          {journalOpen && (
            <>
              {journal.intro && (
                <p className="journal__intro">{journal.intro}</p>
              )}
              {journal.entries.length === 0 ? (
                <p className="muted small journal__empty">Aucune remarque pour l'instant.</p>
              ) : (
                <ul className="journal__list">
                  {journal.entries.slice(0, 6).map((e, i) => (
                    <li key={i} className="journal__item">
                      <time className="journal__date">{e.date}</time>
                      <span className="journal__text">{e.text}</span>
                    </li>
                  ))}
                  {journal.entries.length > 6 && (
                    <li className="muted small">
                      … {journal.entries.length - 6} remarque{journal.entries.length - 6 > 1 ? 's' : ''} plus ancienne{journal.entries.length - 6 > 1 ? 's' : ''} —{' '}
                      <button type="button" className="btn-link" onClick={() => onOpen?.(modif)}>
                        voir tout
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </>
          )}

          <form className="journal__form" onSubmit={submitNote}>
            <input
              type="text"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="+ Remarque (Entrée pour ajouter)"
              className="journal__input"
            />
            <button
              type="submit"
              className="journal__submit"
              disabled={!noteDraft.trim()}
            >
              Ajouter
            </button>
          </form>
        </div>
      )}

      <div className="modif-card__foot no-open">
        <label className="modif-card__foot-label">Étape</label>
        <select
          value={modif.stage}
          onChange={(e) => onChangeStage(modif.id, e.target.value)}
          aria-label="Changer d'étape"
        >
          {STAGES.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        {priorityCard && (
          <button type="button" className="btn-link" onClick={() => onOpen?.(modif)}>
            Éditer
          </button>
        )}
      </div>
    </article>
  )
}
