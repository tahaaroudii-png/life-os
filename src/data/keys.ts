/** Les clés de cache, au même endroit : une invalidation ratée est un bug muet. */
export const qk = {
  axes: (uid?: string) => ['axes', uid] as const,
  tasks: (uid?: string) => ['tasks', uid] as const,
  logs: (uid: string | undefined, from: string, to: string) => ['logs', uid, from, to] as const,
  logsAll: (uid?: string) => ['logs', uid] as const,
  dayState: (uid: string | undefined, day: string) => ['day_state', uid, day] as const,
  goals: (uid?: string) => ['goals', uid] as const,
  goalProgress: (uid?: string) => ['goal_progress', uid] as const,
  streaks: (uid?: string) => ['streaks', uid] as const,
  links: (uid?: string) => ['goal_task_links', uid] as const,
  focus: (uid?: string) => ['today_focus', uid] as const,
  advice: (uid?: string) => ['advice', uid] as const,

  products: (uid?: string) => ['products', uid] as const,
  campaigns: (uid?: string) => ['campaigns', uid] as const,
  kpis: (uid: string | undefined, days: number) => ['product_kpis', uid, days] as const,
  verdicts: (uid?: string) => ['verdicts', uid] as const,
  stockAlerts: (uid?: string) => ['stock_alerts', uid] as const,
  stockCoverage: (uid?: string) => ['stock_coverage', uid] as const,
  dailyAds: (uid: string | undefined, day: string) => ['daily_ads', uid, day] as const,
  netPeriod: (uid: string | undefined, from: string, to: string) => ['net', uid, from, to] as const,

  envelopes: (uid?: string) => ['envelopes', uid] as const,
  accounts: (uid?: string) => ['accounts', uid] as const,
  transactions: (uid: string | undefined, from: string) => ['transactions', uid, from] as const,
  forecast: (uid?: string) => ['cash_forecast', uid] as const,

  modifications: (uid?: string) => ['modifications', uid] as const,
  modifEvents: (id: string) => ['modif_events', id] as const,

  hifzSummary: (uid?: string) => ['hifz_summary', uid] as const,
  hifzDue: (uid?: string) => ['hifz_due', uid] as const,

  insights: (uid?: string) => ['insights', uid] as const,
}

/** Tout ce que la clôture du soir ou une coche peut faire bouger. */
export const INVALIDATE_ON_LOG = (uid?: string) => [
  ['logs', uid], ['goal_progress', uid], ['streaks', uid],
  ['axis_daily', uid], ['today_focus', uid], ['advice', uid],
]
