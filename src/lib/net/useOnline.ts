import { useEffect, useState } from 'react'

/**
 * Whether this device believes it has a network.
 *
 * `navigator.onLine` was already read in five places — the sync engine, the
 * Drive polling provider, the Liveblocks transport and the top bar's chip —
 * and each one re-derived the same two event listeners. It is a device fact,
 * not a feature's fact, so it lives here now and the AI surface is the third
 * consumer rather than the fourth copy.
 *
 * What it can and cannot say is worth stating once: `onLine === false` means
 * the machine has no route at all, which is a reliable *no*. `true` only
 * means an interface is up — a captive portal or a dead uplink still reads
 * as online. So it is used to REFUSE work that certainly cannot succeed,
 * never to promise that work will.
 */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(isOnline)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}
