import { openDB } from 'idb'

const DB_NAME = 'budget-offline'
const STORE = 'pending-transactions'
/*
 * Les écritures que le serveur a définitivement refusées. Elles n'ont rien
 * à faire dans la file d'attente : celle-ci suppose qu'un nouvel essai
 * finira par passer, or une contrainte violée le sera encore demain. Elles
 * y restaient donc à vie, réessayées et refusées à chaque démarrage.
 */
const REJECTED = 'rejected-transactions'

let dbPromise = null
function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'localId' })
        }
        if (!db.objectStoreNames.contains(REJECTED)) {
          db.createObjectStore(REJECTED, { keyPath: 'localId' })
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

/** Écarte un élément que le serveur refuse, en gardant de quoi l'examiner. */
export async function markRejected(item, reason) {
  const db = await getDB()
  await db.put(REJECTED, { ...item, reason, rejectedAt: Date.now() })
  await db.delete(STORE, item.localId)
}

export async function listRejected() {
  const db = await getDB()
  return db.getAll(REJECTED)
}

export async function dropRejected(localId) {
  const db = await getDB()
  await db.delete(REJECTED, localId)
}
