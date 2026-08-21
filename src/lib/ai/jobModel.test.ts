import { describe, expect, it } from 'vitest'
import {
  AI_FAILURES,
  AI_TERMINAL_STATES,
  canTransition,
  isTerminal,
  mayRetryAutomatically,
  stateForFailure,
  type AiFailureReason,
  type AiJobState,
} from './jobModel'
import {
  AI_ACTIONS,
  AI_ACTION_IDS,
  dataCarriedBy,
  defaultParams,
  invalidParams,
} from './actions'

const ALL_STATES: AiJobState[] = [
  'queued',
  'cold-start',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'timed-out',
]

describe('the job state machine', () => {
  it('lets a job move forward and never back', () => {
    expect(canTransition('queued', 'cold-start')).toBe(true)
    expect(canTransition('cold-start', 'running')).toBe(true)
    expect(canTransition('running', 'succeeded')).toBe(true)
    expect(canTransition('cold-start', 'queued')).toBe(false)
    expect(canTransition('running', 'queued')).toBe(false)
  })

  it('reaches a terminal state from every waiting state', () => {
    for (const from of ['queued', 'cold-start', 'running'] as AiJobState[]) {
      for (const to of AI_TERMINAL_STATES) {
        expect(canTransition(from, to)).toBe(true)
      }
    }
  })

  /**
   * The one that matters when a webhook and a poll race: whichever lands
   * second must not be able to reopen what the first closed.
   */
  it('makes terminal mean terminal', () => {
    for (const from of AI_TERMINAL_STATES) {
      expect(isTerminal(from)).toBe(true)
      for (const to of ALL_STATES) {
        if (to === from) continue
        expect(canTransition(from, to)).toBe(false)
      }
    }
  })

  it('treats a repeated observation of the same state as legal', () => {
    for (const state of ALL_STATES) expect(canTransition(state, state)).toBe(true)
  })

  it('reports the queue as running, not as finished', () => {
    expect(isTerminal('queued')).toBe(false)
    expect(isTerminal('cold-start')).toBe(false)
    expect(isTerminal('running')).toBe(false)
  })
})

describe('the failure taxonomy', () => {
  const REASONS = Object.keys(AI_FAILURES) as AiFailureReason[]

  it('gives every reason a retry stance', () => {
    for (const reason of REASONS) {
      expect(AI_FAILURES[reason].retry).toBeTruthy()
      expect(typeof AI_FAILURES[reason].billed).toBe('boolean')
    }
  })

  it('lands each reason in the terminal state that describes it', () => {
    expect(stateForFailure('cancelled')).toBe('cancelled')
    expect(stateForFailure('timed-out')).toBe('timed-out')
    expect(stateForFailure('no-credit')).toBe('failed')
    for (const reason of REASONS) expect(isTerminal(stateForFailure(reason))).toBe(true)
  })

  /**
   * The rule the whole retry policy hangs off: money makes retrying a
   * user's decision, so nothing that may already have run gets retried on
   * their behalf.
   */
  it('never retries anything that may already have been billed', () => {
    for (const reason of REASONS) {
      if (AI_FAILURES[reason].billed) expect(mayRetryAutomatically(reason)).toBe(false)
    }
  })

  it('does allow an automatic retry for something that never reached a worker', () => {
    expect(AI_FAILURES['no-capacity'].billed).toBe(false)
    expect(AI_FAILURES['not-configured'].billed).toBe(false)
  })

  it('tells the user to change something rather than to wait, where that is true', () => {
    expect(AI_FAILURES['input-too-large'].retry).toBe('after-change')
    expect(AI_FAILURES['invalid-parameters'].retry).toBe('after-change')
    expect(AI_FAILURES['no-capacity'].retry).toBe('later')
    expect(AI_FAILURES['no-credit'].retry).toBe('no')
  })
})

describe('the action catalogue', () => {
  it('declares a deadline and an input cap for every action', () => {
    for (const id of AI_ACTION_IDS) {
      const action = AI_ACTIONS[id]
      expect(action.deadlineMs).toBeGreaterThan(0)
      expect(action.maxInputBytes).toBeGreaterThanOrEqual(0)
    }
  })

  /**
   * Optional, and only for work a GPU backend could actually take. An
   * invented class on `design-set` would be a field that lies, and the
   * hosted provider reads exactly this to decide what it can run.
   */
  it('declares a GPU class only where a GPU backend could run the action', () => {
    for (const id of AI_ACTION_IDS) {
      const gpuClass = AI_ACTIONS[id].gpuClass
      if (gpuClass !== undefined) expect(['light', 'standard', 'heavy']).toContain(gpuClass)
    }
    expect(AI_ACTIONS['design-set'].gpuClass).toBeUndefined()
  })

  it('says what each action carries, derived from what it declares', () => {
    expect(dataCarriedBy('text-to-image')).toBe('prompt')
    expect(dataCarriedBy('upscale')).toBe('inputs')
    expect(dataCarriedBy('inpaint')).toBe('prompt-and-inputs')
    expect(dataCarriedBy('background-removal')).toBe('inputs')
    expect(dataCarriedBy('design-set')).toBe('prompt')
  })

  it('puts the cheap actions on the cheap hardware', () => {
    expect(AI_ACTIONS.upscale.gpuClass).toBe('light')
    expect(AI_ACTIONS['background-removal'].gpuClass).toBe('light')
    expect(AI_ACTIONS.inpaint.gpuClass).toBe('heavy')
  })

  it('accepts its own defaults', () => {
    for (const id of AI_ACTION_IDS) {
      expect(invalidParams(id, defaultParams(id))).toEqual([])
    }
  })

  it('rejects an out-of-range number, an unknown key and a wrong type', () => {
    expect(invalidParams('text-to-image', { steps: 999 })).toEqual(['steps'])
    expect(invalidParams('text-to-image', { nope: 1 })).toEqual(['nope'])
    expect(invalidParams('text-to-image', { steps: 'lots' })).toEqual(['steps'])
    expect(invalidParams('upscale', { scale: '3' })).toEqual(['scale'])
  })

  it('carries no vendor field anywhere in it', () => {
    const serialised = JSON.stringify(AI_ACTIONS).toLowerCase()
    for (const vendor of ['runpod', 'comfy', 'endpoint', 'api.runpod.ai']) {
      expect(serialised).not.toContain(vendor)
    }
  })
})
