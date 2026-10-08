import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type Mode = 'password' | 'link'

const field: React.CSSProperties = {
  width: '100%', marginTop: 8, marginBottom: 16, padding: 12,
  borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface-2)', color: 'var(--text)', font: 'inherit',
}

/**
 * Deux voies d'entrée.
 *
 * Le mot de passe d'abord : il ne dépend de rien. Le lien par e-mail reste
 * en secours, mais le service d'envoi gratuit plafonne à deux messages par
 * heure — s'y fier seul, c'est se retrouver dehors au mauvais moment.
 */
export function Login() {
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? "Mot de passe incorrect, ou pas encore défini pour ce compte. Passe par le lien e-mail une fois, puis règle-le dans Plus → Réglages."
          : error.message,
      )
    }
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: new URL(import.meta.env.BASE_URL, location.origin).href },
    })
    setBusy(false)
    if (error) {
      setError(
        error.message.includes('rate limit')
          ? "Quota d'envoi atteint : deux e-mails par heure sur ce projet. Réessaie à l'heure suivante, ou connecte-toi par mot de passe."
          : error.message,
      )
    } else setSent(true)
  }

  return (
    <div className="app">
      <h1>Life OS</h1>
      <p className="muted small">Axes de vie, objectifs 2026, business et argent.</p>

      {sent ? (
        <div className="card" style={{ marginTop: 24 }}>
          <p>Lien envoyé à <strong>{email}</strong>. Ouvre-le sur cet appareil, pas sur un autre.</p>
          <button className="btn" onClick={() => { setSent(false); setMode('password') }}>Retour</button>
        </div>
      ) : (
        <form className="card" style={{ marginTop: 24 }}
              onSubmit={mode === 'password' ? signInWithPassword : sendLink}>
          <label className="small muted" htmlFor="email">Adresse e-mail</label>
          <input id="email" type="email" required value={email} inputMode="email"
                 autoComplete="username" style={field}
                 onChange={(e) => setEmail(e.target.value)} />

          {mode === 'password' && (
            <>
              <label className="small muted" htmlFor="password">Mot de passe</label>
              <input id="password" type="password" required value={password}
                     autoComplete="current-password" style={field}
                     onChange={(e) => setPassword(e.target.value)} />
            </>
          )}

          <button className="btn primary" disabled={busy || !email || (mode === 'password' && !password)}>
            {busy ? 'Un instant…' : mode === 'password' ? 'Entrer' : 'Recevoir le lien'}
          </button>

          {error && <p className="small tone-crit" style={{ marginBottom: 0 }}>{error}</p>}

          <button type="button" className="btn" style={{ marginTop: 16 }}
                  onClick={() => { setMode(mode === 'password' ? 'link' : 'password'); setError(null) }}>
            {mode === 'password' ? 'Recevoir plutôt un lien par e-mail' : 'Entrer avec un mot de passe'}
          </button>
        </form>
      )}
    </div>
  )
}
