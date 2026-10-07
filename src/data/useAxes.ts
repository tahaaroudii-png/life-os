import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from './keys'
import type { Axis } from '@/db/types'

export function useAxes(userId?: string) {
  return useQuery({
    queryKey: qk.axes(userId),
    enabled: !!userId,
    staleTime: 5 * 60_000,       // les axes ne bougent presque jamais
    queryFn: async (): Promise<Axis[]> => {
      const { data, error } = await supabase
        .from('axes').select('*').eq('active', true).order('position')
      if (error) throw error
      return data as Axis[]
    },
  })
}
