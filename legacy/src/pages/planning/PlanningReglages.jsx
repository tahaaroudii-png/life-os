import { useMemo, useState } from 'react'
import { useTasks } from '../../hooks/useTasks'
import { AXES, AXIS_BY_KEY, todayKey } from '../../lib/planning'
import NotificationsPanel from '../../components/planning/NotificationsPanel'

const NEW_TASK_DEFAULT = () => ({
  title: '',
  axis: AXES[0].key,
  type: 'habit',
  start_value: 10,
  daily_increment: 1,
  start_date: todayKey(),
  scheduled_time: '',
})

/**
 * Écran "Tâches" : créer / activer / éditer / supprimer.
 * Sépare visuellement les 3 types : habits, défis progressifs, historique
 * des ponctuelles (non éditables ici — elles se gèrent depuis "Aujourd'hui").
 */
export default function PlanningReglages() {
  const { tasks, isLoading, createTask, updateTask, deleteTask, backfillHabit } = useTasks()
  const [draft, setDraft] = useState(NEW_TASK_DEFAULT())
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState(null)

  async function handleBackfill(task) {
    const raw = window.prompt(
      `Combien de jours AVANT aujourd'hui as-tu déjà pratiqué "${task.title}" d'affilée ?\n\n` +
      `L'app va pré-remplir ces jours passés comme "fait". Aujourd'hui reste vierge : à toi de cocher la case du jour comme d'habitude — le streak passera à N+1.\n\n` +
      `Idempotent : si tu rejoues, les mêmes jours seront ré-écrasés à "fait".`,
      '7'
    )
    if (raw == null) return
    const n = Math.max(0, Math.floor(Number(raw) || 0))
    if (n === 0) return
    try {
      await backfillHabit.mutateAsync({ taskId: task.id, days: n })
      window.alert(
        `✓ ${n} jour${n > 1 ? 's' : ''} passé${n > 1 ? 's' : ''} pré-rempli${n > 1 ? 's' : ''}.\n\n` +
        `Va sur Aujourd'hui : ton streak est à ${n}. Coche la case du jour → il passera à ${n + 1}.`
      )
    } catch (err) {
      window.alert(`Échec du backfill : ${err?.message || 'erreur inconnue'}`)
    }
  }

  const habits = useMemo(() => tasks.filter((t) => t.type === 'habit'), [tasks])
  const progressives = useMemo(() => tasks.filter((t) => t.type === 'progressive'), [tasks])
  const oneoffs = useMemo(() => tasks.filter((t) => t.type === 'oneoff'), [tasks])

  async function handleCreate(e) {
    e.preventDefault()
    if (!draft.title.trim()) return
    if (draft.type === 'progressive') {
      if (!draft.start_date) { window.alert('Choisis une date de départ.'); return }
      if (draft.start_value === '' || Number.isNaN(Number(draft.start_value))) {
        window.alert('Valeur de départ invalide.'); return
      }
      if (draft.daily_increment === '' || Number.isNaN(Number(draft.daily_increment))) {
        window.alert('Incrément invalide.'); return
      }
    }
    const payload = {
      title: draft.title.trim(),
      axis: draft.axis,
      type: draft.type,
      active: true,
      start_value: draft.type === 'progressive' ? Number(draft.start_value) : null,
      daily_increment: draft.type === 'progressive' ? Number(draft.daily_increment) : null,
      start_date: draft.type === 'progressive' ? (draft.start_date || null) : null,
      scheduled_time: draft.scheduled_time || null,
    }
    try {
      await createTask.mutateAsync(payload)
      setDraft(NEW_TASK_DEFAULT())
    } catch (err) {
      window.alert(`Création impossible : ${err?.message || 'erreur inconnue'}`)
    }
  }

  function startEdit(task) {
    setEditingId(task.id)
    setEditDraft({
      title: task.title,
      axis: task.axis,
      active: task.active,
      start_value: task.start_value ?? 10,
      daily_increment: task.daily_increment ?? 1,
      start_date: task.start_date ? String(task.start_date).slice(0, 10) : todayKey(),
      scheduled_time: task.scheduled_time ? String(task.scheduled_time).slice(0, 5) : '',
    })
  }

  async function saveEdit(task) {
    const patch = {
      title: editDraft.title.trim(),
      axis: editDraft.axis,
      active: !!editDraft.active,
      scheduled_time: editDraft.scheduled_time || null,
    }
    if (task.type === 'progressive') {
      patch.start_value = Number(editDraft.start_value)
      patch.daily_increment = Number(editDraft.daily_increment)
      patch.start_date = editDraft.start_date
    }
    await updateTask.mutateAsync({ id: task.id, ...patch })
    setEditingId(null)
    setEditDraft(null)
  }

  async function handleDelete(task) {
    if (!window.confirm(`Supprimer la tâche "${task.title}" ? Ses logs seront aussi supprimés.`)) return
    await deleteTask.mutateAsync(task.id)
  }

  async function toggleActive(task) {
    await updateTask.mutateAsync({ id: task.id, active: !task.active })
  }

  if (isLoading) return <p className="muted">Chargement…</p>

  return (
    <div className="page-planning-reglages">
      <h1>Tâches</h1>
      <p className="muted">
        Les <strong>habitudes</strong> reviennent automatiquement chaque jour. Les{' '}
        <strong>défis progressifs</strong> (pompes, squats…) affichent chaque jour un objectif
        calculé à partir de leur valeur de départ + incrément quotidien.
      </p>

      <NotificationsPanel />

      {/* -------- Formulaire d'ajout -------- */}
      <form className="settings-form" onSubmit={handleCreate} style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Nouvelle tâche récurrente</h2>

        <label htmlFor="new-title">Titre</label>
        <input
          id="new-title"
          type="text"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          placeholder="Ex. Prière du Fajr"
        />

        <label htmlFor="new-time">Heure (optionnel)</label>
        <input
          id="new-time"
          type="time"
          value={draft.scheduled_time}
          onChange={(e) => setDraft((d) => ({ ...d, scheduled_time: e.target.value }))}
        />

        <label>Axe</label>
        <div className="envelope-picker">
          {AXES.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setDraft((d) => ({ ...d, axis: a.key }))}
              className={`envelope-pill ${draft.axis === a.key ? 'envelope-pill--active' : ''}`}
              style={draft.axis === a.key ? { background: a.color, borderColor: a.color } : undefined}
            >
              {a.icon} {a.label}
            </button>
          ))}
        </div>

        <label>Type</label>
        <div className="envelope-picker">
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, type: 'habit' }))}
            className={`envelope-pill ${draft.type === 'habit' ? 'envelope-pill--active' : ''}`}
          >
            Habitude quotidienne
          </button>
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, type: 'progressive' }))}
            className={`envelope-pill ${draft.type === 'progressive' ? 'envelope-pill--active' : ''}`}
          >
            Défi progressif
          </button>
        </div>

        {draft.type === 'progressive' && (
          <div className="progressive-fields">
            <div>
              <label htmlFor="new-start-value">Valeur de départ</label>
              <input
                id="new-start-value"
                type="number"
                value={draft.start_value}
                onChange={(e) => setDraft((d) => ({ ...d, start_value: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="new-increment">Incrément / jour</label>
              <input
                id="new-increment"
                type="number"
                value={draft.daily_increment}
                onChange={(e) => setDraft((d) => ({ ...d, daily_increment: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="new-start-date">Date de départ</label>
              <input
                id="new-start-date"
                type="date"
                value={draft.start_date}
                onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))}
              />
            </div>
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={createTask.isPending || !draft.title.trim()}>
          {createTask.isPending ? 'Ajout…' : 'Ajouter'}
        </button>
      </form>

      <TaskGroup
        title="Habitudes"
        empty="Aucune habitude pour l'instant."
        tasks={habits}
        editingId={editingId}
        editDraft={editDraft}
        setEditDraft={setEditDraft}
        onStartEdit={startEdit}
        onCancelEdit={() => { setEditingId(null); setEditDraft(null) }}
        onSave={saveEdit}
        onBackfill={handleBackfill}
        onDelete={handleDelete}
        onToggleActive={toggleActive}
      />

      <TaskGroup
        title="Défis progressifs"
        empty="Aucun défi progressif."
        tasks={progressives}
        editingId={editingId}
        editDraft={editDraft}
        setEditDraft={setEditDraft}
        onStartEdit={startEdit}
        onCancelEdit={() => { setEditingId(null); setEditDraft(null) }}
        onSave={saveEdit}
        onDelete={handleDelete}
        onToggleActive={toggleActive}
      />

      {oneoffs.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h2 style={{ marginTop: 0 }}>Tâches ponctuelles ({oneoffs.length})</h2>
          <p className="muted small">
            Les tâches ponctuelles s'ajoutent depuis "Aujourd'hui" via le bouton <strong>+</strong>.
          </p>
        </div>
      )}
    </div>
  )
}

function TaskGroup({
  title, empty, tasks, editingId, editDraft, setEditDraft,
  onStartEdit, onCancelEdit, onSave, onDelete, onToggleActive, onBackfill,
}) {
  return (
    <section className="card" style={{ marginBottom: '1.25rem' }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {tasks.length === 0 && <p className="muted">{empty}</p>}
      {tasks.map((task) => {
        const isEditing = editingId === task.id
        const axis = AXIS_BY_KEY[task.axis]
        if (isEditing) {
          return (
            <div key={task.id} className="task-edit">
              <input
                type="text"
                value={editDraft.title}
                onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
              />
              <label>Heure (optionnel)</label>
              <input
                type="time"
                value={editDraft.scheduled_time}
                onChange={(e) => setEditDraft((d) => ({ ...d, scheduled_time: e.target.value }))}
              />
              <div className="envelope-picker" style={{ marginTop: '0.5rem' }}>
                {AXES.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => setEditDraft((d) => ({ ...d, axis: a.key }))}
                    className={`envelope-pill ${editDraft.axis === a.key ? 'envelope-pill--active' : ''}`}
                    style={editDraft.axis === a.key ? { background: a.color, borderColor: a.color } : undefined}
                  >
                    {a.icon} {a.label}
                  </button>
                ))}
              </div>
              {task.type === 'progressive' && (
                <div className="progressive-fields">
                  <div>
                    <label>Valeur de départ</label>
                    <input
                      type="number"
                      value={editDraft.start_value}
                      onChange={(e) => setEditDraft((d) => ({ ...d, start_value: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label>Incrément / jour</label>
                    <input
                      type="number"
                      value={editDraft.daily_increment}
                      onChange={(e) => setEditDraft((d) => ({ ...d, daily_increment: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label>Date de départ</label>
                    <input
                      type="date"
                      value={editDraft.start_date}
                      onChange={(e) => setEditDraft((d) => ({ ...d, start_date: e.target.value }))}
                    />
                  </div>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={onCancelEdit}>Annuler</button>
                <button type="button" className="btn-primary" onClick={() => onSave(task)}>Enregistrer</button>
              </div>
            </div>
          )
        }
        return (
          <div key={task.id} className={`task-admin ${task.active ? '' : 'task-admin--off'}`}>
            <div className="task-admin__main">
              <span className="task-admin__axis" style={{ background: axis?.color }} aria-hidden="true">
                {axis?.icon}
              </span>
              <div>
                <div className="task-admin__title">{task.title}</div>
                <div className="task-admin__meta muted small">
                  {axis?.label}
                  {task.scheduled_time && <> • {String(task.scheduled_time).slice(0, 5)}</>}
                  {task.type === 'progressive' && (
                    <> • départ {task.start_value} • +{task.daily_increment}/jour</>
                  )}
                  {!task.active && <> • désactivée</>}
                </div>
              </div>
            </div>
            <div className="task-admin__actions">
              {onBackfill && task.type === 'habit' && (
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => onBackfill(task)}
                  title="Pré-remplir un streak déjà pratiqué"
                >
                  🔥 Seed
                </button>
              )}
              <button
                type="button"
                className="btn-link"
                onClick={() => onToggleActive(task)}
              >
                {task.active ? 'Désactiver' : 'Activer'}
              </button>
              <button type="button" className="btn-link" onClick={() => onStartEdit(task)}>
                Modifier
              </button>
              <button
                type="button"
                className="btn-link btn-link--danger"
                onClick={() => onDelete(task)}
              >
                Supprimer
              </button>
            </div>
          </div>
        )
      })}
    </section>
  )
}
