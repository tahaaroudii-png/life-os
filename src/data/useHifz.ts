import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from './keys'
import type { HifzDueRow, HifzSummary } from '@/db/types'

export function useHifz(userId?: string) {
  const qc = useQueryClient()

  const summary = useQuery({
    queryKey: qk.hifzSummary(userId),
    enabled: !!userId,
    queryFn: async (): Promise<HifzSummary> => {
      const { data, error } = await supabase.from('v_hifz_summary').select('*').maybeSingle()
      if (error) throw error
      return (data as HifzSummary) ?? { hizb_memorised: 0, verses_new: 0, verses_reviewed: 0, due_count: 0 }
    },
  })

  const due = useQuery({
    queryKey: qk.hifzDue(userId),
    enabled: !!userId,
    queryFn: async (): Promise<HifzDueRow[]> => {
      const { data, error } = await supabase
        .from('v_hifz_due').select('*').order('days_overdue', { ascending: false })
      if (error) throw error
      return data as HifzDueRow[]
    },
  })

  /**
   * Une session. Le serveur décide du prochain intervalle de révision :
   * il double sur une bonne restitution, retombe à 3 jours sur une mauvaise.
   * 1 800 versets mémorisés sans plan de révision, ce sont 1 800 versets
   * perdus — c'est pour ça que `mode` est obligatoire.
   */
  const record = useMutation({
    mutationFn: async (v: { mode: 'new' | 'review' | 'consolidation'; hizb: number; verses: number; quality?: number }) => {
      const { data, error } = await supabase.rpc('record_hifz', {
        p_mode: v.mode, p_hizb: v.hizb, p_verses: v.verses, p_quality: v.quality ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.hifzSummary(userId) })
      qc.invalidateQueries({ queryKey: qk.hifzDue(userId) })
      qc.invalidateQueries({ queryKey: qk.goalProgress(userId) })
    },
  })

  return {
    summary: summary.data,
    due: due.data ?? [],
    isLoading: summary.isLoading,
    record,
  }
}
