import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { PLANNING_TABLES, addDays, todayKey } from '../lib/planning'
import { useAuth } from './useAuth'

// Realtime activé pour le module Planning, mais toujours non bloquant
// (mêmes garde-fous que useTransactions : try/catch, canal unique, warnings).
const REALTIME_ENABLED = true

const TASKS_KEY = (userId) => ['tasks', userId]

export function useTasks() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: TASKS_KEY(user?.id),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(PLANNING_TABLES.tasks)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    if (!REALTIME_ENABLED || !user) return
    let channel
    try {
      channel = supabase
        .channel(`tasks-${user.id}-${crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: PLANNING_TABLES.tasks, filter: `user_id=eq.${user.id}` },
          () => queryClient.invalidateQueries({ queryKey: TASKS_KEY(user.id) })
        )
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || err) {
            console.warn('Realtime tasks indisponible (non bloquant) :', err?.message || status)
          }
        })
    } catch (err) {
      console.warn('Realtime tasks : abonnement KO (non bloquant) :', err?.message || err)
    }
    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel)
        } catch {
          /* noop */
        }
      }
    }
  }, [user, queryClient])

  const createTask = useMutation({
    mutationFn: async (payload) => {
      // Nettoyage : Supabase (PostgREST) rejette les chaînes vides pour les
      // colonnes typées date/integer, ce qui faisait échouer silencieusement
      // certaines créations de tâches — d'où l'absence d'affichage ensuite.
      const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))
      const str = (v) => (v === '' || v == null ? null : v)

      const row = {
        id: crypto.randomUUID(),
        user_id: user.id,
        axis: payload.axis,
        title: payload.title,
        type: payload.type || 'habit',
        active: payload.active ?? true,
        start_value: num(payload.start_value),
        daily_increment: num(payload.daily_increment),
        start_date: str(payload.start_date),
        scheduled_time: str(payload.scheduled_time),
      }
      const { data, error } = await supabase
        .from(PLANNING_TABLES.tasks)
        .insert(row)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY(user?.id) }),
  })

  const updateTask = useMutation({
    mutationFn: async ({ id, ...patch }) => {
      const { data, error } = await supabase
        .from(PLANNING_TABLES.tasks)
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY(user?.id) }),
  })

  const deleteTask = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from(PLANNING_TABLES.tasks).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TASKS_KEY(user?.id) }),
  })

  /**
   * Backfill des logs pour une habitude — permet de "seeder" un streak déjà
   * pratiqué IRL avant l'installation de l'app. Insère `days` logs done=true
   * pour les jours STRICTEMENT AVANT aujourd'hui (yesterday, -2, ..., -N).
   *
   * Pourquoi exclure aujourd'hui : sinon le tap sur la case du jour la
   * décoche (elle était pré-remplie), et l'utilisateur perd son streak
   * sans comprendre. En excluant aujourd'hui, la case reste vide → l'user
   * coche naturellement → streak passe de N à N+1. Progression normale.
   * Idempotent grâce à onConflict.
   */
  const backfillHabit = useMutation({
    mutationFn: async ({ taskId, days }) => {
      const n = Math.max(0, Math.floor(Number(days) || 0))
      if (n === 0) return { inserted: 0 }
      const start = todayKey()
      const rows = []
      for (let i = 1; i <= n; i++) {
        rows.push({
          user_id: user.id,
          task_id: taskId,
          log_date: addDays(start, -i),
          done: true,
          target_value: null,
        })
      }
      const { error } = await supabase
        .from(PLANNING_TABLES.taskLogs)
        .upsert(rows, { onConflict: 'user_id,task_id,log_date' })
      if (error) throw error
      return { inserted: rows.length }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task_logs', user?.id] })
    },
  })

  return {
    tasks: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    createTask,
    updateTask,
    deleteTask,
    backfillHabit,
  }
}
