import { hasHostedAiBackend } from '@/lib/env'
import {
  DisabledAiProvider,
  type AiBackendProvider,
  type AiJobHandle,
  type AiSubmitOptions,
} from './AiBackendProvider.js'
import type { AiActionId } from './actions.js'
import { activeAiJobs } from './jobStore.js'
import { RunPodAiProvider, reattachRunPodJob } from './RunPodAiProvider.js'
import { GeminiSetDesignProvider } from './providers/GeminiSetDesignProvider.js'
import { OfflineSetDesignProvider } from './providers/OfflineSetDesignProvider.js'

/**
 * Which backend runs which action, and how a reload finds its way back to a
 * job that is still going.
 *
 * The default is `DisabledAiProvider`, and that is the honest state rather
 * than a placeholder: Lattice is local-first and every backend is optional,
 * so a deployment with no AI configured says so and sends nothing anywhere.
 */

/**
 * The providers, in the order they are asked.
 *
 * Order is a policy, and it is a short one:
 *
 *  1. **The hosted GPU backend first**, because when it is configured it is
 *     the only thing that can run the image actions at all.
 *  2. **A third-party model the user holds a key for**, because storing the
 *     key is how they asked for it.
 *  3. **The offline templates last**, because they are the answer when
 *     nothing else can run — never the answer when something better can.
 *
 * 21.6 is where this becomes a preference the user sets rather than a list
 * this file decides.
 */
const REGISTRY: readonly AiBackendProvider[] = [
  RunPodAiProvider,
  GeminiSetDesignProvider,
  OfflineSetDesignProvider,
]

export interface ResolveAiOptions {
  /**
   * Only consider backends that send nothing off the device.
   *
   * What "use the offline templates" means today, and what a privacy
   * setting will mean later: a constraint on the resolution rather than a
   * named provider, so a caller never has to know which providers exist.
   */
  readonly localOnly?: boolean
}

/**
 * The provider that will run this action, or the disabled one.
 *
 * Asked per action rather than fixed per build, because the answer honestly
 * differs: `upscale` needs the hosted GPU backend, `design-set` is answered
 * by a language model or by templates, and which of those is available
 * changes the moment a user pastes a key — with no redeploy anywhere in
 * sight.
 */
export function resolveAiProvider(
  action: AiActionId,
  opts: ResolveAiOptions = {},
): AiBackendProvider {
  for (const provider of REGISTRY) {
    if (opts.localOnly && provider.requiresUpload) continue
    if (provider.canRun(action)) return provider
  }
  return DisabledAiProvider
}

/**
 * The hosted GPU backend for this build, or the disabled one.
 *
 * Distinct from {@link resolveAiProvider}: this is what owns *jobs* — the
 * things that queue, cost the deployment money and survive a reload.
 * Nothing else in the registry has any.
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
