import type { AiActionId, AiAssetKind } from './actions.js'
import type { AiFailure, AiFailureReason, AiJobResult, AiJobSnapshot } from './jobModel.js'
import { AI_FAILURES, stateForFailure } from './jobModel.js'

/**
 * `AiBackendProvider` — the seam between the app and whatever actually runs
 * an AI action.
 *
 * Shaped deliberately like `ConversionBackendProvider` (Phase 8), down to
 * the three honestly-labelled implementations and the same guarantees
 * around consent, abort, timeout and size caps. That file already solved
 * these problems once; a second design for them would only be a second set
 * of bugs.
 *
 *  - **local** — a ComfyUI on the user's own machine (21.6). Nothing leaves
 *    the device.
 *  - **hosted** — {@link ../ai/RunPodAiProvider}. Talks only to our own
 *    `/api/ai/*`; it never sees a RunPod credential and never learns which
 *    endpoint ran the job.
 *  - **disabled** — {@link DisabledAiProvider}, and the default. `canRun()`
 *    is false for everything and `submit()` throws a sentence that names
 *    what would have to be configured.
 *
 * ## The trust boundary, stated once
 *
 * Anything named `VITE_*` is compiled into the public bundle
 * (`docs/deploy-and-secrets.md`). So the hosted provider is written the way
 * `api/realtime/media-token.ts` taught: the browser asks our endpoint, the
 * endpoint verifies identity and authorisation, and only then uses the
 * secret. No hostname, endpoint id or key belonging to RunPod exists on
 * this side of the seam.
 */

export interface AiBinaryInput {
  readonly kind: AiAssetKind
  readonly blob: Blob
  readonly filename?: string
}

export interface AiSubmitRequest {
  readonly actionId: AiActionId
  /** The project the job is run for — what 21.7 authorises against. */
  readonly projectId: string
  readonly params: Readonly<Record<string, number | string | boolean>>
  /** In the order `AI_ACTIONS[actionId].inputs` declares them. */
  readonly inputs?: readonly AiBinaryInput[]
}

export interface AiSubmitOptions {
  /** Caller abort. Composes with the deadline; either one cancels upstream. */
  readonly signal?: AbortSignal
  /**
   * The caller collected explicit consent for the upload.
   *
   * Required whenever the request carries a binary input, exactly as
   * `ConvertOptions.uploadConsent` is. A prompt is data the user typed at
   * an AI feature; an image is a file off their machine, and the two do not
   * get the same default.
   */
  readonly uploadConsent?: boolean
  /** Called on every observed state change, including cold start. */
  readonly onSnapshot?: (snapshot: AiJobSnapshot) => void
  /** Shorter than the action's own deadline; never longer. */
  readonly deadlineMs?: number
}

export interface AiJobHandle {
  readonly jobId: string
  /** The latest state observed, synchronously. */
  snapshot(): AiJobSnapshot
  /** Resolves on success, rejects with {@link AiJobError} on every other end. */
  result(): Promise<AiJobResult>
  /**
   * Stop the job upstream, not only in the UI.
   *
   * A job cancelled in the browser that keeps burning GPU minutes is a
   * billing bug, so this reaches the backend and resolves once it has.
   */
  cancel(): Promise<void>
}

/**
 * What the surface must be able to tell the user *before* anything runs.
 *
 * The action says what a job carries ({@link dataCarriedBy}); this says
 * where that goes and who pays for it. The two are separate because they
 * are answered by different halves of the seam, and neither half can
 * answer for the other: the same `upscale` sends the same image whether it
 * lands on a rented GPU, on the user's own machine, or nowhere at all.
 *
 * This field is what the Photo mode migration bought. Before it, `id` was
 * carrying both questions — and `local | hosted | disabled` answers "does
 * it leave the device" cleanly while saying nothing at all about who is
 * billed. A third-party model reached with the user's own key is `hosted`
 * and costs the deployment nothing, which is a sentence the id alone
 * cannot express.
 */
export interface AiDisclosure {
  /**
   * - `device` — nothing leaves.
   * - `deployment` — a backend this deployment runs and pays for.
   * - `third-party` — a vendor the user chose, under their own account.
   */
  readonly destination: 'device' | 'deployment' | 'third-party'
  /**
   * - `free` — nothing is billed to anyone.
   * - `deployment` — the deployment's account is charged.
   * - `your-key` — the user's own credential, and their own bill.
   */
  readonly cost: 'free' | 'deployment' | 'your-key'
  /**
   * A STABLE id for who receives the data — what a consent record is filed
   * against (`src/lib/ai/consent.ts`).
   *
   * Not the label: a label is prose that gets reworded, and a consent
   * record keyed to prose silently detaches from the thing it was about.
   * Absent only for `device`, where there is no recipient to name.
   */
  readonly vendor?: string
}

/** What a backend says it can do, asked at runtime rather than assumed. */
export interface AiCapabilities {
  readonly configured: boolean
  readonly actions: readonly AiActionId[]
  /**
   * Why nothing is available, when nothing is — as a code from the
   * taxonomy, so the surface localises it like every other failure rather
   * than rendering a sentence the server chose the language of.
   */
  readonly reason?: AiFailureReason
}

export interface AiBackendProvider {
  readonly id: 'local' | 'hosted' | 'disabled'
  readonly label: string
  /** True when running an action sends bytes off the device. */
  readonly requiresUpload: boolean
  /** Where the data goes and who pays — see {@link AiDisclosure}. */
  readonly disclosure: AiDisclosure
  /**
   * The build-time answer, from the closed catalogue.
   *
   * Availability is a *runtime* question — the server has to be able to say
   * no without a redeploy — so this is a prediction, and
   * {@link AiBackendProvider.capabilities} is the answer. A surface that
   * only ever calls `canRun` will occasionally offer an action the
   * deployment has switched off, and the submission will fail honestly.
   */
  canRun(action: AiActionId): boolean
  /** What the backend says it can do right now. Cached by the implementation. */
  capabilities(): Promise<AiCapabilities>
  submit(req: AiSubmitRequest, opts?: AiSubmitOptions): Promise<AiJobHandle>
}

/* ---------------- errors ---------------- */

/**
 * The only error type that crosses the seam.
 *
 * It carries the machine-readable {@link AiFailure} as well as the message,
 * because the surface has to answer two questions — what happened, and is
 * retrying sensible — and a string can only answer the first.
 */
export class AiJobError extends Error {
  readonly failure: AiFailure

  constructor(reason: AiFailureReason, detail: string) {
    super(detail)
    this.name = 'AiJobError'
    this.failure = { reason, detail }
  }

  /** Whether a caller may retry this without asking the user. */
  get retry() {
    return AI_FAILURES[this.failure.reason].retry
  }

  /** Whether GPU time may already have been paid for. */
  get billed(): boolean {
    return AI_FAILURES[this.failure.reason].billed
  }

  /** The terminal job state this error corresponds to. */
  get state() {
    return stateForFailure(this.failure.reason)
  }
}

/* ---------------- the honest default ---------------- */

export const AI_SETUP_NOTE =
  'No AI backend is configured for this deployment. A hosted one needs RUNPOD_API_KEY and an endpoint id ' +
  'set as server-side variables on Vercel (never VITE_-prefixed); a local one needs a ComfyUI reachable ' +
  'from this machine. Until one is set up, AI actions are unavailable and nothing is sent anywhere.'

export const DisabledAiProvider: AiBackendProvider = {
  id: 'disabled',
  label: 'AI backend not configured',
  requiresUpload: false,
  disclosure: { destination: 'device', cost: 'free' },
  canRun: () => false,
  capabilities: async () => ({
    configured: false,
    actions: [],
    reason: 'not-configured',
  }),
  submit: async () => {
    throw new AiJobError('not-configured', AI_SETUP_NOTE)
  },
}
