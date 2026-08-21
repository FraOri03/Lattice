import type { Catalog } from '@/lib/i18n/messages'
import { AI_FAILURES, type AiFailure, type AiJobState } from './jobModel.js'

/**
 * Turning a job into sentences.
 *
 * The seam carries codes, not prose: `AiFailure` holds a machine-readable
 * reason and an English detail meant for a bug report. Everything a person
 * reads is looked up here, in EN and IT, so a new failure branch cannot
 * reach the screen without a translation — the compiler refuses a `Catalog`
 * that is missing a key.
 *
 * The pairing of *what happened* with *is it worth trying again* is the
 * whole point. A message that says only "the job failed" leaves the user
 * with one option, refreshing, and no idea whether it will help.
 */

const STATE_KEY = {
  queued: 'queued',
  'cold-start': 'coldStart',
  running: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
  cancelled: 'cancelled',
  'timed-out': 'timedOut',
} as const satisfies Record<AiJobState, keyof Catalog['ai']['state']>

export function aiStateLabel(t: Catalog, state: AiJobState): string {
  return t.ai.state[STATE_KEY[state]]
}

/** What happened, in the reader's language. Never a status code. */
export function aiFailureSentence(t: Catalog, failure: AiFailure): string {
  return t.ai.failure[failure.reason]
}

/** Whether retrying is sensible, and why not when it is not. */
export function aiRetrySentence(t: Catalog, failure: AiFailure): string {
  return t.ai.retryStance[AI_FAILURES[failure.reason].retry]
}

/**
 * The two together, plus the warning that matters most: a failure that may
 * already have been billed is never retried on the user's behalf.
 */
export function aiFailureMessage(t: Catalog, failure: AiFailure): string {
  const parts = [aiFailureSentence(t, failure), aiRetrySentence(t, failure)]
  if (AI_FAILURES[failure.reason].billed) parts.push(t.ai.billedWarning)
  return parts.join(' ')
}
