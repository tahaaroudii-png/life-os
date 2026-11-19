import { supabase } from './supabaseClient'

/**
 * Un seul canal Realtime par table et par utilisateur.
 *
 * `useTaskLogs` est monté quatre fois à la fois — la vue du jour sur une
 * fenêtre de 150 jours, le rappel sur la seule journée, la synchro des
 * objectifs sur l'année, l'écran e-commerce — et chaque montage ouvrait son
 * propre canal. Une seule case cochée déclenchait donc quatre événements,
 * chacun invalidant toutes les plages : une rafale de rechargements dont
 * les réponses revenaient dans le désordre sur une connexion mobile. Une
 * réponse d'avant l'écriture arrivant en dernier écrasait la case cochée,
 * et l'écran la décochait tout seul.
 *
 * On partage donc le canal, et on compte les abonnés pour ne le fermer
 * qu'au départ du dernier.
 */
const canaux = new Map()

export function abonnerPartage(cle, table, userId, onChange) {
  let entree = canaux.get(cle)

  if (!entree) {
    const ecouteurs = new Set()
    let channel = null
    try {
      channel = supabase
        .channel(`${cle}-${crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
          () => { for (const f of ecouteurs) f() }
        )
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || err) {
            console.warn(`Realtime ${table} indisponible (non bloquant) :`, err?.message || status)
          }
        })
    } catch (err) {
      console.warn(`Realtime ${table} : abonnement KO (non bloquant) :`, err?.message || err)
    }
    entree = { channel, ecouteurs }
    canaux.set(cle, entree)
  }

  entree.ecouteurs.add(onChange)

  return () => {
    entree.ecouteurs.delete(onChange)
    if (entree.ecouteurs.size === 0) {
      canaux.delete(cle)
      if (entree.channel) {
        try { supabase.removeChannel(entree.channel) } catch { /* noop */ }
      }
    }
  }
}
