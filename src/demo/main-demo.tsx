/**
 * Page d'aperçu visuel, hors production.
 *
 * Elle alimente le cache avec des données figées pour que les écrans se
 * rendent sans base ni session. Elle sert à juger l'apparence — Vite ne
 * construit que index.html, celle-ci ne part donc jamais en ligne.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { qk } from '@/data/keys'
import { todayKey } from '@/lib/date'
import { TodayScreen } from '@/features/today/TodayScreen'
import { GoalsScreen } from '@/features/goals/GoalsScreen'
import '@/styles/tokens.css'
import '@/styles/app.css'

const U = 'demo-user'
const day = todayKey()

const axes = [
  { key: 'spiritualite', label: 'ALLAH', color: '#2bb39d', position: 1, active: true },
  { key: 'sante', label: 'SAHTI', color: '#e0863a', position: 2, active: true },
  { key: 'personnel', label: 'ANA', color: '#e06aa5', position: 3, active: true },
  { key: 'social', label: 'Social', color: '#63a4fb', position: 4, active: true },
  { key: 'business', label: 'BUSINESS', color: '#9385f5', position: 5, active: true },
]

const T = (id: string, axis: string, title: string, time: string | null) => ({
  id, user_id: U, axis_key: axis, title, title_ar: null, scheduled_time: time,
  cadence: { type: 'daily' }, active: true, start_date: null, end_date: null,
  created_at: '2026-09-07T00:00:00Z',
})

const tasks = [
  T('t1', 'spiritualite', 'NHMED ALLAH O NCHOKRO', '04:50:00'),
  T('t2', 'spiritualite', 'Fajr Jama3a', '05:40:00'),
  T('t3', 'sante', 'Pompes immédiatement après réveil', '06:10:00'),
  T('t4', 'spiritualite', 'FAITH is contrary of FEAR', '08:00:00'),
  T('t5', 'personnel', 'PLANIFICATION JOURNALIERE', '08:30:00'),
  T('t6', 'social', 'NHDAR M3A ABDELHAMID LAF9IH', '12:00:00'),
  T('t7', 'spiritualite', 'DOHR JAMA3A', '12:20:00'),
  T('t8', 'spiritualite', '3ASR JAMA3A', '15:45:00'),
  T('t9', 'business', 'PREPARATION ET LANCEMENT CREATIVES', '17:00:00'),
  T('t10', 'spiritualite', 'MAGHRIB JAMA3A', '18:30:00'),
  T('t11', 'spiritualite', 'NHFAD 5 VERSETS BIN LMGHREB O L3CHA', '19:10:00'),
  T('t12', 'spiritualite', 'ICHAA JAMA3A', '19:55:00'),
  T('t13', 'personnel', 'LECTURE QUOTIDIENNE', null),
]

const doneIds = ['t1', 't2', 't4', 't5', 't7']
const logs = doneIds.map((id, i) => ({
  id: `l${i}`, user_id: U, task_id: id, log_date: day, status: 'done',
  value: null, note: null, created_at: day,
}))

const streaks = [
  { task_id: 't1', streak: 3, streak_unit: 'jours' },
  { task_id: 't2', streak: 12, streak_unit: 'jours' },
  { task_id: 't7', streak: 9, streak_unit: 'jours' },
  { task_id: 't11', streak: 4, streak_unit: 'jours' },
]

const progress = [
  { goal_id: 'g1', slug: 'salat', label: 'Prières', label_ar: 'صلاة كاملة في وقتها',
    domain: 'spiritual', kind: 'habit', unit: 'jour', is_private: false, state: 'in_progress',
    position: 1, starts_on: '2026-09-07', deadline: '2026-12-31', days_total: 116,
    days_elapsed: 32, days_left: 84, real_value: 23, target_value: 116,
    real_ratio: 0.198, expected_ratio: 0.276, expected_value: 32,
    projected_value: 83, projected_ratio: 0.716, pace_factor: 1.38, required_per_day: 1.11 },
  { goal_id: 'g2', slug: 'hizb', label: 'Hizb', label_ar: 'حفظ ٣٠ حزب',
    domain: 'spiritual', kind: 'cumulative', unit: 'verset', is_private: false, state: 'in_progress',
    position: 2, starts_on: '2026-09-07', deadline: '2026-12-31', days_total: 116,
    days_elapsed: 32, days_left: 84, real_value: 160, target_value: 1800,
    real_ratio: 0.089, expected_ratio: 0.276, expected_value: 497,
    projected_value: 580, projected_ratio: 0.322, pace_factor: 3.9, required_per_day: 19.5 },
  { goal_id: 'g3', slug: 'body', label: 'Corps', label_ar: 'بنية قوية منحوتة',
    domain: 'body', kind: 'habit', unit: 'séance', is_private: false, state: 'in_progress',
    position: 3, starts_on: '2026-09-07', deadline: '2026-12-31', days_total: 116,
    days_elapsed: 32, days_left: 84, real_value: 28, target_value: 116,
    real_ratio: 0.241, expected_ratio: 0.276, expected_value: 32,
    projected_value: 101, projected_ratio: 0.872, pace_factor: 1.05, required_per_day: 1.05 },
]

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
qc.setQueryData(qk.axes(U), axes)
qc.setQueryData(qk.tasks(U), tasks)
qc.setQueryData(qk.logs(U, day, day), logs)
qc.setQueryData(qk.streaks(U), streaks)
qc.setQueryData(qk.dayState(U, day), null)
qc.setQueryData(qk.goalProgress(U), progress)
qc.setQueryData(qk.focus(U), [])
qc.setQueryData(qk.advice(U), {
  rank: 1, kind: 'goal_unreachable',
  body: 'À ce rythme, حفظ ٣٠ حزب finit l’année à 32 %. Il faudrait 19,5 versets par jour contre 5 aujourd’hui — la cible est à renégocier, pas le rythme.',
})

const which = new URLSearchParams(location.search).get('v') ?? 'today'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        {which === 'goals' ? <GoalsScreen userId={U} /> : <TodayScreen userId={U} />}
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
)
