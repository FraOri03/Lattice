import { AiJobError, type AiJobHandle, type AiSubmitOptions } from './AiBackendProvider.js'
import type { AiActionId } from './actions.js'
import type { AiJobResult, AiJobSnapshot } from './jobModel.js'

/**
 * A job handle for a backend that answers in one round trip.
 *
 * The seam was designed around a GPU worker — submit, then poll — and the
 * first thing the Photo mode migration asked of it was whether a backend
 * that simply *answers* could be expressed in the same terms. It can, and
 * this is the whole of the adaptation: `running` immediately, then a
 * terminal state, with the same abort, the same deadline and the same
 * failure taxonomy as a job that queues for a minute.
 *
 * That is worth more than the twenty lines it costs. A caller does not have
 * to know whether the backend behind an action polls, and 21.6's local
 * ComfyUI and 21.9's fake provider both get this for free.
 *
 * There is no cancellation to send anywhere: the request is either in
 * flight, in which case the abort signal ends it, or it is finished. So
 * `cancel()` aborts locally and settles, and no `cold-start` state is ever
 * reported, because there is no worker to wait for.
 */
export function immediateJob(args: {
  readonly jobId: string
  readonly actionId: AiActionId
  readonly deadlineMs: number
  /** Does the work. Must honour the signal it is handed. */
  readonly run: (signal: AbortSignal) => Promise<AiJobResult>
  readonly opts: AiSubmitOptions
}): AiJobHandle {
  const { jobId, actionId, deadlineMs, run, opts } = args
  const submittedAt = Date.now()
  const deadlineAt = submittedAt + deadlineMs

  let current: AiJobSnapshot = {
    jobId,
    actionId,
    state: 'running',
    progress: 0,
    submittedAt,
    deadlineAt,
  }
  let settled = false

  const controller = new AbortController()
  const onCallerAbort = () => controller.abort()
  opts.signal?.addEventListener('abort', onCallerAbort)
  const timer = setTimeout(() => controller.abort(), deadlineMs)

  const emit = (next: AiJobSnapshot) => {
    current = next
    opts.onSnapshot?.(next)
  }
  emit(current)

  const finish = () => {
    settled = true
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onCallerAbort)
  }

  const promise = run(controller.signal).then(
    (result) => {
      if (settled) return result
      finish()
      emit({ ...current, state: 'succeeded', progress: 1 })
      return result
    },
    (err: unknown) => {
      if (settled) throw err
      finish()
      const failure = asJobError(err, controller.signal.aborted, Date.now() > deadlineAt)
      emit({ ...current, state: failure.state, failure: failure.failure })
      throw failure
    },
  )
  // Nobody may be awaiting yet; an unhandled rejection in the meantime would
  // be reported as a crash for a job that is being handled perfectly well.
  promise.catch(() => {})

  return {
    jobId,
    snapshot: () => current,
    result: () => promise,
    cancel: async () => {
      controller.abort()
    },
  }
}

/**
 * Whatever went wrong, in the taxonomy's terms.
 *
 * The deadline check comes first because an abort caused by the timer and
 * an abort caused by the user are the same `AbortError`, and telling the
 * two apart is the difference between "you cancelled this" and "this took
 * too long" — which is the whole reason `timed-out` is a separate state.
 */
function asJobError(err: unknown, aborted: boolean, pastDeadline: boolean): AiJobError {
  if (err instanceof AiJobError) return err
  if (aborted) {
    return pastDeadline
      ? new AiJobError('timed-out', 'The request outran the action deadline.')
      : new AiJobError('cancelled', 'The caller aborted the request.')
  }
  return new AiJobError(
    'upstream-error',
    err instanceof Error ? err.message : 'The backend failed without saying why.',
  )
}
