/**
 * The AI seam, as one import.
 *
 * A barrel and nothing else since 21.3: the registry itself moved to
 * [`registry.ts`](./registry.ts) so that modules which need to *resolve a
 * provider* — `availability.ts` is the first — can import it without
 * importing everything this file re-exports, which would be a cycle.
 */
export * from './actions.js'
export * from './strings.js'
export * from './jobModel.js'
export * from './AiBackendProvider.js'
export * from './registry.js'
export * from './cost.js'
export * from './byok.js'
export * from './consent.js'
export * from './availability.js'
export { immediateJob } from './immediateJob.js'
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
export { AI_JOBS_STORAGE_BASE, hasPersistedAiJobs } from './persistedJobs.js'
export { RunPodAiProvider, reattachRunPodJob, resetAiCapabilitiesCache } from './RunPodAiProvider.js'
export {
  GeminiSetDesignProvider,
  getSetDesignKey,
  setSetDesignKey,
} from './providers/GeminiSetDesignProvider.js'
export {
  OfflineSetDesignProvider,
  offlineSetTemplate,
} from './providers/OfflineSetDesignProvider.js'
