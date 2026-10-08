import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

/**
 * Bannière + modal de création du code d'accès.
 *
 * Deux modes d'affichage :
 *   - "banner" (défaut) : petite bande visible tant que l'utilisateur n'a pas
 *      encore de code défini. Se cache une fois `hasPin` à true.
 *   - "inline" : version bouton, réutilisable depuis un écran de réglages.
 *
 * Le code est simplement passé à supabase.auth.updateUser({ password }) — c'est
 * un mot de passe numérique classique côté Supabase, rien de spécifique.
 */
export default function SetPinBanner({ variant = 'banner' }) {
  const { hasPin, setPassword } = useAuth()
  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  if (variant === 'banner' && (hasPin || done)) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (pin.length < 6) {
      setError('Le code doit faire au moins 6 chiffres.')
      return
    }
    if (pin !== pin2) {
      setError('Les deux codes ne correspondent pas.')
      return
    }
    setSubmitting(true)
    const { error: err } = await setPassword(pin)
    setSubmitting(false)
    if (err) {
      setError(err.message || 'Impossible d\'enregistrer le code.')
      return
    }
    setDone(true)
    setOpen(false)
    setPin('')
    setPin2('')
  }

  const triggerLabel = hasPin ? 'Changer mon code' : 'Créer mon code d\'accès'

  return (
    <>
      {variant === 'banner' ? (
        <div className="pin-banner">
          <span>
            🔐 Créez un code d'accès à 6 chiffres pour ne plus jamais avoir besoin du lien magique.
          </span>
          <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
            Créer
          </button>
        </div>
      ) : (
        <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
          {triggerLabel}
        </button>
      )}

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)} role="dialog" aria-modal="true">
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2 style={{ marginTop: 0 }}>{triggerLabel}</h2>
            <p className="muted small">
              Ce code remplace le lien magique pour les prochaines connexions sur cet appareil
              ou n'importe où ailleurs. 6 chiffres minimum.
            </p>
            <form onSubmit={handleSubmit}>
              <label htmlFor="new-pin">Nouveau code</label>
              <input
                id="new-pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="new-password"
                placeholder="••••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
              <label htmlFor="new-pin-2">Confirmer</label>
              <input
                id="new-pin-2"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="new-password"
                placeholder="••••••"
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
              />
              {error && <p className="error-text">{error}</p>}
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                  Annuler
                </button>
                <button type="submit" className="btn-primary" disabled={submitting || !pin || !pin2}>
                  {submitting ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
