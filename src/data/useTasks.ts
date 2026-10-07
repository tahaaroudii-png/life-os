import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from './keys'
import { parseCadence } from '@/domain/cadence'
import type { Task } from '@/db/types'

export function useTasks(userId?: string) {
  return useQuery({
    queryKey: qk.tasks(userId),
    enabled: !!userId,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from('tasks').select('*').eq('active', true).order('created_at')
      if (error) throw error
      // La cadence arrive en jsonb : on la passe par le garde-fou une fois
      // ici, pour que plus aucun écran n'ait à se méfier de sa forme.
      return (data ?? []).map((t) => ({ ...t, cadence: parseCadence(t.cadence) })) as Task[]
    },
  })
}
