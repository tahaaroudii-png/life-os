import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { ONCF_TABLES } from '../lib/oncf'
import { useAuth } from './useAuth'

const REALTIME_ENABLED = true

const MODIFS_KEY = (userId) => ['modifications', userId]
const HISTORY_KEY = (userId, modifId) => ['modification_history', userId, modifId]

export function useModifications() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: MODIFS_KEY(user?.id),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(ONCF_TABLES.modifications)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
  })

  // Realtime NON bloquant (mêmes garde-fous que les autres modules).
  useEffect(() => {
    if (!REALTIME_ENABLED || !user) return
    let channel
    try {
      channel = supabase
        .channel(`modifications-${user.id}-${crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: ONCF_TABLES.modifications, filter: `user_id=eq.${user.id}` },
          () => queryClient.invalidateQueries({ queryKey: MODIFS_KEY(user.id) })
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: ONCF_TABLES.history, filter: `user_id=eq.${user.id}` },
          () => {
            // On invalide toutes les histories de cet user en une passe.
            queryClient.invalidateQueries({ queryKey: ['modification_history', user.id] })
          }
        )
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || err) {
            console.warn('Realtime modifications indisponible (non bloquant) :', err?.message || status)
          }
        })
    } catch (err) {
      console.warn('Realtime modifications : abonnement KO (non bloquant) :', err?.message || err)
    }
    return () => {
      if (channel) {
        try { supabase.removeChannel(channel) } catch { /* noop */ }
      }
    }
  }, [user, queryClient])

  const createModif = useMutation({
    mutationFn: async (payload) => {
      const row = {
        id: crypto.randomUUID(),
        user_id: user.id,
        title: payload.title,
        equipment: payload.equipment ?? null,
        stage: payload.stage || 'identifie',
        priority: payload.priority || 'moyenne',
        due_date: payload.due_date ?? null,
        next_action: payload.next_action ?? null,
        notes: payload.notes ?? null,
      }
      const { data, error } = await supabase
        .from(ONCF_TABLES.modifications)
        .insert(row)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MODIFS_KEY(user?.id) }),
  })

  const updateModif = useMutation({
    // Update optimiste : le drag & drop du Kanban est instantané (sinon la carte
    // "revient" une seconde avant que Supabase confirme).
    mutationFn: async ({ id, ...patch }) => {
      const { data, error } = await supabase
        .from(ONCF_TABLES.modifications)
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onMutate: async ({ id, ...patch }) => {
      const key = MODIFS_KEY(user?.id)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData(key)
      queryClient.setQueryData(key, (old = []) =>
        old.map((m) => (m.id === id ? { ...m, ...patch } : m))
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(MODIFS_KEY(user?.id), ctx.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: MODIFS_KEY(user?.id) }),
  })

  const deleteModif = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from(ONCF_TABLES.modifications).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MODIFS_KEY(user?.id) }),
  })

  return {
    modifications: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    createModif,
    updateModif,
    deleteModif,
  }
}

export function useModificationHistory(modifId) {
  const { user } = useAuth()

  const query = useQuery({
    queryKey: HISTORY_KEY(user?.id, modifId),
    enabled: !!user && !!modifId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(ONCF_TABLES.history)
        .select('*')
        .eq('user_id', user.id)
        .eq('modification_id', modifId)
        .order('changed_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  return {
    history: query.data || [],
    isLoading: query.isLoading,
  }
}
