import { useMemo, useState } from 'react'
import { useTransactions } from '../hooks/useTransactions'
import { ENVELOPES, ENVELOPE_LABELS, TX_COLS } from '../lib/schema'
import { formatDH, formatDateFR, monthKey } from '../lib/format'
import { exportTransactionsCSV, exportTransactionsJSON } from '../lib/export'

export default function Historique() {
  const { transactions, isLoading, updateTransaction, deleteTransaction } = useTransactions()
  const [monthFilter, setMonthFilter] = useState('all')
  const [envelopeFilter, setEnvelopeFilter] = useState('all')
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({ amount: '', note: '' })

  const availableMonths = useMemo(() => {
    const set = new Set(transactions.map((t) => monthKey(t[TX_COLS.occurredAt])))
    return Array.from(set).sort().reverse()
  }, [transactions])

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (monthFilter !== 'all' && monthKey(t[TX_COLS.occurredAt]) !== monthFilter) return false
      if (envelopeFilter !== 'all' && t.envelope !== envelopeFilter) return false
      return true
    })
  }, [transactions, monthFilter, envelopeFilter])

  const total = filtered.reduce((sum, t) => sum + Number(t.amount || 0), 0)

  function startEdit(tx) {
    setEditingId(tx.id)
    setEditDraft({ amount: tx.amount, note: tx.note || '' })
  }

  async function saveEdit(id) {
    await updateTransaction.mutateAsync({
      id,
      amount: parseFloat(editDraft.amount),
      note: editDraft.note || null,
    })
    setEditingId(null)
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer cette dépense ?')) return
    await deleteTransaction.mutateAsync(id)
  }

  return (
    <div className="page-historique">
      <div className="page-header">
        <h1>Historique</h1>
        <div className="export-actions">
          <button type="button" className="btn-secondary" onClick={() => exportTransactionsCSV(filtered)}>
            Export CSV
          </button>
          <button type="button" className="btn-secondary" onClick={() => exportTransactionsJSON(filtered)}>
            Export JSON
          </button>
        </div>
      </div>

      <div className="filters">
        <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
          <option value="all">Tous les mois</option>
          {availableMonths.map((mk) => (
            <option key={mk} value={mk}>
              {mk}
            </option>
          ))}
        </select>

        <select value={envelopeFilter} onChange={(e) => setEnvelopeFilter(e.target.value)}>
          <option value="all">Toutes les enveloppes</option>
          {ENVELOPES.map((e) => (
            <option key={e.key} value={e.key}>
              {e.label}
            </option>
          ))}
        </select>

        <span className="muted">
          {filtered.length} dépense(s) — total {formatDH(total)}
        </span>
      </div>

      {isLoading ? (
        <p className="muted">Chargement…</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Enveloppe</th>
                <th>Montant</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx) => (
                <tr key={tx.id}>
                  <td>{formatDateFR(tx[TX_COLS.occurredAt])}</td>
                  <td>{ENVELOPE_LABELS[tx.envelope] || tx.envelope}</td>
                  <td>
                    {editingId === tx.id ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editDraft.amount}
                        onChange={(e) => setEditDraft((d) => ({ ...d, amount: e.target.value }))}
                        className="input-inline"
                      />
                    ) : (
                      formatDH(tx.amount)
                    )}
                  </td>
                  <td>
                    {editingId === tx.id ? (
                      <input
                        type="text"
                        value={editDraft.note}
                        onChange={(e) => setEditDraft((d) => ({ ...d, note: e.target.value }))}
                        className="input-inline"
                      />
                    ) : (
                      tx.note || <span className="muted">—</span>
                    )}
                  </td>
                  <td className="table-actions">
                    {editingId === tx.id ? (
                      <>
                        <button type="button" className="btn-link" onClick={() => saveEdit(tx.id)}>
                          Enregistrer
                        </button>
                        <button type="button" className="btn-link" onClick={() => setEditingId(null)}>
                          Annuler
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="btn-link" onClick={() => startEdit(tx)}>
                          Modifier
                        </button>
                        <button type="button" className="btn-link btn-link--danger" onClick={() => handleDelete(tx.id)}>
                          Supprimer
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted" style={{ textAlign: 'center' }}>
                    Aucune dépense pour ce filtre.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
