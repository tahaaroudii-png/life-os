import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from './keys'
import type { DayState } from '@/db/types'

export function useDayState(userId: string | undefined, day: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: qk.dayState(userId, day),
    enabled: !!userId,
    queryFn: async (): Promise<DayState | null> => {
      const { data, error } = await supabase
        .from('day_states').select('*').eq('day', day).maybeSingle()
      if (error) throw error
      return (data as DayState) ?? null
    },
  })

  const save = useMutation({
    mutationFn: async (patch: Partial<DayState>) => {
      const { data, error } = await supabase
        .from('day_states')
        .upsert({ user_id: userId, day, ...patch }, { onConflict: 'user_id,day' })
        .select().single()
      if (error) throw error
      return data as DayState
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.dayState(userId, day) }),
  })

  return { dayState: query.data ?? null, isLoading: query.isLoading, save }
}
