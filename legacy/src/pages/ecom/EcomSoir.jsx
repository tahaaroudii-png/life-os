import { useEffect, useMemo, useState } from 'react'
import { useEcom } from '../../hooks/useEcom'
import { useGoals } from '../../hooks/useGoals'
import { useTaskLogs } from '../../hooks/useTaskLogs'
import { collectHabits } from '../../lib/goals'
import { buildEveningEntries, todayKey, PLATFORMS } from '../../lib/ecom'

/**
 * Saisie du soir — §6. Une ligne par campagne active. Enregistre en une
 * passe : crée les mouvements `ads` correspondants + upsert les entrées daily.
 *
 * Éditions locales stockées dans `edits` (clé par campagne). Vidé quand la
 * date change ou après un enregistrement.
 */
export default function EcomSoir() {
  const ecom = useEcom()
  const [date, setDate] = useState(todayKey())
  const [edits, setEdits] = useState({})
  const [msg, setMsg] = useState(null)

  const activeCamps = useMemo(
    () => ecom.campaigns.filter((c) => c.status === 'active'),
    [ecom.campaigns]
  )

  // Reset des édits quand la date change (pour re-lire les valeurs de la nouvelle date).
  useEffect(() => { setEdits({}); setMsg(null) }, [date])

  function getRow(campId) {
    if (edits[campId]) return edits[campId]
    const prev = ecom.daily.find((d) => d.date === date && d.campaignId === campId)
    return {
      spend: prev?.spend ?? '',
      leads: prev?.leads ?? '',
      currency: prev?.currency || ecom.settings.baseCurrency,
    }
  }

  function setField(campId, patch) {
    setEdits((e) => ({ ...e, [campId]: { ...getRow(campId), ...patch } }))
  }

  async function save() {
    const rows = activeCamps
      .map((c) => ({ campaignId: c.id, ...getRow(c.id) }))
      .filter((r) => Number(r.spend) > 0 || Number(r.leads) > 0)
    if (rows.length === 0) { setMsg('Aucune saisie à enregistrer.'); return }
    const { movements, daily } = buildEveningEntries({
      rows, date,
      campaigns: ecom.campaigns,
      products: ecom.products,
      baseCurrency: ecom.settings.baseCurrency,
    })
    ecom.addMovements(movements)
    ecom.upsertDaily(daily)
    setMsg(`✓ ${rows.length} ligne(s) enregistrée(s) — ${movements.length} mouvement(s) ads créé(s).`)
    setEdits({})
  }

  return (
    <div className="page-ecom-soir">
      <div className="page-header">
        <h1>Saisie du soir</h1>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 180 }} />
      </div>

      <p className="muted">
        Deux minutes chrono. Une ligne par campagne active. Confirmations et
        livraisons ne se saisissent pas ici — elles arrivent via l'import
        hebdomadaire des relevés.
      </p>

      <section className="card card--wide">
        {activeCamps.length === 0 ? (
          <p className="muted">Aucune campagne active. Ajoute-en dans <strong>Media Buying → Campagnes</strong>.</p>
        ) : (
          <table className="ecom-table">
            <thead>
              <tr><th>Campagne</th><th>Plateforme</th><th>Produit</th><th>Dépense</th><th>Devise</th><th>Leads</th></tr>
            </thead>
            <tbody>
              {activeCamps.map((c) => {
                const product = ecom.products.find((p) => p.id === c.productId)
                const row = getRow(c.id)
                return (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong></td>
                    <td>{PLATFORMS.find((p) => p.key === c.platform)?.label}</td>
                    <td className="muted small">{product?.name || '—'}</td>
                    <td>
                      <input type="number" step="0.01" min="0"
                        value={row.spend}
                        onChange={(e) => setField(c.id, { spend: e.target.value })}
                        className="input-inline" />
                    </td>
                    <td>
                      <select value={row.currency} onChange={(e) => setField(c.id, { currency: e.target.value })}>
                        <option value="USD">USD</option><option value="MAD">MAD</option>
                        <option value="SAR">SAR</option><option value="AED">AED</option>
                      </select>
                    </td>
                    <td>
                      <input type="number" min="0"
                        value={row.leads}
                        onChange={(e) => setField(c.id, { leads: e.target.value })}
                        className="input-inline" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <div className="modal-actions" style={{ marginTop: '0.75rem' }}>
          <button type="button" className="btn-primary" onClick={save} disabled={activeCamps.length === 0}>
            Enregistrer la journée
          </button>
        </div>
        {msg && <p className="muted small" style={{ marginTop: '0.5rem' }}>{msg}</p>}
      </section>

      <HabitsInlinePanel date={date} />
    </div>
  )
}

/**
 * Panneau habitudes — même écran que la saisie du soir. Coche ou incrémente
 * les habitudes de la journée sans quitter le flux.
 */
function HabitsInlinePanel({ date }) {
  const goals = useGoals()
  const { upsertLog } = useTaskLogs(date, date)
  const habits = collectHabits(goals.state)
  if (habits.length === 0) return null

  async function setValue(entry, value) {
    const { goal, habit, embedded } = entry
    if (embedded) {
      goals.setEmbeddedHabitEntry(goal.id, date, value)
      // Mirroir Objectifs → Planning si un lien existe
      if (habit.linkedTaskId) {
        try { await upsertLog.mutateAsync({ task_id: habit.linkedTaskId, log_date: date, done: value > 0 }) }
        catch { /* silencieux */ }
      }
    } else {
      goals.setHabitEntry(goal.id, date, value)
    }
  }

  return (
    <section className="card card--wide" style={{ marginTop: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>Habitudes du jour</h2>
      <p className="muted small">Note aussi ce qui n'est pas de l'e-commerce — l'app le remonte dans Objectifs 2026.</p>
      <div className="soir-habits">
        {habits.map((entry) => {
          const { goal, habit } = entry
          const target = Number(habit.target) || 1
          const v = Number(habit.entries?.[date]) || 0
          const cumulative = !!habit.cumulative
          const done = !cumulative && v >= target
          return (
            <div key={habit.id} className={`soir-habit ${done ? 'is-done' : ''}`}>
              <div className="soir-habit__label">
                <strong>{habit.label || goal.label}</strong>
                {goal.subtitle && <div className="muted xs">{goal.subtitle}</div>}
              </div>
              <div className="soir-habit__count">
                <button type="button" onClick={() => setValue(entry, Math.max(0, v - 1))} disabled={v <= 0}>−</button>
                <span>{v}{cumulative ? '' : ` / ${target}`}</span>
                <button type="button" onClick={() => setValue(entry, v + 1)}>+</button>
                {!cumulative && (
                  <button type="button" className="btn-ghost" onClick={() => setValue(entry, done ? 0 : target)}>
                    {done ? 'Annuler' : 'Tout valider'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
