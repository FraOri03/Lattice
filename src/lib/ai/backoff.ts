import type { AiJobState } from './jobModel.js'

/**
 * The polling schedule.
 *
 * Every poll of a serverless endpoint is a request, and requests to a paid
 * endpoint are a cost line. So the interval is a decision with a number
 * behind it rather than a `setInterval(1000)` nobody revisits, and the
 * numbers are written down here and in `docs/architecture/ai.md` so they
 * can be argued with.
 *
 * ## The two regimes
 *
 * **Waiting** (`queued`, `cold-start`) — nothing is happening yet and there
 * is nothing to report but the wait itself. Start at 1.5 s so a job that
 * lands on a warm worker still feels immediate, then back off hard: a cold
 * start costs tens of seconds and polling it every second buys nothing but
 * requests.
 *
 * **Running** — there is progress to show, and the whole job is thirty to
 * sixty seconds. Poll faster and cap lower, because here the poll is the
 * progress bar.
 *
 * ## Jitter
 *
 * Multiplied, not added, and applied to every delay. Several tabs of the
 * same account reloading after a deploy would otherwise poll in lockstep
 * forever, and the point of backing off is undone by everyone doing it at
 * the same instant.
 */

export interface PollRegime {
  readonly firstMs: number
  readonly factor: number
  readonly capMs: number
}

export const WAITING_REGIME: PollRegime = { firstMs: 1_500, factor: 1.6, capMs: 8_000 }
export const RUNNING_REGIME: PollRegime = { firstMs: 1_000, factor: 1.35, capMs: 4_000 }

/** Plus or minus 15% — enough to break lockstep, small enough to stay honest. */
export const JITTER = 0.15

export function regimeFor(state: AiJobState): PollRegime {
  return state === 'running' ? RUNNING_REGIME : WAITING_REGIME
}

/**
 * How long to wait before the next poll.
 *
 * `attempt` counts polls already made *in the current regime*, so a job
 * that moves from `cold-start` to `running` restarts at the running
 * regime's first interval instead of inheriting a delay earned while
 * nothing was happening.
 *
 * `random` is injected so the schedule is testable; it defaults to
 * `Math.random` and is never seeded in production.
 */
export function pollDelayMs(
  attempt: number,
  state: AiJobState,
  random: () => number = Math.random,
): number {
  const regime = regimeFor(state)
  const raw = regime.firstMs * Math.pow(regime.factor, Math.max(0, attempt))
  const capped = Math.min(raw, regime.capMs)
  const spread = 1 + (random() * 2 - 1) * JITTER
  return Math.round(capped * spread)
}

/**
 * The un-jittered schedule, for documenting and for asserting on.
 *
 * `pollDelayMs` is the function that runs; this is the same series with the
 * randomness removed, so a test can state the shape without stubbing
 * `Math.random` and the doc can quote real numbers.
 */
export function pollSchedule(state: AiJobState, count: number): number[] {
  return Array.from({ length: count }, (_, i) => pollDelayMs(i, state, () => 0.5))
}
