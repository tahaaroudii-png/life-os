import { AXIS_BY_KEY, formatTimeHM } from '../../lib/planning'

/**
 * Une ligne de tâche : grande zone tapable qui coche/décoche.
 *
 * Affiche à gauche :
 *   - l'heure prévue (si scheduled_time renseigné) — 2 lignes verticales : HH puis MM
 *   - sinon un tiret discret, pour préserver l'alignement de la colonne
 *
 * L'axe est indiqué via un point de couleur à côté du titre.
 * L'objectif du défi progressif s'affiche à côté du titre ("Pompes : 25").
 */
export default function TaskLine({ item, dateKey, onToggle, onDelete, onPostpone, onEditTime }) {
  const { task, log, target } = item
  const done = !!log?.done
  const axis = AXIS_BY_KEY[task.axis]
  const time = formatTimeHM(task.scheduled_time)

  function handleClick() {
    onToggle({
      task_id: task.id,
      log_date: dateKey,
      done: !done,
      target_value: target ?? null,
    })
  }

  return (
    <div className={`task-line ${done ? 'task-line--done' : ''}`}>
      {onEditTime ? (
        <button
          type="button"
          className="task-line__time task-line__time--clickable"
          onClick={(e) => { e.stopPropagation(); onEditTime(task) }}
          title="Ajuster l'heure prévue"
          aria-label="Ajuster l'heure prévue"
        >
          {time || <span className="muted">⏰</span>}
        </button>
      ) : (
        <div className="task-line__time" aria-hidden={!time}>
          {time || <span className="muted">—</span>}
        </div>
      )}
      <button
        type="button"
        className={`task-check ${done ? 'task-check--done' : ''}`}
        style={{ '--axis-color': axis?.color || '#64748b' }}
        onClick={handleClick}
        aria-pressed={done}
        aria-label={done ? `Décocher ${task.title}` : `Cocher ${task.title}`}
      >
        {done && (
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M5 12l4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <div className="task-line__body" onClick={handleClick} role="presentation">
        <div className="task-line__title">
          <span
            className="task-line__axis-dot"
            style={{ background: axis?.color }}
            title={axis?.label}
            aria-hidden="true"
          />
          {task.title}
          {target != null && <span className="task-line__target"> : {target}</span>}
        </div>
        <div className="task-line__meta">
          {axis?.label}
          {task.type === 'oneoff' && <> · tâche du jour</>}
          {task.type === 'progressive' && <> · défi progressif</>}
        </div>
      </div>
      {task.type === 'oneoff' && (
        <div className="task-line__actions">
          {onPostpone && log && (
            <button
              type="button"
              className="task-line__act"
              onClick={(e) => {
                e.stopPropagation()
                onPostpone(item)
              }}
              aria-label="Reporter cette tâche"
              title="Reporter à plus tard"
            >
              📅
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="task-line__act task-line__act--danger"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(task.id)
              }}
              aria-label="Supprimer cette tâche"
              title="Supprimer"
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  )
}
