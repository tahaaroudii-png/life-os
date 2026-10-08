import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Erreur volontairement bruyante : sans ces variables, rien ne peut fonctionner.
  console.error(
    "Variables d'environnement VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes. " +
      'Copiez .env.example vers .env et renseignez vos clés Supabase.'
  )
}

// persistSession + autoRefreshToken : la session (et son refresh token) est stockée
// dans localStorage, donc l'utilisateur reste connecté sur cet appareil tant qu'il
// ne se déconnecte pas explicitement (le lien magique n'est nécessaire qu'une fois).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
