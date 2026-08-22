import { useEffect } from 'react'
import { hasHostedAiBackend } from '@/lib/env'
import { hasPersistedAiJobs } from './persistedJobs.js'

/**
 * Pick up a generation the last page load left running — without loading the
 * AI seam to find out there was none.
 *
 * Mounted in the app shell, above the surface switch, for the same reason
 * the history binding is: a refresh in the middle of a job must not orphan
 * work that is already being paid for, and that has to happen whether the
 * user goes to the dashboard, a project or the AI panel. Reattaching only
 * when the panel opens would mean a job that finished in the meantime is
 * collected minutes late, or not at all.
 *
 * The two guards are the whole design. `hasHostedAiBackend` is a build-time
 * constant, so a deployment with no AI compiles this to a no-op;
 * `hasPersistedAiJobs` is one `localStorage` read in a leaf module. Only if
 * both say yes does the dynamic import pull the seam in — which keeps the
 * lazy chunk lazy on every page load that has nothing to restore, and that
 * is nearly all of them.
 */
export function useAiJobRestore(): void {
  useEffect(() => {
    if (!hasHostedAiBackend || !hasPersistedAiJobs()) return
    void import('./jobsStore.js').then((m) => m.useAiJobs.getState().restore())
  }, [])
}
