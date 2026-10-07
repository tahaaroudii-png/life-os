import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from './keys'
import type { TaskLog } from '@/db/types'
import type { LogStatus } from '@/domain/streak'

export function useTaskLogs(userId: string | undefined, from: string, to: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: qk.logs(userId, from, to),
    enabled: !!userId && !!from && !!to,
    queryFn: async (): Promise<TaskLog[]> => {
      const { data, error } = await supabase
        .from('task_logs').select('*').gte('log_date', from).lte('log_date', to)
      if (error) throw error
      return data as TaskLog[]
    },
  })

  /**
   * Pose ou met à jour le log d'une (tâche, jour).
   *
   * L'opération est idempotente par construction : la contrainte unique
   * (user_id, task_id, log_date) fait que la rejouer — après une coupure
   * réseau, depuis deux appareils — ne crée jamais une seconde ligne.
   * C'est ce qui manquait à l'ancienne app, qui dédoublonnait ses tâches
   * à chaque chargement pour réparer des duplications de ce genre.
   */
  const setStatus = useMutation({
    mutationFn: async (vars: {
      task_id: string
      log_date: string
      status: LogStatus
      value?: number | null
      target_value?: number | null
      skip_reason?: string | null
    }) => {
      const { data, error } = await supabase
        .from('task_logs')
        .upsert({
          user_id: userId,
          task_id: vars.task_id,
          log_date: vars.log_date,
          status: vars.status,
          value: vars.value ?? null,
          target_value: vars.target_value ?? null,
          skip_reason: vars.skip_reason ?? null,
          completed_at: vars.status === 'done' ? new Date().toISOString() : null,
        }, { onConflict: 'user_id,task_id,log_date' })
        .select().single()
      if (error) throw error
      return data as TaskLog
    },

    // La case réagit avant le serveur : une coche qui attend le réseau
    // casse le rituel du soir plus sûrement qu'un bug.
    onMutate: async (vars) => {
      const key = qk.logs(userId, from, to)
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<TaskLog[]>(key)
      qc.setQueryData<TaskLog[]>(key, (old = []) => {
        const others = old.filter(
          (l) => !(l.task_id === vars.task_id && l.log_date === vars.log_date),
        )
        return [...others, {
          id: `optimistic-${vars.task_id}-${vars.log_date}`,
          user_id: userId!,
          task_id: vars.task_id,
          log_date: vars.log_date,
          status: vars.status,
          value: vars.value ?? null,
          target_value: vars.target_value ?? null,
          minutes: null,
          skip_reason: vars.skip_reason ?? null,
          completed_at: null,
        }]
      })
      return { previous }
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.logs(userId, from, to), ctx.previous)
    },

    // On invalide TOUTES les plages de logs, pas seulement celle-ci : la
    // progression annuelle lit une fenêtre différente de celle de l'écran
    // du jour. L'ancienne app n'invalidait que sa propre plage, et la
    // progression ne bougeait qu'au rechargement de la page.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.logsAll(userId) })
      qc.invalidateQueries({ queryKey: qk.goalProgress(userId) })
      qc.invalidateQueries({ queryKey: qk.streaks(userId) })
      qc.invalidateQueries({ queryKey: ['axis_daily', userId] })
    },
  })

  return { logs: query.data ?? [], isLoading: query.isLoading, error: query.error, setStatus }
}
