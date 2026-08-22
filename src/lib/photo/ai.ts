import type { PhotoElement } from '@/types/photo'
import { AiJobError } from '@/lib/ai/AiBackendProvider'
import { resolveAiProvider } from '@/lib/ai/registry'
import { useAiJobs } from '@/lib/ai/jobsStore'
import {
  getSetDesignKey,
  setSetDesignKey,
} from '@/lib/ai/providers/GeminiSetDesignProvider'

/**
 * AI set generation for Photo mode — now an adapter, not a backend.
 *
 * This file used to be the whole feature: a hard-coded call to one vendor,
 * with its own key storage, its own error handling and its own offline
 * fallback. It worked, and it was exactly what must not be repeated once
 * per feature — so 21.0 moved it onto the provider seam
 * (`src/lib/ai/`) and left this behind as the translation between Photo
 * mode's vocabulary and the catalogue's.
 *
 * The migration is the seam's proof. A contract that could hold a
 * serverless GPU worker but not a third-party language model would be tuned
 * to one backend while claiming to be general, and this is the cheapest
 * moment to have found that out. What it cost the seam is recorded in
 * `docs/architecture/ai.md`: an output kind that is not pixels, a job that
 * does not poll, a disclosure that says who pays, and one failure reason
 * that had to stop being named after a GPU.
 *
 * What did NOT change: the shape this returns. `PhotoAI.tsx` asks the same
 * question and gets the same answer, which is what makes this a migration
 * rather than a rewrite of a working feature.
 */

/** The user's own Gemini key — per account, stored by the provider. */
export const getPhotoAiKey = getSetDesignKey
export const setPhotoAiKey = setSetDesignKey

export interface PhotoAiResult {
  elements: Partial<PhotoElement>[]
  /** which engine produced the layout */
  source: 'gemini' | 'offline'
}

/**
 * Generate a set layout for the prompt.
 *
 * Which backend answers is the registry's decision, not this file's: a
 * stored Gemini key means Gemini, `forceOffline` means the templates, and
 * no key means the templates too. The panel offers the offline layout as a
 * retry after a failure, which is `localOnly` and nothing more.
 *
 * It goes through the jobs store rather than straight at the provider
 * (21.3): that is what puts the run in the AI panel while the user is in
 * another section, what raises the completion notification, and what records
 * what it cost. A second path to a provider would have had none of the
 * three, and the panel would have been describing generations it could not
 * see.
 */
export async function generateSetLayout(
  prompt: string,
  opts: {
    forceOffline?: boolean
    projectId?: string
    signal?: AbortSignal
    /** The caller has a consent grant for the recipient. See `lib/ai/consent`. */
    uploadConsent?: boolean
  } = {},
): Promise<PhotoAiResult> {
  const provider = resolveAiProvider('design-set', { localOnly: opts.forceOffline })
  const result = await useAiJobs.getState().submit({
    actionId: 'design-set',
    projectId: opts.projectId ?? '',
    params: { prompt },
    localOnly: opts.forceOffline,
    uploadConsent: opts.uploadConsent,
    signal: opts.signal,
  })
  const elements = sceneElements(result.outputs)
  if (elements.length === 0) {
    throw new AiJobError('upstream-error', 'The answer did not contain any set elements.')
  }
  return {
    elements,
    // The panel says which engine produced the layout, and it is a real
    // distinction: a template is a starting point, a model read the prompt.
    source: provider.requiresUpload ? 'gemini' : 'offline',
  }
}

/**
 * Narrow the seam's deliberately-untyped `value` back to Photo mode's model.
 *
 * The one place that is allowed to: the adapter asked for `design-set`, so
 * it is the only code that knows what a `scene` output contains. The
 * alternative — the catalogue importing `PhotoElement` — is the coupling
 * the seam exists to prevent, pointing the other way.
 */
function sceneElements(outputs: readonly { kind: string; value?: unknown }[]): Partial<PhotoElement>[] {
  const scene = outputs.find((o) => o.kind === 'scene')
  return Array.isArray(scene?.value) ? (scene.value as Partial<PhotoElement>[]) : []
}
