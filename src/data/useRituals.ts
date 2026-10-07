import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { INVALIDATE_ON_LOG } from './keys'

export interface CloseDayInput {
  day: string
  energy?: number | null
  mood?: number | null
  reason?: string | null
  /** { axis_key: minutes } */
  minutes?: Record<string, number>
  /** { task_id: 'missed' | 'skipped' | 'postponed:YYYY-MM-DD' } */
  decisions?: Record<string, string>
}

/**
 * La clôture du soir.
 *
 * Rien ne traverse la nuit sans décision : toute tâche encore ouverte
 * après l'arbitrage est comptée comme ratée, côté serveur. C'est ce qui
 * sépare un journal d'un système — et c'est le changement le plus
 * important par rapport à l'ancien bilan, qui ne demandait qu'une
 * raison en texte libre.
 */
export function useCloseDay(userId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: CloseDayInput) => {
      const { data, error } = await supabase.rpc('close_day', {
        p_day: v.day,
        p_energy: v.energy ?? null,
        p_mood: v.mood ?? null,
        p_reason: v.reason ?? null,
        p_minutes: v.minutes ?? {},
        p_decisions: v.decisions ?? {},
      })
      if (error) throw error
      return data as { decided: number; auto_missed: number }
    },
    onSuccess: (_d, v) => {
      for (const key of INVALIDATE_ON_LOG(userId)) qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: ['day_state', userId, v.day] })
    },
  })
}

/** Amorçage : axes, objectifs, marchés, enveloppes, grille de frais, rappels. */
export function useBootstrap() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('bootstrap_full')
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ predicate: () => true }),
  })
}

/** Reprise des données de budget-app restées dans le navigateur. */
export function useImportLegacyJson() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: unknown) => {
      const { data, error } = await supabase.rpc('import_legacy_json', { payload })
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ predicate: () => true }),
  })
}
