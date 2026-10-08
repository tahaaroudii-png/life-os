import { useEffect, useState } from 'react'
import { STAGES, STAGE_BY_KEY, PRIORITIES, parseJournal, appendJournalEntry } from '../../lib/oncf'
import { useModificationHistory } from '../../hooks/useModifications'
import { formatDateFR } from '../../lib/format'

const EMPTY = {
  title: '',
  equipment: '',
  stage: 'identifie',
  priority: 'moyenne',
  due_date: '',
  next_action: '',
  notes: '',
}

/**
 * Modal d'édition d'une modification.
 *   - `mode="create"` : formulaire vide, appelle onCreate.
 *   - `mode="edit"`   : rempli à partir de `modif`, appelle onSave.
 *
 * Affiche l'historique des changements d'étape en bas quand on édite.
 */
export default function ModifDetailModal({
  open, mode, modif, onClose, onCreate, onSave, onDelete, onAddNote,
}) {
  const [draft, setDraft] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const { history, isLoading: histLoading } = useModificationHistory(mode === 'edit' ? modif?.id : null)

  useEffect(() => {
    if (mode === 'edit' && modif) {
      setDraft({
        title: modif.title || '',
        equipment: modif.equipment || '',
        stage: modif.stage || 'identifie',
        priority: modif.priority || 'moyenne',
        due_date: modif.due_date ? String(modif.due_date).slice(0, 10) : '',
        next_action: modif.next_action || '',
        notes: modif.notes || '',
      })
    } else if (open && mode === 'create') {
      setDraft(EMPTY)
    }
  }, [modif, mode, open])

  if (!open) return null

  function set(field, value) {
    setDraft((d) => ({ ...d, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!draft.title.trim()) return
    setBusy(true)
    try {
      const payload = {
        title: draft.title.trim(),
        equipment: draft.equipment.trim() || null,
        stage: draft.stage,
        priority: draft.priority,
        due_date: draft.due_date || null,
        next_action: draft.next_action.trim() || null,
        notes: draft.notes.trim() || null,
      }
      if (mode === 'create') {
        await onCreate(payload)
      } else {
        await onSave(modif.id, payload)
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Supprimer "${modif.title}" ? Son historique sera aussi supprimé.`)) return
    setBusy(true)
    try {
      await onDelete(modif.id)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-sheet modal-sheet--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <h2 style={{ marginTop: 0 }}>{mode === 'create' ? 'Nouvelle modification' : 'Modifier'}</h2>

        <form onSubmit={handleSubmit}>
          <label htmlFor="mod-title">Titre</label>
          <input
            id="mod-title"
            type="text"
            value={draft.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Ex. Remplacement compresseur E1100"
            autoFocus
          />

          <div className="form-row">
            <div>
              <label htmlFor="mod-equipment">Engin / équipement</label>
              <input
                id="mod-equipment"
                type="text"
                value={draft.equipment}
                onChange={(e) => set('equipment', e.target.value)}
                placeholder="E1100"
              />
            </div>
            <div>
              <label htmlFor="mod-due">Échéance</label>
              <input
                id="mod-due"
                type="date"
                value={draft.due_date}
                onChange={(e) => set('due_date', e.target.value)}
              />
            </div>
          </div>

          <label>Étape</label>
          <div className="envelope-picker">
            {STAGES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => set('stage', s.key)}
                className={`envelope-pill ${draft.stage === s.key ? 'envelope-pill--active' : ''}`}
                style={draft.stage === s.key ? { background: s.color, borderColor: s.color } : undefined}
              >
                {s.label}
              </button>
            ))}
          </div>

          <label>Priorité</label>
          <div className="envelope-picker">
            {PRIORITIES.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => set('priority', p.key)}
                className={`envelope-pill ${draft.priority === p.key ? 'envelope-pill--active' : ''}`}
                style={draft.priority === p.key ? { background: p.color, borderColor: p.color } : undefined}
              >
                {p.label}
              </button>
            ))}
          </div>

          <label htmlFor="mod-next">Prochaine action</label>
          <input
            id="mod-next"
            type="text"
            value={draft.next_action}
            onChange={(e) => set('next_action', e.target.value)}
            placeholder="Ex. Appeler fournisseur pour cotation"
          />

          <label htmlFor="mod-notes">
            Journal complet (édition brute)
          </label>
          <p className="muted small" style={{ margin: '-0.25rem 0 0.35rem' }}>
            Chaque ligne débutant par <code>[YYYY-MM-DD HH:MM]</code> est une entrée
            du journal. Utilise l'ajout rapide ci-dessous pour ne pas taper la date.
          </p>
          <textarea
            id="mod-notes"
            rows={4}
            value={draft.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Sera rempli automatiquement quand tu ajoutes une remarque."
          />

          <div className="modal-actions">
            {mode === 'edit' && (
              <button type="button" className="btn-link btn-link--danger" onClick={handleDelete}>
                Supprimer
              </button>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" className="btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-primary" disabled={busy || !draft.title.trim()}>
              {busy ? '…' : mode === 'create' ? 'Créer' : 'Enregistrer'}
            </button>
          </div>
        </form>

        {mode === 'edit' && (
          <JournalSection
            notes={draft.notes}
            noteDraft={noteDraft}
            setNoteDraft={setNoteDraft}
            onSubmit={async (text) => {
              if (!modif) return
              const newNotes = appendJournalEntry(draft.notes, text)
              // Optimistic sur le draft local ET persistance en base
              setDraft((d) => ({ ...d, notes: newNotes }))
              setNoteDraft('')
              if (onAddNote) await onAddNote(modif.id, newNotes)
            }}
          />
        )}

        {mode === 'edit' && (
          <section className="modif-history">
            <h3>Historique des étapes</h3>
            {histLoading ? (
              <p className="muted small">Chargement…</p>
            ) : history.length === 0 ? (
              <p className="muted small">Aucun changement enregistré.</p>
            ) : (
              <ul className="modif-history__list">
                {history.map((h) => {
                  const from = h.from_stage ? STAGE_BY_KEY[h.from_stage] : null
                  const to = STAGE_BY_KEY[h.to_stage]
                  return (
                    <li key={h.id} className="modif-history__item">
                      <span className="modif-history__date">{formatDateFR(h.changed_at)}</span>
                      <span className="modif-history__arrow">
                        {from ? (
                          <>
                            <span style={{ color: from.color }}>{from.label}</span>
                            {' → '}
                          </>
                        ) : (
                          <em className="muted">création · </em>
                        )}
                        <span style={{ color: to?.color, fontWeight: 600 }}>{to?.label}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

function JournalSection({ notes, noteDraft, setNoteDraft, onSubmit }) {
  const journal = parseJournal(notes)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!noteDraft.trim()) return
    setBusy(true)
    try {
      await onSubmit(noteDraft.trim())
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="modif-journal">
      <h3>Journal des remarques <span className="muted small">({journal.entries.length})</span></h3>

      <form className="modif-journal__form" onSubmit={submit}>
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="Nouvelle remarque — ce qui a été fait, décision prise, contact appelé…"
          rows={2}
        />
        <button type="submit" className="btn-primary" disabled={busy || !noteDraft.trim()}>
          {busy ? '…' : 'Ajouter'}
        </button>
      </form>

      {journal.intro && (
        <div className="modif-journal__intro">
          <div className="muted small" style={{ marginBottom: '0.2rem' }}>Note initiale</div>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{journal.intro}</p>
        </div>
      )}

      {journal.entries.length === 0 ? (
        <p className="muted small">Aucune remarque enregistrée.</p>
      ) : (
        <ul className="modif-journal__list">
          {journal.entries.map((e, i) => (
            <li key={i} className="modif-journal__item">
              <time className="modif-journal__date">{e.date}</time>
              <span className="modif-journal__text">{e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
