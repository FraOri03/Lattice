import { useEffect, useState } from 'react'
import { threeViewerBudget } from './viewerBudget'

/**
 * useViewerSlot — while `want` is true, hold one of the global 3D-viewer
 * budget slots (PERF-2, item 4). Returns whether a slot is currently held;
 * a viewer that can't get one shows a paused placeholder instead of spinning
 * up another WebGL context. Re-tries automatically when a slot frees up, and
 * always releases on unmount.
 */
export function useViewerSlot(id: string, want: boolean): boolean {
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (!want) {
      threeViewerBudget.release(id)
      setHeld(false)
      return
    }
    const tryAcquire = () => setHeld(threeViewerBudget.acquire(id))
    tryAcquire()
    const unsub = threeViewerBudget.subscribe(tryAcquire)
    return () => {
      unsub()
      threeViewerBudget.release(id)
    }
  }, [id, want])

  return held
}
