import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from './keys'
import type { CashForecastRow, CashPositionRow, EnvelopeState, Transaction } from '@/db/types'

export function useEnvelopes(userId?: string) {
  return useQuery({
    queryKey: qk.envelopes(userId),
    enabled: !!userId,
    queryFn: async (): Promise<EnvelopeState[]> => {
      const { data, error } = await supabase
        .from('v_envelope_states').select('*').order('position')
      if (error) throw error
      return data as EnvelopeState[]
    },
  })
}

export function useAccounts(userId?: string) {
  return useQuery({
    queryKey: qk.accounts(userId),
    enabled: !!userId,
    queryFn: async (): Promise<CashPositionRow[]> => {
      const { data, error } = await supabase.from('v_cash_position').select('*')
      if (error) throw error
      return data as CashPositionRow[]
    },
  })
}

/**
 * Le plan de trésorerie à 13 semaines.
 *
 * C'est le chiffre qui doit empêcher de scaler un produit rentable avec
 * de l'argent qui n'est pas encore encaissé — et qui remplace la case
 * « capital publicitaire » cochée à la main.
 */
export function useCashForecast(userId?: string) {
  return useQuery({
    queryKey: qk.forecast(userId),
    enabled: !!userId,
    queryFn: async (): Promise<CashForecastRow[]> => {
      const { data, error } = await supabase.rpc('f_cash_forecast', { p_user: userId, p_weeks: 13 })
      if (error) throw error
      return data as CashForecastRow[]
    },
  })
}

export function useTransactions(userId: string | undefined, from: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: qk.transactions(userId, from),
    enabled: !!userId,
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await supabase
        .from('transactions').select('*').gte('occurred_on', from).order('occurred_on', { ascending: false })
      if (error) throw error
      return data as Transaction[]
    },
  })

  const add = useMutation({
    mutationFn: async (v: Partial<Transaction>) => {
      const { error } = await supabase.from('transactions').insert({ user_id: userId, ...v })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions', userId] })
      qc.invalidateQueries({ queryKey: qk.envelopes(userId) })
      qc.invalidateQueries({ queryKey: qk.accounts(userId) })
      qc.invalidateQueries({ queryKey: qk.forecast(userId) })
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions', userId] })
      qc.invalidateQueries({ queryKey: qk.envelopes(userId) })
    },
  })

  return { transactions: query.data ?? [], isLoading: query.isLoading, add, remove }
}
