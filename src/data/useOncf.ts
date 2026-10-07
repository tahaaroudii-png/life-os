import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from './keys'
import type { ModificationEvent, ModificationRow, ModifStage } from '@/db/types'

export function useModifications(userId?: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: qk.modifications(userId),
    enabled: !!userId,
    queryFn: async (): Promise<ModificationRow[]> => {
      const { data, error } = await supabase
        .from('v_modifications').select('*').order('due_on', { nullsFirst: false })
      if (error) throw error
      return data as ModificationRow[]
    },
  })

  /**
   * Changer d'étape écrit AUSSI une ligne de journal. Un avancement sans
   * trace datée, c'est ce qui rend un dossier impossible à reconstituer
   * trois mois plus tard.
   */
  const setStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: ModifStage }) => {
      const { error } = await supabase.from('modifications')
        .update({ stage, closed_on: stage === 'cloture' ? new Date().toISOString().slice(0, 10) : null })
        .eq('id', id)
      if (error) throw error
      const { error: e2 } = await supabase.from('modification_events').insert({
        user_id: userId, modification_id: id, kind: 'stage_change', body: `Passage en ${stage}`,
      })
      if (e2) throw e2
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.modifications(userId) }),
  })

  const create = useMutation({
    mutationFn: async (v: { title: string; engine?: string; priority?: string; due_on?: string | null }) => {
      const { error } = await supabase.from('modifications').insert({ user_id: userId, ...v })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.modifications(userId) }),
  })

  return { modifications: query.data ?? [], isLoading: query.isLoading, setStage, create }
}

export function useModificationEvents(userId: string | undefined, modificationId?: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: qk.modifEvents(modificationId ?? ''),
    enabled: !!modificationId,
    queryFn: async (): Promise<ModificationEvent[]> => {
      const { data, error } = await supabase
        .from('modification_events').select('*')
        .eq('modification_id', modificationId)
        .order('happened_on', { ascending: false })
      if (error) throw error
      return data as ModificationEvent[]
    },
  })

  const add = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.from('modification_events').insert({
        user_id: userId, modification_id: modificationId, kind: 'note', body,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.modifEvents(modificationId ?? '') })
      qc.invalidateQueries({ queryKey: qk.modifications(userId) })
    },
  })

  return { events: query.data ?? [], add }
}
