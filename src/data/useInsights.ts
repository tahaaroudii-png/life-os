import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from './keys'
import type { AdviceRow, FocusRow, Insight } from '@/db/types'

/**
 * Le conseil unique du jour, choisi par rang côté serveur.
 * Un seul : l'app dit quoi faire, elle ne déverse pas une liste.
 */
export function useAdvice(userId?: string) {
  return useQuery({
    queryKey: qk.advice(userId),
    enabled: !!userId,
    queryFn: async (): Promise<AdviceRow | null> => {
      const { data, error } = await supabase.from('v_advice').select('*').maybeSingle()
      if (error) throw error
      return (data as AdviceRow) ?? null
    },
  })
}

/** Les trois actions qui redressent le plus les objectifs en dérive. */
export function useTodayFocus(userId?: string) {
  return useQuery({
    queryKey: qk.focus(userId),
    enabled: !!userId,
    queryFn: async (): Promise<FocusRow[]> => {
      const { data, error } = await supabase
        .from('v_today_focus').select('*').lte('rank', 3).order('rank')
      if (error) throw error
      return data as FocusRow[]
    },
  })
}

export function useInsights(userId?: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: qk.insights(userId),
    enabled: !!userId,
    queryFn: async (): Promise<Insight[]> => {
      const { data, error } = await supabase
        .from('insights').select('*').order('computed_on', { ascending: false }).limit(50)
      if (error) throw error
      return data as Insight[]
    },
  })

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('insights')
        .update({ dismissed_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.insights(userId) })
      qc.invalidateQueries({ queryKey: qk.advice(userId) })
    },
  })

  /** Le calcul tourne normalement la nuit ; ce bouton sert à le forcer. */
  const recompute = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('compute_insights')
      if (error) throw error
      return data as number
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.insights(userId) }),
  })

  return { insights: query.data ?? [], isLoading: query.isLoading, dismiss, recompute }
}
