import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'

/**
 * Écran de connexion.
 *
 * Deux modes :
 *   - "code"   : email + code d'accès (mot de passe court, 6+ chiffres).
 *                Méthode principale, plus rapide, aucun aller-retour email.
 *   - "magic"  : email + lien magique.
 *                Fallback pour la toute première connexion et le "code oublié".
 *
 * L'email de la dernière connexion réussie est retenu dans localStorage pour
 * ne pas avoir à le retaper (le PIN, lui, n'est jamais stocké).
 */
const LAST_EMAIL_KEY = 'budget-app.last-email'

export default function Login() {
  const { signInWithMagicLink, signInWithPassword, authError } = useAuth()
  const [mode, setMode] = useState('code')
  const [email, setEmail] = useState(() => localStorage.getItem(LAST_EMAIL_KEY) || '')
  const [pin, setPin] = useState('')
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState(null)

  useEffect(() => {
    setLocalError(null)
  }, [mode])

  const helpText = useMemo(() => {
    if (mode === 'code') return 'Entrez votre email et votre code d\'accès (6 chiffres minimum).'
    return 'On vous envoie un lien de connexion — utile la première fois ou si vous avez oublié votre code.'
  }, [mode])

  async function handleSubmitCode(e) {
    e.preventDefault()
    setLocalError(null)
    if (!email || !pin) return
    if (pin.length < 6) {
      setLocalError('Le code doit faire au moins 6 chiffres.')
      return
    }
    setSubmitting(true)
    const { error } = await signInWithPassword(email, pin)
    setSubmitting(false)
    if (!error) {
      localStorage.setItem(LAST_EMAIL_KEY, email)
    }
  }

  async function handleSubmitMagic(e) {
    e.preventDefault()
    setLocalError(null)
    if (!email) return
    setSubmitting(true)
    const { error } = await signInWithMagicLink(email)
    setSubmitting(false)
    if (!error) {
      localStorage.setItem(LAST_EMAIL_KEY, email)
      setSent(true)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>💰 Budget</h1>
        <p className="muted">{helpText}</p>

        {sent ? (
          <div className="login-sent">
            <p>
              Un lien de connexion a été envoyé à <strong>{email}</strong>.
            </p>
            <p className="muted">Ouvrez-le depuis cet appareil.</p>
            <button type="button" className="btn-secondary" onClick={() => { setSent(false); setMode('code') }}>
              Retour
            </button>
          </div>
        ) : mode === 'code' ? (
          <form onSubmit={handleSubmitCode}>
            <label htmlFor="email">Adresse email</label>
            <input
              id="email"
              type="email"
              required
              placeholder="vous@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label htmlFor="pin">Code d'accès</label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              pattern="[0-9]*"
              required
              placeholder="••••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
            {(localError || authError) && (
              <p className="error-text">{localError || authError}</p>
            )}
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Connexion…' : 'Se connecter'}
            </button>
            <p className="muted small" style={{ marginTop: '1rem', textAlign: 'center' }}>
              Première connexion ou code oublié ?{' '}
              <button type="button" className="btn-link" onClick={() => setMode('magic')}>
                Recevoir un lien magique
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleSubmitMagic}>
            <label htmlFor="email">Adresse email</label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              placeholder="vous@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {authError && <p className="error-text">{authError}</p>}
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Envoi…' : 'Recevoir le lien magique'}
            </button>
            <p className="muted small" style={{ marginTop: '1rem', textAlign: 'center' }}>
              <button type="button" className="btn-link" onClick={() => setMode('code')}>
                ← Utiliser mon code d'accès
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
