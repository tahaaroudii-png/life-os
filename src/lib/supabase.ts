import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont absents. ' +
    'Copier .env.example vers .env et les renseigner.',
  )
}

/**
 * Tout vit dans le schéma `life`, jamais dans `public` : l'ancienne app
 * occupe encore public.tasks et public.task_logs avec un schéma différent,
 * et les deux doivent cohabiter le temps de la bascule.
 *
 * Si une requête revient avec « schema must be one of the following », le
 * schéma `life` n'a pas été ajouté dans Settings → API → Exposed schemas.
 */
export const supabase = createClient(url, anonKey, {
  db: { schema: 'life' },
  auth: { persistSession: true, autoRefreshToken: true },
})

/** Pour appeler une fonction qui vit hors du schéma `life`, si besoin. */
export const supabasePublic = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
})
