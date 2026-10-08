import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

/**
 * Supabase redirige vers l'app avec `#error=...&error_description=...` (ou parfois
 * en query string) quand le lien magique est invalide/expiré. Sans ce nettoyage,
 * l'URL reste polluée (et un refresh la re-déclenche) au lieu de retomber
 * proprement sur l'écran de connexion.
 */
function consumeAuthErrorFromUrl() {
  const sources = [window.location.hash?.replace(/^#/, ''), window.location.search?.replace(/^\?/, '')]
  for (const raw of sources) {
    if (!raw || !raw.includes('error')) continue
    const params = new URLSearchParams(raw)
    const error = params.get('error') || params.get('error_code')
    if (!error) continue
    const description = params.get('error_description')
    // Nettoie l'URL (hash + query) sans recharger la page.
    window.history.replaceState(null, '', window.location.pathname)
    return description ? decodeURIComponent(description.replace(/\+/g, ' ')) : 'Le lien de connexion est invalide ou a expiré.'
  }
  return null
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = chargement initial
  const [authError, setAuthError] = useState(null)

  useEffect(() => {
    const urlError = consumeAuthErrorFromUrl()
    if (urlError) setAuthError(urlError)

    supabase.auth.getSession().then(({ data }) => setSession(data.session))

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  async function signInWithMagicLink(email) {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })
    if (error) setAuthError(error.message)
    return { error }
  }

  async function signInWithPassword(email, password) {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
    return { error }
  }

  /**
   * Définit (ou met à jour) le mot de passe / code d'accès du compte courant.
   * L'utilisateur doit être authentifié pour appeler ça — sinon Supabase refuse.
   * `has_pin: true` est stocké en user_metadata pour savoir si on doit encore
   * afficher la bannière de création du code.
   */
  async function setPassword(password) {
    setAuthError(null)
    const { data, error } = await supabase.auth.updateUser({
      password,
      data: { has_pin: true },
    })
    if (error) {
      setAuthError(error.message)
      return { error }
    }
    return { data }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const value = {
    session,
    user: session?.user ?? null,
    loading: session === undefined,
    authError,
    hasPin: !!session?.user?.user_metadata?.has_pin,
    signInWithMagicLink,
    signInWithPassword,
    setPassword,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>')
  return ctx
}
