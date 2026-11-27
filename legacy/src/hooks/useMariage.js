import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

const CRITERIA_KEY = (userId) => ['marriage_criteria', userId]
const CANDIDATES_KEY = (userId) => ['marriage_candidates', userId]
const SCORES_KEY = (userId) => ['marriage_scores', userId]

/**
 * Les critères sont rarement modifiés : on les lit une fois et on les garde.
 * Les changer est une décision en soi, qui se prend à froid, pas en comparant
 * deux candidates — sinon le cadre se plie à ce qu'on espère trouver.
 */
export function useMarriageCriteria() {
  const { user } = useAuth()

  const query = useQuery({
    queryKey: CRITERIA_KEY(user?.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marriage_criteria')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data
    },
  })

  return { criteria: query.data || [], isLoading: query.isLoading, error: query.error }
}

export function useMarriageCandidates() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: CANDIDATES_KEY(user?.id),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marriage_candidates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
  })

  const create = useMutation({
    mutationFn: async ({ name }) => {
      const { data, error } = await supabase
        .from('marriage_candidates')
        .insert({ id: crypto.randomUUID(), user_id: user.id, name })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CANDIDATES_KEY(user?.id) }),
  })

  const update = useMutation({
    mutationFn: async ({ id, ...patch }) => {
      const { data, error } = await supabase
        .from('marriage_candidates')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CANDIDATES_KEY(user?.id) }),
  })

  const remove = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('marriage_candidates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CANDIDATES_KEY(user?.id) })
      queryClient.invalidateQueries({ queryKey: SCORES_KEY(user?.id) })
    },
  })

  return {
    candidates: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    create,
    update,
    remove,
  }
}

/**
 * Toutes les notes de toutes les candidates en une requête : la liste reste
 * petite (quelques candidates × 17 critères) et l'écran de comparaison a
 * besoin de tout en même temps.
 */
export function useMarriageScores() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: SCORES_KEY(user?.id),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marriage_scores')
        .select('*')
        .eq('user_id', user.id)
      if (error) throw error
      return data
    },
  })

  /**
   * Un upsert sur (candidate_id, criterion_id) : cocher deux fois le même
   * critère corrige la note au lieu d'empiler des lignes.
   *
   * L'écriture est optimiste — cocher 17 critères à la suite doit répondre
   * tout de suite, sinon on coche à l'aveugle en attendant le réseau.
   */
  const setScore = useMutation({
    mutationFn: async ({ candidateId, criterionId, passed = null, score = null }) => {
      const { data, error } = await supabase
        .from('marriage_scores')
        .upsert(
          {
            user_id: user.id,
            candidate_id: candidateId,
            criterion_id: criterionId,
            passed,
            score,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'candidate_id,criterion_id' }
        )
        .select()
        .single()
      if (error) throw error
      return data
    },
    onMutate: async ({ candidateId, criterionId, passed = null, score = null }) => {
      const key = SCORES_KEY(user?.id)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData(key)
      queryClient.setQueryData(key, (old = []) => {
        const idx = old.findIndex(
          (s) => s.candidate_id === candidateId && s.criterion_id === criterionId
        )
        const row = { candidate_id: candidateId, criterion_id: criterionId, passed, score }
        if (idx === -1) return [...old, { id: crypto.randomUUID(), ...row }]
        const next = [...old]
        next[idx] = { ...next[idx], ...row }
        return next
      })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(SCORES_KEY(user?.id), ctx.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: SCORES_KEY(user?.id) }),
  })

  return { scores: query.data || [], isLoading: query.isLoading, setScore }
}
