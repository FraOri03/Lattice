import { hasHostedAiBackend } from '@/lib/env'
import {
  DisabledAiProvider,
  type AiBackendProvider,
  type AiJobHandle,
  type AiSubmitOptions,
} from './AiBackendProvider.js'
import { activeAiJobs } from './jobStore.js'
import { RunPodAiProvider, reattachRunPodJob } from './RunPodAiProvider.js'

/**
 * Which AI backend this build runs, and how a reload finds its way back to
 * a job that is still running.
 *
 * The default is `DisabledAiProvider`, and that is the honest state rather
 * than a placeholder: Lattice is local-first and every backend is optional,
 * so a deployment with no AI configured says so and sends nothing anywhere.
 * 21.6 adds the local ComfyUI branch and lets the user choose between them.
 */
export const aiBackend: AiBackendProvider = hasHostedAiBackend
  ? RunPodAiProvider
  : DisabledAiProvider

/**
 * Reconnect to every job this account left running.
 *
 * Called once when the AI surface mounts. The vault holds the ids and the
 * tickets; the state comes from the server, because a job that finished
 * while the tab was closed has to be collected rather than re-run — it has
 * already been paid for.
 */
export function restoreAiJobs(opts: AiSubmitOptions = {}): AiJobHandle[] {
  if (aiBackend.id !== 'hosted') return []
  return activeAiJobs().map((job) => reattachRunPodJob(job, opts))
}

export * from './actions.js'
export * from './strings.js'
export * from './jobModel.js'
export * from './AiBackendProvider.js'
export { pollDelayMs, pollSchedule, RUNNING_REGIME, WAITING_REGIME } from './backoff.js'
export {
  activeAiJobs,
  clearAiJobs,
  forgetAiJob,
  loadAiJobs,
  rememberAiJob,
  updateAiJob,
} from './jobStore.js'
export type { PersistedAiJob } from './jobStore.js'
export { RunPodAiProvider, reattachRunPodJob, resetAiCapabilitiesCache } from './RunPodAiProvider.js'
