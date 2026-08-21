import { describe, expect, it } from 'vitest'
import {
  JITTER,
  RUNNING_REGIME,
  WAITING_REGIME,
  pollDelayMs,
  pollSchedule,
  regimeFor,
} from './backoff'

/** No jitter, so the shape of the series is what is under test. */
const flat = () => 0.5

describe('the polling schedule', () => {
  it('starts where the regime says and grows', () => {
    const waiting = pollSchedule('queued', 5)
    expect(waiting[0]).toBe(WAITING_REGIME.firstMs)
    for (let i = 1; i < waiting.length; i += 1) {
      expect(waiting[i]).toBeGreaterThanOrEqual(waiting[i - 1])
    }
  })

  it('never exceeds the cap, however long the wait runs', () => {
    for (const delay of pollSchedule('cold-start', 40)) {
      expect(delay).toBeLessThanOrEqual(WAITING_REGIME.capMs)
    }
    for (const delay of pollSchedule('running', 40)) {
      expect(delay).toBeLessThanOrEqual(RUNNING_REGIME.capMs)
    }
  })

  /**
   * The cost argument for the two regimes: a cold start is tens of seconds
   * of nothing, and polling it as often as a job that is producing pixels
   * buys requests rather than information.
   */
  it('polls a running job more often than a queued one', () => {
    const waiting = pollSchedule('queued', 12)
    const running = pollSchedule('running', 12)
    expect(running[0]).toBeLessThan(waiting[0])
    expect(running.at(-1)).toBeLessThan(waiting.at(-1) as number)
  })

  it('treats every waiting state as one regime and running as the other', () => {
    expect(regimeFor('queued')).toBe(WAITING_REGIME)
    expect(regimeFor('cold-start')).toBe(WAITING_REGIME)
    expect(regimeFor('running')).toBe(RUNNING_REGIME)
  })

  it('never asks for a tight loop', () => {
    for (const state of ['queued', 'cold-start', 'running'] as const) {
      expect(pollDelayMs(0, state, () => 0)).toBeGreaterThan(500)
    }
  })

  it('spreads the delay by the declared jitter and no further', () => {
    const base = pollDelayMs(3, 'queued', flat)
    const lowest = pollDelayMs(3, 'queued', () => 0)
    const highest = pollDelayMs(3, 'queued', () => 1)
    expect(lowest).toBeLessThan(base)
    expect(highest).toBeGreaterThan(base)
    expect(lowest).toBeGreaterThanOrEqual(Math.floor(base * (1 - JITTER)))
    expect(highest).toBeLessThanOrEqual(Math.ceil(base * (1 + JITTER)))
  })
})
