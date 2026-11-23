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

/*
 * Les enveloppes.
 *
 * `amtField` porte un montant fixe, `pctField` l'ancien pourcentage. Le
 * montant l'emporte dès qu'il est renseigné : c'est ainsi qu'il raisonne
 * (« vie sera juste 3000 »), et un pourcentage se déforme à chaque
 * variation du salaire.
 *
 * `resets: false` marque une enveloppe d'épargne : elle ne repart pas à
 * zéro le 20, elle s'accumule vers un objectif (`goalField`) et accepte
 * des versements.
 */
export const ENVELOPES = [
  { key: 'vie', label: 'Vie', pctField: 'pct_vie', amtField: 'amt_vie', resets: true },
  { key: 'reinvest', label: 'Réinvestissement', pctField: 'pct_reinvest', amtField: 'amt_reinvest', resets: true },
  { key: 'divertissement', label: 'Divertissement', pctField: 'pct_divertissement', amtField: 'amt_divertissement', resets: true },
  { key: 'urgence', label: "Fond d'urgence", pctField: 'pct_urgence', amtField: 'amt_urgence', resets: false, goalField: 'emergency_goal', icone: '🛟' },
  { key: 'mariage', label: 'Mariage', amtField: 'amt_mariage', resets: false, goalField: 'goal_mariage', icone: '💍' },
  { key: 'appart_mere', label: 'Appartement de ma mère', amtField: 'amt_appart_mere', resets: false, goalField: 'goal_appart_mere', icone: '🏠' },
]

/** Les enveloppes qui s'accumulent et acceptent des versements. */
export const SAVING_ENVELOPES = ENVELOPES.filter((e) => !e.resets)

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
  amtVie: 'amt_vie',
  amtReinvest: 'amt_reinvest',
  amtUrgence: 'amt_urgence',
  amtDivertissement: 'amt_divertissement',
  amtMariage: 'amt_mariage',
  amtAppartMere: 'amt_appart_mere',
  goalMariage: 'goal_mariage',
  goalAppartMere: 'goal_appart_mere',
}
