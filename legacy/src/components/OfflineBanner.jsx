import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useQueuedCount } from '../hooks/useQueuedCount'

export default function OfflineBanner() {
  const online = useOnlineStatus()
  const queued = useQueuedCount()

  if (online && queued === 0) return null

  return (
    <div className={`offline-banner ${online ? 'offline-banner--syncing' : ''}`}>
      {!online && <span>📴 Hors-ligne — les dépenses saisies seront synchronisées au retour du réseau.</span>}
      {online && queued > 0 && <span>🔄 Synchronisation de {queued} dépense(s) en attente…</span>}
    </div>
  )
}
