import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { TABLES } from '../lib/schema'
import { useAuth } from './useAuth'

export function useSettings() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['settings', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLES.settings)
        .select('*')
        .eq('user_id', user.id)
        .single()
      if (error) throw error
      return data
    },
  })

  const updateSettings = useMutation({
    mutationFn: async (patch) => {
      const { data, error } = await supabase
        .from(TABLES.settings)
        .update(patch)
        .eq('user_id', user.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      // On met la nouvelle valeur EN cache puis on invalide pour forcer le
      // recalcul de toutes les vues qui dépendent des settings (Home rings,
      // Dashboard graphs, fond d'urgence…). Sans invalidateQueries, certains
      // consumers gardent la valeur stale.
      queryClient.setQueryData(['settings', user?.id], data)
      queryClient.invalidateQueries({ queryKey: ['settings', user?.id] })
    },
  })

  return {
    settings: query.data,
    isLoading: query.isLoading,
    error: query.error,
    updateSettings,
  }
}
