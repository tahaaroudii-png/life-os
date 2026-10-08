import { useMemo, useState } from 'react'
import { useModifications } from '../../hooks/useModifications'
import {
  STAGES, PRIORITIES, dueTone, sortByDue, averageProgress,
  groupByBucket, sortByPriorityInBucket,
} from '../../lib/oncf'
import ModifCard from '../../components/oncf/ModifCard'
import ModifDetailModal from '../../components/oncf/ModifDetailModal'
import ProgressRing from '../../components/oncf/ProgressRing'

/**
 * Point d'entrée du module ONCF.
 *
 * Deux vues au choix, avec un sélecteur clair en haut :
 *   - "Priorité" (défaut) : liste ordonnée par urgence — retard → semaine →
 *     à venir → clôturé, puis par priorité et échéance. C'est la vue "qu'est-ce
 *     que je fais maintenant". Cartes larges avec action en cours et journal.
 *   - "Kanban" : 7 colonnes par étape, drag & drop pour changer d'étape.
 *     Utile pour voir le pipeline d'ensemble, pas pour prioriser.
 *
 * En haut : dashboard avec jauge globale d'avancement et stats.
 */
export default function ModificationsHome() {
  const { modifications, isLoading, createModif, updateModif, deleteModif } = useModifications()

  const [view, setView] = useState('priority') // 'priority' | 'kanban'

  // Filtres.
  const [prio, setPrio] = useState('all')
  const [equipmentFilter, setEquipmentFilter] = useState('')
  const [modalMode, setModalMode] = useState(null) // 'create' | 'edit' | null
  const [current, setCurrent] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [overStage, setOverStage] = useState(null)

  const filtered = useMemo(() => {
    let list = modifications
    if (prio !== 'all') list = list.filter((m) => m.priority === prio)
    if (equipmentFilter.trim()) {
      const q = equipmentFilter.trim().toLowerCase()
      list = list.filter((m) => (m.equipment || '').toLowerCase().includes(q))
    }
    return list
  }, [modifications, prio, equipmentFilter])

  // Vue priorité : buckets ordonnés (retard → semaine → à venir → clôturées).
  const buckets = useMemo(() => groupByBucket(filtered), [filtered])

  // Vue kanban : groupé par étape, trié par échéance dans chaque colonne.
  const byStage = useMemo(() => {
    const map = Object.fromEntries(STAGES.map((s) => [s.key, []]))
    for (const m of sortByDue(filtered)) if (map[m.stage]) map[m.stage].push(m)
    return map
  }, [filtered])

  const stats = useMemo(() => {
    const perStage = Object.fromEntries(STAGES.map((s) => [s.key, 0]))
    let overdue = 0
    let soon = 0
    let closed = 0
    for (const m of modifications) {
      perStage[m.stage] = (perStage[m.stage] || 0) + 1
      if (m.stage === 'cloture') { closed++; continue }
      const tone = dueTone(m.due_date)
      if (tone === 'overdue') overdue++
      if (tone === 'soon') soon++
    }
    const avgActive = averageProgress(modifications, { includeClosed: false })
    const activeCount = modifications.length - closed
    return { perStage, overdue, soon, total: modifications.length, closed, activeCount, avgActive }
  }, [modifications])

  function openCreate() { setCurrent(null); setModalMode('create') }
  function openEdit(m) { setCurrent(m); setModalMode('edit') }
  function closeModal() { setModalMode(null); setCurrent(null) }

  async function handleCreate(payload) {
    await createModif.mutateAsync(payload)
  }
  async function handleSave(id, patch) {
    await updateModif.mutateAsync({ id, ...patch })
  }
  async function handleDelete(id) {
    await deleteModif.mutateAsync(id)
  }
  async function handleChangeStage(id, newStage) {
    await updateModif.mutateAsync({ id, stage: newStage })
  }
  async function handleAddNote(id, newNotes) {
    await updateModif.mutateAsync({ id, notes: newNotes })
  }

  if (isLoading) return <p className="muted">Chargement…</p>

  return (
    <div className="page-oncf">
      <div className="page-header">
        <h1>Modifications ONCF</h1>
        <button type="button" className="btn-primary" onClick={openCreate}>
          + Nouvelle modification
        </button>
      </div>

      {/* -------- Dashboard : jauge globale + stats + par étape -------- */}
      <section className="oncf-dash">
        <div className="oncf-dash__hero">
          <ProgressRing
            pct={stats.avgActive}
            size={160}
            stroke={14}
            showLabel
            label="Avancement moyen"
          />
          <div className="oncf-dash__hero-legend">
            <div>
              <strong>{stats.activeCount}</strong> modification{stats.activeCount > 1 ? 's' : ''} active{stats.activeCount > 1 ? 's' : ''}
            </div>
            {stats.closed > 0 && (
              <div className="muted small">
                <strong>{stats.closed}</strong> clôturée{stats.closed > 1 ? 's' : ''} (non comptée{stats.closed > 1 ? 's' : ''} dans la moyenne)
              </div>
            )}
          </div>
        </div>

        <div className="oncf-dash__stats">
          <div className="oncf-dash__stat">
            <div className="oncf-dash__value">{stats.total}</div>
            <div className="oncf-dash__label">Total</div>
          </div>
          <div className={`oncf-dash__stat ${stats.overdue > 0 ? 'oncf-dash__stat--danger' : ''}`}>
            <div className="oncf-dash__value">{stats.overdue}</div>
            <div className="oncf-dash__label">En retard</div>
          </div>
          <div className={`oncf-dash__stat ${stats.soon > 0 ? 'oncf-dash__stat--warn' : ''}`}>
            <div className="oncf-dash__value">{stats.soon}</div>
            <div className="oncf-dash__label">Sous 7 j.</div>
          </div>
        </div>

        <div className="oncf-dash__stages">
          {STAGES.map((s) => (
            <div key={s.key} className="oncf-dash__mini" style={{ '--stage-color': s.color }}>
              <span className="oncf-dash__mini-count">{stats.perStage[s.key] || 0}</span>
              <span className="oncf-dash__mini-label">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* -------- View switcher -------- */}
      <div className="view-switch" role="tablist" aria-label="Type de vue">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'priority'}
          className={`view-switch__btn ${view === 'priority' ? 'view-switch__btn--active' : ''}`}
          onClick={() => setView('priority')}
        >
          🎯 Priorité
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'kanban'}
          className={`view-switch__btn ${view === 'kanban' ? 'view-switch__btn--active' : ''}`}
          onClick={() => setView('kanban')}
        >
          📊 Kanban
        </button>
      </div>

      {/* -------- Filtres -------- */}
      <div className="filters">
        <div className="month-picker">
          <button
            type="button"
            className={`chip ${prio === 'all' ? 'chip--active' : ''}`}
            onClick={() => setPrio('all')}
          >
            Toutes priorités
          </button>
          {PRIORITIES.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`chip ${prio === p.key ? 'chip--active' : ''}`}
              style={prio === p.key ? { background: p.color, borderColor: p.color } : undefined}
              onClick={() => setPrio(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={equipmentFilter}
          onChange={(e) => setEquipmentFilter(e.target.value)}
          placeholder="Filtrer par engin…"
          style={{ maxWidth: 220 }}
        />
      </div>

      {/* -------- Vue -------- */}
      {view === 'priority' ? (
        <PriorityView
          buckets={buckets}
          onOpen={openEdit}
          onChangeStage={handleChangeStage}
          onAddNote={handleAddNote}
        />
      ) : (
        <Kanban
          byStage={byStage}
          draggingId={draggingId}
          overStage={overStage}
          setDraggingId={setDraggingId}
          setOverStage={setOverStage}
          onOpen={openEdit}
          onDropStage={handleChangeStage}
        />
      )}

      <ModifDetailModal
        open={modalMode !== null}
        mode={modalMode}
        modif={current}
        onClose={closeModal}
        onCreate={handleCreate}
        onSave={handleSave}
        onDelete={handleDelete}
        onAddNote={handleAddNote}
      />
    </div>
  )
}

// -----------------------------------------------------------
// Vue Priorité — buckets par urgence, cartes grandes
// -----------------------------------------------------------
function PriorityView({ buckets, onOpen, onChangeStage, onAddNote }) {
  const nonEmpty = buckets.filter((b) => b.items.length > 0)
  if (nonEmpty.length === 0) {
    return (
      <div className="card">
        <p style={{ margin: 0 }}>Aucune modification correspondant au filtre.</p>
      </div>
    )
  }
  return (
    <div className="prio-view">
      {nonEmpty.map((bucket) => (
        <section
          key={bucket.key}
          className={`prio-bucket prio-bucket--${bucket.tone}`}
        >
          <header className="prio-bucket__head">
            <h2 className="prio-bucket__title">{bucket.label}</h2>
            <span className="prio-bucket__count">{bucket.items.length}</span>
          </header>
          <div className="prio-bucket__items">
            {bucket.items.map((m) => (
              <ModifCard
                key={m.id}
                modif={m}
                mode="priority"
                onOpen={onOpen}
                onChangeStage={onChangeStage}
                onAddNote={onAddNote}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

// -----------------------------------------------------------
// Vue Kanban : 7 colonnes par étape, DnD natif
// -----------------------------------------------------------
function Kanban({ byStage, draggingId, overStage, setDraggingId, setOverStage, onOpen, onDropStage }) {
  return (
    <div className="oncf-kanban">
      {STAGES.map((stage) => {
        const items = byStage[stage.key]
        return (
          <div
            key={stage.key}
            className={`oncf-col ${overStage === stage.key ? 'oncf-col--over' : ''}`}
            style={{ '--stage-color': stage.color }}
            onDragOver={(e) => {
              e.preventDefault()
              if (overStage !== stage.key) setOverStage(stage.key)
            }}
            onDragLeave={() => {
              if (overStage === stage.key) setOverStage(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              const id = e.dataTransfer.getData('text/plain') || draggingId
              setOverStage(null)
              setDraggingId(null)
              if (!id) return
              const dropped = items.some((m) => m.id === id)
              if (dropped) return
              onDropStage(id, stage.key)
            }}
          >
            <div className="oncf-col__head">
              <span className="oncf-col__title">{stage.label}</span>
              <span className="oncf-col__count">{items.length}</span>
            </div>
            <div className="oncf-col__body">
              {items.map((m) => (
                <ModifCard
                  key={m.id}
                  modif={m}
                  mode="kanban"
                  onOpen={onOpen}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', m.id)
                    e.dataTransfer.effectAllowed = 'move'
                    setDraggingId(m.id)
                  }}
                  onDragEnd={() => {
                    setDraggingId(null)
                    setOverStage(null)
                  }}
                />
              ))}
              {items.length === 0 && (
                <div className="oncf-col__empty">—</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Ré-exportation pour d'anciens imports; supprimée par le bundler si non utilisé.
export { sortByPriorityInBucket }
