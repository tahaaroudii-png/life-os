import { supabase } from './supabaseClient'
import { TABLES } from './schema'
import { listQueued, removeQueued } from './offlineQueue'

/**
 * Tente d'envoyer toutes les transactions en attente vers Supabase.
 * Retourne { synced, failed } (nombre d'éléments).
 */
export async function syncQueuedTransactions() {
  const queued = await listQueued()
  let synced = 0
  let failed = 0

  for (const item of queued) {
    const { error } = await supabase.from(TABLES.transactions).insert(item.payload)
    if (error) {
      // Erreur de contrainte / RLS etc. : on n'enterre pas l'item indéfiniment côté
      // silencieux, mais on arrête là pour ne pas spammer si c'est un souci réseau
      // qui touche tous les items restants.
      failed++
      console.warn('Échec de synchronisation d’une dépense en attente :', error.message)
      continue
    }
    await removeQueued(item.localId)
    synced++
  }

  return { synced, failed }
}
