import { useEffect, useState } from 'react'
import { countQueued } from '../lib/offlineQueue'
import { useOnlineStatus } from './useOnlineStatus'

/** Nombre de dépenses en attente de synchronisation (poll léger). */
export function useQueuedCount() {
  const [count, setCount] = useState(0)
  const online = useOnlineStatus()

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      const c = await countQueued()
      if (!cancelled) setCount(c)
    }
    refresh()
    const id = setInterval(refresh, 2000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [online])

  return count
}
