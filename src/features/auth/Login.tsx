import { useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Lien magique uniquement au lot 1. Le code à six chiffres arrive au
 * lot 6 : il demande une table et une fonction côté serveur, et stocker
 * un code en clair dans le navigateur — ce que faisait l'ancienne app —
 * n'est pas une option.
 */
export function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithOtp({ email })
    setBusy(false)
    if (error) setError(error.message); else setSent(true)
  }

  return (
    <div className="app">
      <h1>Life OS</h1>
      <p className="muted small">Axes de vie, objectifs 2026, business et argent.</p>
      {sent ? (
        <div className="card" style={{ marginTop: 24 }}>
          <p>Lien envoyé à <strong>{email}</strong>. Ouvre-le sur cet appareil.</p>
        </div>
      ) : (
        <form className="card" style={{ marginTop: 24 }} onSubmit={send}>
          <label className="small muted" htmlFor="email">Adresse e-mail</label>
          <input id="email" type="email" required value={email} inputMode="email"
                 onChange={(e) => setEmail(e.target.value)}
                 style={{
                   width: '100%', marginTop: 8, marginBottom: 16, padding: 12,
                   borderRadius: 8, border: '1px solid var(--border)',
                   background: 'var(--surface-2)', color: 'var(--text)', font: 'inherit',
                 }} />
          <button className="btn primary" disabled={busy || !email}>
            {busy ? 'Envoi…' : 'Recevoir le lien'}
          </button>
          {error && <p className="small tone-crit" style={{ marginBottom: 0 }}>{error}</p>}
        </form>
      )}
    </div>
  )
}
