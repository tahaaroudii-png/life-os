/**
 * Les types du schéma `life`.
 *
 * À remplacer par la génération automatique dès que le projet Supabase
 * existe :
 *   npx supabase gen types typescript --project-id <id> --schema life > src/db/types.ts
 * En attendant, ils sont tenus à la main et reflètent les migrations 0001
 * à 0004 à la lettre.
 */
import type { Cadence } from '@/domain/cadence'
import type { LogStatus } from '@/domain/streak'

export type Uuid = string
export type DateString = string        // YYYY-MM-DD
export type TimeString = string        // HH:MM:SS
export type Timestamp = string         // ISO 8601

export interface Axis {
  user_id: Uuid
  key: string
  label: string
  label_ar: string | null
  icon: string | null
  color: string
  position: number
  weekly_target_minutes: number | null
  active: boolean
}

export type TaskKind = 'habit' | 'oneoff' | 'progressive' | 'project_step'

export interface Task {
  id: Uuid
  user_id: Uuid
  axis_key: string
  title: string
  title_ar: string | null
  kind: TaskKind
  cadence: Cadence
  scheduled_time: TimeString | null
  duration_minutes: number | null
  start_value: number | null
  daily_increment: number | null
  start_date: DateString | null
  end_date: DateString | null
  active: boolean
  archived_at: Timestamp | null
  notes: string | null
  created_at: Timestamp
}

export interface TaskLog {
  id: Uuid
  user_id: Uuid
  task_id: Uuid
  log_date: DateString
  status: LogStatus
  value: number | null
  target_value: number | null
  minutes: number | null
  skip_reason: string | null
  completed_at: Timestamp | null
}

export interface DayState {
  user_id: Uuid
  day: DateString
  energy: number | null
  mood: number | null
  sleep_hours: number | null
  note: string | null
  miss_reason: string | null
  closed_at: Timestamp | null
  auto_closed: boolean
}

export interface AxisMinutes {
  user_id: Uuid
  day: DateString
  axis_key: string
  minutes: number
}

export type GoalKind = 'habit' | 'cumulative' | 'metric' | 'milestone'
export type GoalDomain = 'spiritual' | 'body' | 'business' | 'personal' | 'work'

export interface Goal {
  id: Uuid
  user_id: Uuid
  slug: string
  label: string
  label_ar: string | null
  subtitle: string | null
  domain: GoalDomain
  kind: GoalKind
  unit: string | null
  target_total: number | null
  daily_target: number | null
  daily_max: number | null
  starts_on: DateString
  deadline: DateString
  is_private: boolean
  state: 'in_progress' | 'done' | 'abandoned' | 'renegotiated'
  position: number
}

export interface GoalMilestone {
  id: Uuid
  goal_id: Uuid
  label: string
  due_on: DateString
  target_value: number | null
  reached_on: DateString | null
  note: string | null
}

export type Contribution = 'full' | 'fractional' | 'increment' | 'minutes'

export interface GoalTaskLink {
  goal_id: Uuid
  task_id: Uuid
  contribution: Contribution
  weight: number
}

/** Vue life.v_goal_progress — tout est calculé en base, rien n'est stocké. */
export interface GoalProgressRow {
  goal_id: Uuid
  slug: string
  label: string
  label_ar: string | null
  domain: GoalDomain
  kind: GoalKind
  unit: string | null
  is_private: boolean
  state: string
  position: number
  starts_on: DateString
  deadline: DateString
  days_total: number
  days_elapsed: number
  days_left: number
  real_value: number | null
  target_value: number | null
  real_ratio: number | null
  expected_ratio: number
  expected_value: number | null
  projected_value: number | null
  projected_ratio: number | null
  pace_factor: number | null
  required_per_day: number | null
}

/** Vue life.v_task_streaks */
export interface StreakRow {
  task_id: Uuid
  axis_key: string
  title: string
  cadence_type: string
  streak: number
  streak_unit: 'jours' | 'semaines'
}

/** Vue life.v_axis_daily */
export interface AxisDailyRow {
  day: DateString
  axis_key: string
  total: number
  done: number
  missed: number
  skipped: number
  pending: number
  minutes: number
}

// ---------------------------------------------------------------------
// Business COD
// ---------------------------------------------------------------------

export type ProductStatus = 'testing' | 'scaling' | 'optimising' | 'killed' | 'archived'

export interface Product {
  id: Uuid
  name: string
  name_ar: string | null
  sku: string[]
  category: string
  market_key: string | null
  cogs_usd: number
  weight_kg: number
  status: ProductStatus
  status_since: DateString
  active: boolean
}

export interface Campaign {
  id: Uuid
  product_id: Uuid
  platform: string
  market_key: string | null
  name: string
  status: 'active' | 'paused' | 'ended'
  started_on: DateString
  ended_on: DateString | null
}

export interface DailyAd {
  day: DateString
  campaign_id: Uuid
  spend_usd: number
  leads: number
  impressions: number | null
  clicks: number | null
  note: string | null
}

/** Vue life.v_product_kpis — une ligne par produit et par fenêtre. */
export interface ProductKpiRow {
  product_id: Uuid
  name: string
  name_ar: string | null
  status: ProductStatus
  status_since: DateString
  market_key: string | null
  days: number
  leads: number
  spend: number
  confirmed: number
  delivered: number
  returned: number
  revenue: number
  cpl: number | null
  cpd: number | null
  conf_rate: number | null
  deliv_rate: number | null
  net_per_deliv: number | null
}

export interface VerdictRow {
  product_id: Uuid
  name: string
  status: ProductStatus
  status_since: DateString
  days_in_status: number
  computed_verdict: 'testing' | 'scale' | 'optimise' | 'kill'
  reason: string
  wins: number
  kills: number
  needs_action: boolean
}

export interface StockAlertRow {
  product_id: Uuid
  name: string
  market_key: string
  quantity: number
  coverage_days: number | null
  value_locked: number
  alert: 'rupture' | 'dormant' | 'inactif'
  message: string
}

export interface CplCap {
  price: number
  cogs: number
  shipping: number
  margin: number
  cpl_cap: number
}

// ---------------------------------------------------------------------
// Argent
// ---------------------------------------------------------------------

export interface EnvelopeState {
  key: string
  label: string
  position: number
  month: DateString
  allocated: number
  spent: number
  remaining: number
}

export interface CashPositionRow {
  account_id: Uuid
  name: string
  kind: string
  currency: string
  is_business: boolean
  computed_balance: number
  last_real_balance: number | null
  last_reconciled_on: DateString | null
}

export interface CashForecastRow {
  week_start: DateString
  salary: number
  cod_in: number
  ad_out: number
  planned_out: number
  envelopes_out: number
  net: number
  running: number
}

export interface Transaction {
  id: Uuid
  account_id: Uuid | null
  occurred_on: DateString
  amount: number
  currency: string
  direction: 'in' | 'out'
  envelope_key: string | null
  category: string | null
  counterparty: string | null
  is_loan: boolean
  loan_due_on: DateString | null
  product_id: Uuid | null
  note: string | null
}

// ---------------------------------------------------------------------
// ONCF — le vocabulaire reste celui du métier, en français
// ---------------------------------------------------------------------

export type ModifStage =
  | 'identifie' | 'etude' | 'prototype' | 'validation'
  | 'dossier_redige' | 'deploiement_serie' | 'cloture'

export type ModifPriority = 'basse' | 'moyenne' | 'haute' | 'critique'

export interface ModificationRow {
  id: Uuid
  title: string
  engine: string | null
  stage: ModifStage
  priority: ModifPriority
  due_on: DateString | null
  owner: string | null
  closed_on: DateString | null
  progress: number
  days_to_due: number | null
  bucket: 'closed' | 'undated' | 'late' | 'imminent' | 'ahead'
  event_count: number
  last_event_on: DateString | null
}

export interface ModificationEvent {
  id: Uuid
  modification_id: Uuid
  happened_on: DateString
  kind: 'note' | 'stage_change' | 'call' | 'document' | 'blocker'
  body: string
}

// ---------------------------------------------------------------------
// Mémorisation
// ---------------------------------------------------------------------

export interface HifzSummary {
  hizb_memorised: number
  verses_new: number
  verses_reviewed: number
  due_count: number
}

export interface HifzDueRow {
  hizb: number
  memorised_on: DateString | null
  last_reviewed_on: DateString
  review_interval_days: number
  strength: number
  due_on: DateString
  days_overdue: number
}

// ---------------------------------------------------------------------
// Insights et conseil
// ---------------------------------------------------------------------

export interface Insight {
  id: Uuid
  computed_on: DateString
  kind: string
  subject: string
  body: string
  effect: number | null
  sample_size: number | null
  dismissed_at: Timestamp | null
  acted_at: Timestamp | null
}

export interface AdviceRow {
  rank: number
  kind: string
  body: string
}

export interface FocusRow {
  task_id: Uuid
  title: string
  axis_key: string
  goal_label: string
  pace_factor: number | null
  status: LogStatus
  rank: number
}
