import { useEffect, useState } from 'react'
import { AXES } from '../../lib/planning'
import { useNotifPrefs } from '../../hooks/useNotifPrefs'

/**
 * Panneau de gestion des rappels :
 *   - statut de la permission Notifications,
 *   - bouton pour la demander si "default",
 *   - 7 toggles par axe.
 *
 * Le scheduler tourne dans Layout via <ReminderScheduler /> ; ce panneau ne
 * fait qu'informer + éditer les préférences.
 */
export default function NotificationsPanel() {
  const { prefs, setAxis } = useNotifPrefs()
  const [perm, setPerm] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )
  const [busy, setBusy] = useState(false)

  // Suit les changements de permission (l'utilisateur peut la modifier depuis
  // les paramètres du navigateur pendant que l'app est ouverte).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return
    let ignore = false
    navigator.permissions
      .query({ name: 'notifications' })
      .then((status) => {
        if (ignore) return
        setPerm(status.state === 'prompt' ? 'default' : status.state)
        status.onchange = () => setPerm(status.state === 'prompt' ? 'default' : status.state)
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [])

  async function requestPerm() {
    if (typeof Notification === 'undefined') return
    setBusy(true)
    try {
      const res = await Notification.requestPermission()
      setPerm(res)
      // Petit test visuel pour confirmer que ça marche.
      if (res === 'granted') {
        try {
          const reg = await navigator.serviceWorker?.getRegistration?.()
          if (reg?.showNotification) {
            await reg.showNotification('🔔 Rappels activés', {
              body: 'Vous recevrez une notification à l\'heure de vos tâches.',
              tag: 'reminder-test',
            })
          }
        } catch { /* noop */ }
      }
    } finally {
      setBusy(false)
    }
  }

  const permBadge = {
    granted: { label: 'Autorisées', tone: 'ok' },
    denied: { label: 'Bloquées', tone: 'ko' },
    default: { label: 'Non autorisées', tone: 'warn' },
    unsupported: { label: 'Non supportées', tone: 'ko' },
  }[perm] || { label: perm, tone: 'warn' }

  return (
    <section className="card notif-panel" style={{ marginBottom: '1.25rem' }}>
      <div className="notif-panel__head">
        <h2 style={{ margin: 0 }}>Rappels par axe</h2>
        <span className={`notif-badge notif-badge--${permBadge.tone}`}>{permBadge.label}</span>
      </div>

      {perm === 'default' && (
        <div className="notif-panel__cta">
          <p className="muted small" style={{ margin: '0 0 0.5rem' }}>
            Le navigateur doit autoriser les notifications pour que les rappels sonnent.
          </p>
          <button type="button" className="btn-primary" onClick={requestPerm} disabled={busy}>
            {busy ? '…' : 'Autoriser les notifications'}
          </button>
        </div>
      )}

      {perm === 'denied' && (
        <p className="muted small">
          Les notifications sont bloquées dans les paramètres du navigateur/téléphone.
          Rouvrez-les depuis <em>Paramètres du site</em> pour recevoir les rappels.
        </p>
      )}

      {perm === 'unsupported' && (
        <p className="muted small">
          Ce navigateur ne supporte pas les notifications web. Sur iOS, il faut Safari 16.4+
          <em> et</em> l'app installée en écran d'accueil (Ajouter à l'écran d'accueil).
        </p>
      )}

      <ul className="notif-axes">
        {AXES.map((a) => (
          <li key={a.key} className="notif-axis">
            <span className="notif-axis__label">
              <span
                className="notif-axis__dot"
                style={{ background: a.color }}
                aria-hidden="true"
              />
              {a.icon} {a.label}
            </span>
            <label className="switch">
              <input
                type="checkbox"
                checked={!!prefs[a.key]}
                onChange={(e) => setAxis(a.key, e.target.checked)}
              />
              <span className="switch__slider" />
            </label>
          </li>
        ))}
      </ul>

      <p className="muted small" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
        Un rappel se déclenche à l'heure prévue d'une tâche, uniquement si son axe est activé
        ici et si la tâche n'a pas déjà été cochée. Les rappels ne fonctionnent que si l'app
        tourne — pour un fond complet en arrière-plan, une infra web push serveur serait
        nécessaire (pas encore branché).
      </p>
    </section>
  )
}
