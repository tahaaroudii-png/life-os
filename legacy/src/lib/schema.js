// Noms des tables / colonnes Supabase, centralisés ici.
//
// Confirmés explicitement par l'utilisateur :
//   - transactions.envelope : texte parmi 'vie' | 'reinvest' | 'urgence' | 'divertissement'
//   - transactions.occurred_at : date/heure de la dépense (PAS `created_at`)
//   - settings : monthly_income, pct_vie, pct_reinvest, pct_urgence, pct_divertissement,
//                emergency_goal, start_month
//
// Non précisés (id, user_id, amount, note de `transactions`, et la clé de `settings`) :
// valeurs standard supposées ci-dessous. Si votre schéma réel diffère sur ces points
// précis, il suffit de corriger les valeurs dans ce fichier — le reste de l'app importe
// toujours TX_COLS / SETTINGS_COLS plutôt que d'écrire un nom de colonne en dur.

export const ENVELOPES = [
  { key: 'vie', label: 'Vie', pctField: 'pct_vie', resets: true },
  { key: 'reinvest', label: 'Réinvestissement', pctField: 'pct_reinvest', resets: true },
  { key: 'urgence', label: "Fond d'urgence", pctField: 'pct_urgence', resets: false },
  { key: 'divertissement', label: 'Divertissement', pctField: 'pct_divertissement', resets: true },
]

export const ENVELOPE_LABELS = Object.fromEntries(ENVELOPES.map((e) => [e.key, e.label]))

export const TABLES = {
  transactions: 'transactions',
  settings: 'settings',
}

export const TX_COLS = {
  id: 'id',
  userId: 'user_id',
  amount: 'amount',
  envelope: 'envelope',
  note: 'note',
  occurredAt: 'occurred_at',
}

export const SETTINGS_COLS = {
  userId: 'user_id',
  monthlyIncome: 'monthly_income',
  pctVie: 'pct_vie',
  pctReinvest: 'pct_reinvest',
  pctUrgence: 'pct_urgence',
  pctDivertissement: 'pct_divertissement',
  emergencyGoal: 'emergency_goal',
  startMonth: 'start_month',
}
