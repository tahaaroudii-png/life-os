import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

const TABLE = 'daily_reviews'

const REVIEW_KEY = (userId, date) => ['daily_review', userId, date]
const REVIEWS_RANGE_KEY = (userId, from, to) => ['daily_reviews', userId, from, to]

/**
 * Bilan quotidien : lecture d'un jour précis + mutation upsert.
 * Table optionnelle — si la migration n'a pas été appliquée, on avale
 * l'erreur 42P01 (table inexistante) et on renvoie null au lieu de casser
 * la page (l'app doit continuer à marcher pendant la migration).
 */
export function useDailyReview(dateKey) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: REVIEW_KEY(user?.id, dateKey),
    enabled: !!user && !!dateKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('user_id', user.id)
        .eq('review_date', dateKey)
        .maybeSingle()
      if (error) {
        // 42P01 = table inexistante — migration pas encore passée
        if (error.code === '42P01') return null
        throw error
      }
      return data
    },
    retry: false,
  })

  const upsertReview = useMutation({
    mutationFn: async ({ reason, incompleteCount, totalCount }) => {
      const payload = {
        user_id: user.id,
        review_date: dateKey,
        reason: reason || null,
        incomplete_count: incompleteCount ?? null,
        total_count: totalCount ?? null,
      }
      const { data, error } = await supabase
        .from(TABLE)
        .upsert(payload, { onConflict: 'user_id,review_date' })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(REVIEW_KEY(user?.id, dateKey), data)
      queryClient.invalidateQueries({ queryKey: ['daily_reviews', user?.id] })
    },
  })

  return {
    review: query.data,
    isLoading: query.isLoading,
    upsertReview,
  }
}

/**
 * Lecture d'un intervalle de bilans (pour l'analyse historique des causes).
 */
export function useDailyReviewsRange(fromKey, toKey) {
  const { user } = useAuth()

  const query = useQuery({
    queryKey: REVIEWS_RANGE_KEY(user?.id, fromKey, toKey),
    enabled: !!user && !!fromKey && !!toKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('user_id', user.id)
        .gte('review_date', fromKey)
        .lte('review_date', toKey)
        .order('review_date', { ascending: false })
      if (error) {
        if (error.code === '42P01') return []
        throw error
      }
      return data
    },
    retry: false,
  })

  return { reviews: query.data || [], isLoading: query.isLoading }
}
