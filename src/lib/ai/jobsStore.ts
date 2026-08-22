import { create } from 'zustand'
import { announce } from '@/lib/a11y/announcer'
import { useAiActivity } from './activity.js'
import { notificationService } from '@/lib/collab/NotificationService'
import { messages } from '@/lib/i18n/messages'
import { useStore } from '@/store/useStore'
import { AI_ACTIONS, type AiActionId } from './actions.js'
import {
  AiJobError,
  type AiBackendProvider,
  type AiJobHandle,
  type AiSubmitRequest,
} from './AiBackendProvider.js'
import { consentSubjectOf, hasConsent } from './consent.js'
import {
  actualCost,
  estimateCost,
  formatMoney,
  totalCost,
  type AiCostActual,
  type AiCostEstimate,
} from './cost.js'
import { isTerminal, type AiFailure, type AiJobResult, type AiJobSnapshot } from './jobModel.js'
import { aiStateLabel } from './strings.js'
import { resolveAiProvider, restoreAiJobs } from './registry.js'

/**
 * The jobs this browser has running, and what each one cost.
 *
 * The AI surface is a popover: it is unmounted the moment the user clicks
 * anywhere else. A job is not. So the state that outlives the panel lives
 * here — a store above the component, the same arrangement the sync queue
 * and the call UI already use — and the panel is a view onto it rather than
 * its owner.
 *
 * That separation is what makes three of this issue's requirements possible
 * at all: a completion can raise a notification while the panel is closed, a
 * running job keeps polling while the user works in another section, and
 * cancel is reachable from anywhere the panel can be reopened.
 *
 * ## Handles are not state
 *
 * `AiJobHandle` holds a poll loop, an abort controller and a promise; none
 * of that is serialisable and none of it belongs in a store React
 * re-renders from. The handles sit in a module-level map, keyed by job id,
 * and the store holds the snapshots they emit.
 */

export interface AiJobEntry {
  readonly snapshot: AiJobSnapshot
  readonly projectId: string
  /** What was quoted before it ran. Kept so the panel can show both numbers. */
  readonly estimate: AiCostEstimate | null
  /** What it actually cost, once the backend reported worker time. */
  readonly cost: AiCostActual | null
  readonly result?: AiJobResult
  readonly failure?: AiFailure
}

const handles = new Map<string, AiJobHandle>()
/** Job ids whose ending has already been announced, so it is announced once. */
const announced = new Set<string>()

export interface AiRunRequest extends AiSubmitRequest {
  /** The consent grant the caller is running on. See `consent.ts`. */
  readonly uploadConsent?: boolean
  /**
   * Only consider backends that send nothing off the device.
   *
   * What "use the offline generator instead" means, expressed as a
   * constraint on the resolution rather than as a named provider — so a
   * caller never has to know which providers exist.
   */
  readonly localOnly?: boolean
  readonly signal?: AbortSignal
}

interface AiJobsState {
  /** Newest first — the order the panel reads. */
  entries: AiJobEntry[]
  submit: (req: AiRunRequest) => Promise<AiJobResult>
  cancel: (jobId: string) => Promise<void>
  dismiss: (jobId: string) => void
  /** Reattach to jobs a previous page load left running. Idempotent. */
  restore: () => void
  clear: () => void
}

export const useAiJobs = create<AiJobsState>()((set, get) => ({
  entries: [],

  submit: async (req) => {
    const provider = resolveAiProvider(req.actionId, { localOnly: req.localOnly })
    const subject = consentSubjectOf(provider)
    /*
     * The store refuses rather than assuming. `uploadConsent` is the
     * caller's assertion about THIS request; the remembered grant is about
     * the recipient. A request with neither is a surface that skipped the
     * question, and the honest failure is the one the taxonomy already has
     * a sentence for.
     */
    if (subject && !req.uploadConsent && !hasConsent(subject)) {
      throw new AiJobError(
        'consent-required',
        `Nothing has been agreed for ${subject.destination} recipient ${subject.vendor}.`,
      )
    }

    const estimate = estimateCost(req.actionId, req.params)
    const handle = await provider.submit(req, {
      uploadConsent: req.uploadConsent ?? hasConsent(subject),
      signal: req.signal,
      onSnapshot: (snapshot) => track(set, snapshot),
    })
    handles.set(handle.jobId, handle)
    upsert(set, {
      snapshot: handle.snapshot(),
      projectId: req.projectId,
      estimate,
      cost: null,
    })

    try {
      const result = await handle.result()
      settle(set, get, handle.jobId, provider, { result })
      return result
    } catch (err) {
      const failure =
        err instanceof AiJobError
          ? err.failure
          : { reason: 'upstream-error' as const, detail: String(err) }
      settle(set, get, handle.jobId, provider, { failure })
      throw err
    } finally {
      handles.delete(handle.jobId)
    }
  },

  cancel: async (jobId) => {
    await handles.get(jobId)?.cancel()
  },

  dismiss: (jobId) => {
    handles.delete(jobId)
    announced.delete(jobId)
    set((s) => ({ entries: s.entries.filter((e) => e.snapshot.jobId !== jobId) }))
  },

  restore: () => {
    for (const handle of restoreAiJobs({ onSnapshot: (snapshot) => track(set, snapshot) })) {
      if (handles.has(handle.jobId)) continue
      handles.set(handle.jobId, handle)
      const snapshot = handle.snapshot()
      upsert(set, {
        snapshot,
        projectId: '',
        estimate: estimateCost(snapshot.actionId, {}),
        cost: null,
      })
      void handle
        .result()
        .then((result) => settle(set, get, handle.jobId, null, { result }))
        .catch((err: unknown) => {
          settle(set, get, handle.jobId, null, {
            failure:
              err instanceof AiJobError
                ? err.failure
                : { reason: 'upstream-error', detail: String(err) },
          })
        })
        .finally(() => handles.delete(handle.jobId))
    }
  },

  clear: () => {
    handles.clear()
    announced.clear()
    set({ entries: [] })
  },
}))

type Setter = (fn: (state: AiJobsState) => Partial<AiJobsState>) => void
type Getter = () => AiJobsState

function upsert(set: Setter, entry: AiJobEntry): void {
  set((s) => {
    const rest = s.entries.filter((e) => e.snapshot.jobId !== entry.snapshot.jobId)
    return { entries: [entry, ...rest] }
  })
}

/** Fold a snapshot into the entry it belongs to, creating nothing new. */
function track(set: Setter, snapshot: AiJobSnapshot): void {
  set((s) => ({
    entries: s.entries.map((e) =>
      e.snapshot.jobId === snapshot.jobId ? { ...e, snapshot } : e,
    ),
  }))
}

/**
 * The end of a job: record what it cost, then say so out loud exactly once.
 *
 * A generation that finishes while the user is in another project is the
 * same case as a finished conversion or a GitHub sync, so it takes the same
 * road — `NotificationService.notify`, which is where the user's
 * notification preferences are honoured (14.4) and therefore the only place
 * this is allowed to go.
 */
function settle(
  set: Setter,
  get: Getter,
  jobId: string,
  provider: AiBackendProvider | null,
  outcome: { result?: AiJobResult; failure?: AiFailure },
): void {
  const before = get().entries.find((e) => e.snapshot.jobId === jobId)
  if (!before) return

  const cost = outcome.result ? actualCost(before.snapshot.actionId, outcome.result.executionMs) : null
  const state = outcome.failure
    ? outcome.failure.reason === 'cancelled'
      ? ('cancelled' as const)
      : outcome.failure.reason === 'timed-out'
        ? ('timed-out' as const)
        : ('failed' as const)
    : ('succeeded' as const)

  set((s) => ({
    entries: s.entries.map((e) =>
      e.snapshot.jobId === jobId
        ? {
            ...e,
            snapshot: { ...e.snapshot, state, failure: outcome.failure },
            cost,
            result: outcome.result,
            failure: outcome.failure,
          }
        : e,
    ),
  }))

  if (announced.has(jobId)) return
  announced.add(jobId)

  const locale = useStore.getState().locale
  const t = messages[locale]
  const label = t.ai.actions[before.snapshot.actionId]
  const headline = outcome.failure ? t.ai.notifyFailed(label) : t.ai.notifyDone(label)
  const detail = outcome.failure
    ? t.ai.failure[outcome.failure.reason]
    : cost
      ? t.ai.notifyCost(formatMoney(locale, cost.amount), Math.round(cost.gpuSeconds))
      : provider?.disclosure.cost === 'your-key'
        ? t.ai.billedYourKey
        : t.ai.notifyNoWorkerTime

  notificationService.notify(before.projectId, 'ai-job', headline, detail)
  announce(`${headline}. ${aiStateLabel(t, state)}.`)
}

/**
 * What this browser has spent on AI since the app opened.
 *
 * A fact, not a budget: it is arithmetic on the worker seconds the backend
 * reported, and it is the only spend figure this phase can state without
 * inventing one. The ceiling it would be compared against arrives with 21.4;
 * until then the surface says there is none rather than implying a limit.
 */
export function spentThisSession(entries: readonly AiJobEntry[]): number {
  return totalCost(entries.map((e) => e.cost))
}

/** Jobs that have not finished. What the toolbar badge counts. */
export function activeEntries(entries: readonly AiJobEntry[]): AiJobEntry[] {
  return entries.filter((e) => !isTerminal(e.snapshot.state))
}

/**
 * Keep the toolbar's count in step with the store, from the one writer that
 * is allowed to. Subscribed at module scope rather than from a component,
 * because the badge has to be right while no AI component is mounted at all
 * — which is the entire case it exists for.
 */
useAiJobs.subscribe((state, prev) => {
  if (state.entries === prev.entries) return
  useAiActivity.getState().setRunning(activeEntries(state.entries).length)
})

/** The deadline the catalogue gives this action, for a progress bar with an end. */
export function deadlineOf(actionId: AiActionId): number {
  return AI_ACTIONS[actionId].deadlineMs
}
