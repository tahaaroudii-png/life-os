import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from './keys'
import type {
  Campaign, CplCap, DailyAd, Product, ProductKpiRow, StockAlertRow, VerdictRow,
} from '@/db/types'

export function useProducts(userId?: string) {
  return useQuery({
    queryKey: qk.products(userId),
    enabled: !!userId,
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from('products').select('*').eq('active', true).order('name')
      if (error) throw error
      return data as Product[]
    },
  })
}

export function useCampaigns(userId?: string) {
  return useQuery({
    queryKey: qk.campaigns(userId),
    enabled: !!userId,
    queryFn: async (): Promise<Campaign[]> => {
      const { data, error } = await supabase
        .from('campaigns').select('*').eq('status', 'active').order('name')
      if (error) throw error
      return data as Campaign[]
    },
  })
}

/** Les KPI d'une fenêtre. 7 jours par défaut : c'est la fenêtre de décision. */
export function useProductKpis(userId: string | undefined, days = 7) {
  return useQuery({
    queryKey: qk.kpis(userId, days),
    enabled: !!userId,
    queryFn: async (): Promise<ProductKpiRow[]> => {
      const { data, error } = await supabase
        .from('v_product_kpis').select('*').eq('days', days)
      if (error) throw error
      return data as ProductKpiRow[]
    },
  })
}

export function useVerdicts(userId?: string) {
  return useQuery({
    queryKey: qk.verdicts(userId),
    enabled: !!userId,
    queryFn: async (): Promise<VerdictRow[]> => {
      const { data, error } = await supabase.from('v_product_verdicts').select('*')
      if (error) throw error
      return data as VerdictRow[]
    },
  })
}

export function useStockAlerts(userId?: string) {
  return useQuery({
    queryKey: qk.stockAlerts(userId),
    enabled: !!userId,
    queryFn: async (): Promise<StockAlertRow[]> => {
      const { data, error } = await supabase.from('v_stock_alerts').select('*')
      if (error) throw error
      return data as StockAlertRow[]
    },
  })
}

/**
 * Le plafond CPL d'un produit, calculé en base avec la grille de frais
 * en vigueur à la date. Au-dessus, chaque lead acheté coûte de l'argent.
 */
export function useCplCap(productId: string | undefined, conf: number, deliv: number) {
  return useQuery({
    queryKey: ['cpl_cap', productId, conf, deliv],
    enabled: !!productId,
    queryFn: async (): Promise<CplCap | null> => {
      const { data, error } = await supabase.rpc('f_cpl_cap', {
        p_product: productId, p_variant: 'single', p_conf: conf, p_deliv: deliv,
      })
      if (error) throw error
      return (data?.[0] as CplCap) ?? null
    },
  })
}

/** La saisie du soir : dépense et leads, rien d'autre. */
export function useDailyAds(userId: string | undefined, day: string) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: qk.dailyAds(userId, day),
    enabled: !!userId,
    queryFn: async (): Promise<DailyAd[]> => {
      const { data, error } = await supabase.from('daily_ads').select('*').eq('day', day)
      if (error) throw error
      return data as DailyAd[]
    },
  })

  const save = useMutation({
    mutationFn: async (rows: Array<{ campaign_id: string; spend_usd: number; leads: number }>) => {
      const payload = rows.map((r) => ({ user_id: userId, day, ...r }))
      const { error } = await supabase
        .from('daily_ads').upsert(payload, { onConflict: 'user_id,day,campaign_id' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.dailyAds(userId, day) })
      qc.invalidateQueries({ queryKey: ['product_kpis', userId] })
      qc.invalidateQueries({ queryKey: qk.verdicts(userId) })
      qc.invalidateQueries({ queryKey: qk.advice(userId) })
    },
  })

  return { ads: query.data ?? [], isLoading: query.isLoading, save }
}

/** Le net d'une période : revenus des relevés moins pub et frais. */
export function useNetPeriod(userId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: qk.netPeriod(userId, from, to),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('f_net_period', {
        p_user: userId, p_from: from, p_to: to,
      })
      if (error) throw error
      return (data?.[0] ?? { revenue: 0, ad_spend: 0, fees: 0, net: 0 }) as {
        revenue: number; ad_spend: number; fees: number; net: number
      }
    },
  })
}

/** Un mouvement de stock. La quantité suit par trigger — jamais à la main. */
export function useStockMovement(userId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { product_id: string; market_key: string; delta: number; reason: string; note?: string }) => {
      const { error } = await supabase.from('stock_movements').insert({ user_id: userId, ...v })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.stockAlerts(userId) })
      qc.invalidateQueries({ queryKey: qk.stockCoverage(userId) })
    },
  })
}
