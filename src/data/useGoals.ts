import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from './keys'
import type { Goal, GoalProgressRow, GoalTaskLink, StreakRow } from '@/db/types'

/** Les objectifs bruts — pour les écrans de réglage. */
export function useGoals(userId?: string) {
  return useQuery({
    queryKey: qk.goals(userId),
    enabled: !!userId,
    queryFn: async (): Promise<Goal[]> => {
      const { data, error } = await supabase.from('goals').select('*').order('position')
      if (error) throw error
      return data as Goal[]
    },
  })
}

/**
 * La progression, telle que la base la calcule.
 *
 * Rien n'est recalculé ici : c'est tout l'intérêt du changement. Le
 * téléphone et le portable lisent la même vue, donc affichent le même
 * nombre à la même seconde. Les fonctions de src/domain/progress.ts
 * servent à l'affichage optimiste et aux tests, pas à produire ce chiffre.
 */
export function useGoalProgress(userId?: string) {
  return useQuery({
    queryKey: qk.goalProgress(userId),
    enabled: !!userId,
    queryFn: async (): Promise<GoalProgressRow[]> => {
      const { data, error } = await supabase
        .from('v_goal_progress').select('*').order('position')
      if (error) throw error
      return data as GoalProgressRow[]
    },
  })
}

export function useStreaks(userId?: string) {
  return useQuery({
    queryKey: qk.streaks(userId),
    enabled: !!userId,
    queryFn: async (): Promise<StreakRow[]> => {
      const { data, error } = await supabase.from('v_task_streaks').select('*')
      if (error) throw error
      return data as StreakRow[]
    },
  })
}

export function useGoalTaskLinks(userId?: string) {
  return useQuery({
    queryKey: qk.links(userId),
    enabled: !!userId,
    queryFn: async (): Promise<GoalTaskLink[]> => {
      const { data, error } = await supabase.from('goal_task_links').select('*')
      if (error) throw error
      return data as GoalTaskLink[]
    },
  })
}
