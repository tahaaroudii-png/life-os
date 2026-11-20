import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { PLANNING_TABLES } from '../lib/planning'
import { abonnerPartage } from '../lib/realtimeShared'
import { fetchAll } from '../lib/fetchAll'
import { useAuth } from './useAuth'

const REALTIME_ENABLED = true

const LOGS_RANGE_KEY = (userId, from, to) => ['task_logs', userId, from, to]

/**
 * Récupère les task_logs sur une plage [fromKey, toKey] (inclusif).
 * Réutilisé par la vue Aujourd'hui (from=to=today) et par Historique.
 *
 * Realtime : rafraîchit toute la plage quand un log user change.
 */
export function useTaskLogs(fromKey, toKey) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: LOGS_RANGE_KEY(user?.id, fromKey, toKey),
    enabled: !!user && !!fromKey && !!toKey,
    queryFn: () =>
      // Par tranches : au-delà de 1000 lignes, une requête simple renvoie un
      // échantillon et non la plage demandée.
      fetchAll(
        () => supabase
          .from(PLANNING_TABLES.taskLogs)
          .select('*')
          .eq('user_id', user.id)
          .gte('log_date', fromKey)
          .lte('log_date', toKey),
        { ordre: { colonne: 'log_date' } }
      ),
  })

  useEffect(() => {
    if (!REALTIME_ENABLED || !user) return
    return abonnerPartage(`task-logs-${user.id}`, PLANNING_TABLES.taskLogs, user.id, () => {
      // Pendant qu'une écriture est en vol, un rechargement renverrait
      // l'état d'AVANT cette écriture et effacerait la case qu'on vient de
      // cocher. La mutation invalide déjà tout une fois arrivée : on la
      // laisse faire.
      if (queryClient.isMutating() > 0) return
      queryClient.invalidateQueries({ queryKey: ['task_logs', user.id] })
    })
  }, [user, queryClient])

  /**
   * Upsert d'un log pour (task_id, log_date). Sert au toggle "coché".
   * target_value est optionnel : rempli pour les tâches progressives.
   */
  const upsertLog = useMutation({
    mutationFn: async ({ task_id, log_date, done, target_value }) => {
      const payload = {
        user_id: user.id,
        task_id,
        log_date,
        done: !!done,
        target_value: target_value ?? null,
      }
      const { data, error } = await supabase
        .from(PLANNING_TABLES.taskLogs)
        .upsert(payload, { onConflict: 'user_id,task_id,log_date' })
        .select()
        .single()
      if (error) throw error
      return data
    },
    // Mise à jour optimiste : la case cochée réagit instantanément.
    onMutate: async (vars) => {
      const key = LOGS_RANGE_KEY(user?.id, fromKey, toKey)
      // Toutes les plages, pas seulement la nôtre : une autre vue monte le
      // même hook sur une fenêtre différente, et son rechargement en cours
      // rapporterait l'état d'avant l'écriture.
      await queryClient.cancelQueries({ queryKey: ['task_logs', user?.id] })
      const previous = queryClient.getQueryData(key)
      queryClient.setQueryData(key, (old = []) => {
        const others = old.filter((l) => !(l.task_id === vars.task_id && l.log_date === vars.log_date))
        return [
          ...others,
          {
            id: `optimistic-${vars.task_id}-${vars.log_date}`,
            user_id: user.id,
            task_id: vars.task_id,
            log_date: vars.log_date,
            done: !!vars.done,
            target_value: vars.target_value ?? null,
          },
        ]
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(LOGS_RANGE_KEY(user?.id, fromKey, toKey), ctx.previous)
    },
    onSettled: () => {
      // Toutes les plages : la sync Objectifs lit une fenêtre annuelle
      // distincte de celle de la vue Aujourd'hui. Sans ça elle ne se
      // rafraîchissait qu'au focus ou via Realtime.
      queryClient.invalidateQueries({ queryKey: ['task_logs', user?.id] })
    },
  })

  /**
   * Pose une occurrence SI elle manque, sans jamais toucher à une qui
   * existe. Le rattrapage des tâches orphelines passe par ici : un upsert
   * y écrirait `done: false` et décocherait une tâche déjà faite.
   */
  const insertLogIfMissing = useMutation({
    mutationFn: async ({ task_id, log_date }) => {
      const { data, error } = await supabase
        .from(PLANNING_TABLES.taskLogs)
        .upsert(
          { user_id: user.id, task_id, log_date, done: false, target_value: null },
          { onConflict: 'user_id,task_id,log_date', ignoreDuplicates: true }
        )
        .select()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task_logs', user?.id] })
    },
  })

  /**
   * Reporte une occurrence de tâche ponctuelle à une autre date :
   * on met à jour `log_date` sur la ligne existante. La contrainte
   * unique (user_id, task_id, log_date) fait qu'on refuse si une
   * occurrence existe déjà à cette date — on prévient l'appelant.
   */
  const postponeLog = useMutation({
    mutationFn: async ({ logId, newDate }) => {
      const { data, error } = await supabase
        .from(PLANNING_TABLES.taskLogs)
        .update({ log_date: newDate, done: false })
        .eq('id', logId)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task_logs', user?.id] })
    },
  })

  return {
    logs: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    upsertLog,
    insertLogIfMissing,
    postponeLog,
  }
}
