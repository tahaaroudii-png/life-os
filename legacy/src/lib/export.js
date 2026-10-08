import { ENVELOPE_LABELS, TX_COLS } from './schema'

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function csvEscape(value) {
  const s = String(value ?? '')
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function exportTransactionsCSV(transactions) {
  const header = ['Date', 'Enveloppe', 'Montant (DH)', 'Note']
  const rows = transactions.map((tx) => [
    new Date(tx[TX_COLS.occurredAt]).toLocaleString('fr-FR'),
    ENVELOPE_LABELS[tx.envelope] || tx.envelope,
    tx.amount,
    tx.note || '',
  ])
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(';')).join('\n')
  download('depenses.csv', '﻿' + csv, 'text/csv;charset=utf-8')
}

export function exportTransactionsJSON(transactions) {
  download('depenses.json', JSON.stringify(transactions, null, 2), 'application/json')
}
