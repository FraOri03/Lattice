import {
  AI_ACTION_IDS,
  dataCarriedBy,
  defaultParams,
  type AiActionId,
  type AiDataCarried,
} from './actions.js'
import type { AiBackendProvider, AiDisclosure } from './AiBackendProvider.js'
import { byokProvidersFor, type ByokProviderMeta } from './byok.js'
import { consentSubjectOf, hasConsent, type AiConsentSubject } from './consent.js'
import { estimateCost, type AiCostEstimate } from './cost.js'
import { resolveAiProvider } from './registry.js'

/**
 * Why a button is not a button, said in one word the surface can translate.
 *
 * The list is closed because each entry owes the user a different sentence
 * AND a different next step. "AI is unavailable" is the message this file
 * exists to stop being shipped: *no backend on this deployment*, *you have
 * no key for the vendor that runs this*, *you are offline*, and *sign in
 * first* are four different problems with four different remedies, and
 * collapsing them is how a feature becomes a dead button.
 */
export type AiBlockedReason =
  /** Nothing on this deployment can run it, and no key would change that. */
  | 'not-configured'
  /** A vendor could run it on a key of the user's own, and there is none. */
  | 'no-key'
  /** The runner needs the network and this machine has none. */
  | 'offline'
  /** A deployment backend is configured; it authorises against an account. */
  | 'sign-in'

/**
 * Everything the surface needs to decide what to show for one action,
 * derived once rather than by five components each asking a different half
 * of the question.
 */
export interface AiActionAvailability {
  readonly actionId: AiActionId
  readonly provider: AiBackendProvider
  readonly disclosure: AiDisclosure
  /** Pressing the button now would start work. */
  readonly runnable: boolean
  readonly blocked: AiBlockedReason | null
  /** What the job carries off the device, derived from the action. */
  readonly carries: AiDataCarried
  /** The recipient a grant is filed against, or null when nothing leaves. */
  readonly consent: AiConsentSubject | null
  /** A grant is required and has not been given. Not a block: the surface asks. */
  readonly needsConsent: boolean
  /** The labelled range, or null when no GPU time is billed. */
  readonly cost: AiCostEstimate | null
  /** A provider that sends nothing off the device could answer instead. */
  readonly localFallback: boolean
  /** Vendors whose key would unlock this action — what `no-key` points at. */
  readonly byok: readonly ByokProviderMeta[]
}

export interface AiAvailabilityContext {
  /** `navigator.onLine`, read once by the caller so a render is consistent. */
  readonly online: boolean
  /** A Google identity exists. The deployment backend authorises against one. */
  readonly signedIn: boolean
  /** The parameters the cost estimate is for; the catalogue's defaults if absent. */
  readonly params?: Readonly<Record<string, unknown>>
}

/**
 * What would happen if the user pressed this action's button right now.
 *
 * Reads storage (the consent record, the stored keys) and the registry, and
 * nothing else — no network, no React. The whole point is that the surface
 * can render an honest state on the first frame instead of discovering it
 * from a failed submission.
 */
export function aiAvailability(
  actionId: AiActionId,
  ctx: AiAvailabilityContext,
): AiActionAvailability {
  const provider = resolveAiProvider(actionId)
  const local = resolveAiProvider(actionId, { localOnly: true })
  const localFallback = local.id !== 'disabled' && local !== provider
  const consent = consentSubjectOf(provider)
  const byok = byokProvidersFor(actionId)
  const params = ctx.params ?? defaultParams(actionId)

  const base = {
    actionId,
    provider,
    disclosure: provider.disclosure,
    carries: dataCarriedBy(actionId),
    consent,
    needsConsent: consent !== null && !hasConsent(consent),
    cost: estimateCost(actionId, params),
    localFallback,
    byok,
  } as const

  const blocked = blockedReason(provider, ctx, byok)
  return { ...base, blocked, runnable: blocked === null }
}

function blockedReason(
  provider: AiBackendProvider,
  ctx: AiAvailabilityContext,
  byok: readonly ByokProviderMeta[],
): AiBlockedReason | null {
  if (provider.id === 'disabled') {
    // A vendor that would run it on the user's own key is a remedy the user
    // can actually act on, and it is a different sentence from "nobody here
    // runs this at all" — which is the one the deployment has to fix.
    return byok.length > 0 ? 'no-key' : 'not-configured'
  }
  /*
   * Offline: refused with a sentence, never queued.
   *
   * The decision this phase owes, taken here. A generation is not a document
   * edit: the deadline is wall clock, the authorisation ticket expires, and
   * the bytes belong to a third party rather than to the vault. An outbox
   * would therefore hold work that is guaranteed to time out the moment it
   * is released, and it would hold someone's photograph while it waited. So
   * a run that needs the network says so, and where a local provider exists
   * (`localFallback`) the surface offers it instead — which is what Photo
   * mode's offline templates already are.
   */
  if (!ctx.online && provider.requiresUpload) return 'offline'
  // Only a backend the DEPLOYMENT runs authorises against a Lattice account.
  // A vendor reached with the user's own key does not care who is signed in.
  if (provider.disclosure.destination === 'deployment' && !ctx.signedIn) return 'sign-in'
  return null
}

/** Every action in the catalogue, resolved. Render order is the catalogue's. */
export function aiAvailabilityAll(ctx: AiAvailabilityContext): AiActionAvailability[] {
  return AI_ACTION_IDS.map((actionId) => aiAvailability(actionId, ctx))
}

/**
 * The one-line state of the whole surface.
 *
 * - `ready` — a deployment backend is running actions.
 * - `your-key` — nothing hosted here, but a vendor key of the user's own is.
 * - `on-device` — only providers that send nothing anywhere can answer.
 * - `unavailable` — nothing can run anything.
 *
 * Four states rather than a boolean because the middle two are the ones a
 * local-first product is actually in most of the time, and calling either of
 * them "unavailable" would be a lie about a feature that works.
 */
export type AiSurfaceState = 'ready' | 'your-key' | 'on-device' | 'unavailable'

export function aiSurfaceState(ctx: AiAvailabilityContext): AiSurfaceState {
  const all = aiAvailabilityAll(ctx)
  const runnable = all.filter((a) => a.runnable)
  if (runnable.length === 0) return 'unavailable'
  if (runnable.some((a) => a.disclosure.cost === 'deployment')) return 'ready'
  if (runnable.some((a) => a.disclosure.cost === 'your-key')) return 'your-key'
  return 'on-device'
}
