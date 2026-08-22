import { vaultKey } from '@/lib/storage/vaultScope'

/**
 * The one question about AI that the app shell is allowed to ask eagerly:
 * *did a previous page load leave a paid job running?*
 *
 * It lives apart from `jobStore.ts` on purpose. A generation that survives a
 * refresh has to be reattached whether or not the AI surface is ever opened
 * — otherwise the user pays for an image nobody collects — but the module
 * that does the reattaching drags the whole seam in with it, and the seam is
 * a lazy chunk (21.3, and #11's bundle budget). So the shell imports this
 * leaf, which touches nothing but `localStorage`, and pulls the rest in with
 * a dynamic import only when the answer is yes.
 */

/** The vault name, before namespacing. `jobStore` is what reads the contents. */
export const AI_JOBS_STORAGE_BASE = 'lattice-ai-jobs'

export function aiJobsStorageKey(): string {
  return vaultKey(AI_JOBS_STORAGE_BASE)
}

/**
 * Whether this account's vault holds any job record at all.
 *
 * Deliberately shallow: it does not parse, validate or prune — `jobStore`
 * owns all three, and duplicating them here to save one dynamic import
 * would be two definitions of what a valid record is. A stale or corrupt
 * entry costs one chunk load and is then thrown away by the code that knows
 * how, which is the right side of that trade.
 */
export function hasPersistedAiJobs(): boolean {
  try {
    const raw = localStorage.getItem(aiJobsStorageKey())
    return !!raw && raw !== '[]'
  } catch {
    return false
  }
}
