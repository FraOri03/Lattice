import { useEffect, useState } from 'react'

/**
 * The origin's real storage footprint and allowance, via the Storage API.
 *
 * This is the one honest answer to "how much room is left", and it is not
 * the disk's — a browser cannot read that. `quota` is what this origin is
 * *allowed* to use (Chrome derives it from free disk, so it moves as the
 * disk fills), and `usage` is what it currently occupies across IndexedDB,
 * Cache Storage and the rest. Both are deliberately coarse: the spec lets
 * implementations pad them to defeat cross-site storage fingerprinting, so
 * they are the right shape for a status bar and the wrong shape for
 * anything that needs an exact byte count.
 *
 * `usage` is also the better vault total than summing asset sizes, because
 * it counts what documents, boards and indexes actually cost on disk —
 * bytes a sum over `assets` cannot see at all.
 */
export interface StorageEstimate {
  usage: number
  quota: number
}

export function useStorageEstimate(): StorageEstimate | null {
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null)

  useEffect(() => {
    if (!navigator.storage?.estimate) return
    let cancelled = false

    const read = () => {
      void navigator.storage.estimate().then((e) => {
        if (cancelled) return
        if (typeof e.usage !== 'number' || typeof e.quota !== 'number') return
        setEstimate({ usage: e.usage, quota: e.quota })
      }, () => {
        /* Storage API present but refusing to answer — stay unmeasured */
      })
    }

    read()
    // an import or a purge changes this; 30s is slow enough to cost nothing
    // and quick enough that the panel isn't quoting a stale figure
    const timer = setInterval(read, 30_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  return estimate
}
