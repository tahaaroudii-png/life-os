import { supabase } from './supabaseClient'
import { TABLES } from './schema'
import { listQueued, removeQueued, markRejected } from './offlineQueue'

/**
 * Tente d'envoyer toutes les transactions en attente vers Supabase.
 * Retourne { synced, failed, rejected } (nombre d'éléments) : `failed`
 * sera réessayé, `rejected` a été écarté parce que le serveur l'a refusé.
 */
export async function syncQueuedTransactions() {
  const queued = await listQueued()
  let synced = 0
  let failed = 0
  let rejected = 0

  for (const item of queued) {
    const { error } = await supabase.from(TABLES.transactions).insert(item.payload)
    if (error) {
      // Le serveur a répondu et refusé (contrainte, RLS, colonne inconnue) :
      // le même envoi sera refusé demain. On sort l'élément de la file au
      // lieu de le réessayer à chaque démarrage, en le conservant pour
      // qu'il reste examinable. Sans code d'erreur, c'est le réseau : on
      // garde et on réessaiera.
      if (error.code) {
        await markRejected(item, error.message)
        rejected++
      } else {
        failed++
      }
      console.warn('Dépense en attente non synchronisée :', error.message)
      continue
    }
    await removeQueued(item.localId)
    synced++
  }

  return { synced, failed, rejected }
}
