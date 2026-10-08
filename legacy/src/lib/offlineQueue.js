import { openDB } from 'idb'

const DB_NAME = 'budget-offline'
const STORE = 'pending-transactions'

let dbPromise = null
function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'localId' })
        }
      },
    })
  }
  return dbPromise
}

/**
 * Ajoute une dépense à la file hors-ligne. `payload` doit déjà contenir toutes
 * les colonnes nécessaires à l'insert Supabase (id, user_id, amount, envelope,
 * note, occurred_at).
 */
export async function enqueueTransaction(payload) {
  const db = await getDB()
  const localId = payload.id // on réutilise l'uuid généré côté client comme clé locale
  await db.put(STORE, { localId, payload, queuedAt: Date.now() })
  return localId
}

export async function listQueued() {
  const db = await getDB()
  return db.getAll(STORE)
}

export async function removeQueued(localId) {
  const db = await getDB()
  await db.delete(STORE, localId)
}

export async function countQueued() {
  const db = await getDB()
  return db.count(STORE)
}
