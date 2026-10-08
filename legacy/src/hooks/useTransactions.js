import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { TABLES, TX_COLS } from '../lib/schema'
import { useAuth } from './useAuth'
import { enqueueTransaction } from '../lib/offlineQueue'
import { syncQueuedTransactions } from '../lib/sync'
import { useOnlineStatus } from './useOnlineStatus'

const TX_QUERY_KEY = (userId) => ['transactions', userId]

// Coupure volontaire et temporaire : le abonnement Realtime est désactivé le temps
// de stabiliser le reste (l'app doit s'afficher et permettre la saisie sans lui).
// Pour le réactiver plus tard, repasser ce flag à true — voir aussi le bloc
// try/catch ci-dessous, déjà conçu pour ne jamais bloquer le rendu même en cas
// d'erreur Realtime.
const REALTIME_ENABLED = false

export function useTransactions() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const online = useOnlineStatus()

  const query = useQuery({
    queryKey: TX_QUERY_KEY(user?.id),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLES.transactions)
        .select('*')
        .eq('user_id', user.id)
        .order(TX_COLS.occurredAt, { ascending: false })
      if (error) throw error
      return data
    },
  })

  // Abonnement Realtime : toute modification (autre appareil, autre onglet, sync
  // hors-ligne) rafraîchit automatiquement la liste.
  //
  // Non bloquant par design : Realtime est un confort (mise à jour auto), pas une
  // dépendance critique — l'app doit rester utilisable (lecture/écriture via
  // React Query) même si l'abonnement échoue ou si le navigateur/réseau bloque les
  // WebSockets. Un nom de canal unique par montage évite aussi le conflit
  // "cannot add postgres_changes callbacks…" qui survient si un canal du même nom
  // est réutilisé alors qu'il est déjà en cours de join (ex. double effet en
  // React StrictMode, ou remount rapide).
  useEffect(() => {
    if (!REALTIME_ENABLED || !user) return
    let channel
    try {
      channel = supabase
        .channel(`transactions-${user.id}-${crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: TABLES.transactions, filter: `user_id=eq.${user.id}` },
          () => {
            queryClient.invalidateQueries({ queryKey: TX_QUERY_KEY(user.id) })
          }
        )
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || err) {
            console.warn('Realtime indisponible (non bloquant) :', err?.message || status)
          }
        })
    } catch (err) {
      console.warn('Realtime : échec de l’abonnement (non bloquant) :', err?.message || err)
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel)
        } catch {
          // noop : le nettoyage ne doit jamais faire planter l'app
        }
      }
    }
  }, [user, queryClient])

  // Sync auto de la file hors-ligne dès qu'on repasse en ligne (et au montage si déjà en ligne).
  useEffect(() => {
    if (!user || !online) return
    syncQueuedTransactions().then(({ synced }) => {
      if (synced > 0) {
        queryClient.invalidateQueries({ queryKey: TX_QUERY_KEY(user.id) })
      }
    })
  }, [user, online, queryClient])

  const addTransaction = useMutation({
    mutationFn: async ({ amount, envelope, note }) => {
      const payload = {
        id: crypto.randomUUID(),
        user_id: user.id,
        amount,
        envelope,
        note: note || null,
        [TX_COLS.occurredAt]: new Date().toISOString(),
      }

      if (!navigator.onLine) {
        await enqueueTransaction(payload)
        return { queued: true, payload }
      }

      const { error } = await supabase.from(TABLES.transactions).insert(payload)
      if (error) {
        // Le insert a échoué pour une raison possiblement réseau : on met en file
        // plutôt que de perdre la saisie.
        await enqueueTransaction(payload)
        return { queued: true, payload, error }
      }
      return { queued: false, payload }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TX_QUERY_KEY(user.id) })
    },
  })

  const updateTransaction = useMutation({
    mutationFn: async ({ id, ...patch }) => {
      const { error } = await supabase.from(TABLES.transactions).update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TX_QUERY_KEY(user.id) })
    },
  })

  const deleteTransaction = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from(TABLES.transactions).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TX_QUERY_KEY(user.id) })
    },
  })

  return {
    transactions: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  }
}
