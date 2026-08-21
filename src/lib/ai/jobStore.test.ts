import { beforeEach, describe, expect, it } from 'vitest'
import {
  AI_JOBS_KEY,
  activeAiJobs,
  clearAiJobs,
  forgetAiJob,
  loadAiJobs,
  rememberAiJob,
  updateAiJob,
  type PersistedAiJob,
} from './jobStore'

const NOW = 1_700_000_000_000

function job(overrides: Partial<PersistedAiJob> = {}): PersistedAiJob {
  return {
    jobId: 'job-1',
    ticket: 'v1.standard.9999999999999.sig',
    actionId: 'text-to-image',
    state: 'running',
    submittedAt: NOW,
    deadlineAt: NOW + 180_000,
    ...overrides,
  }
}

beforeEach(() => {
  clearAiJobs()
})

describe('remembering a job across a reload', () => {
  it('survives being written and read back', () => {
    rememberAiJob(job())
    expect(activeAiJobs(NOW + 1_000)).toEqual([job()])
  })

  it('replaces rather than duplicates the same job', () => {
    rememberAiJob(job())
    rememberAiJob(job({ state: 'queued' }))
    const stored = loadAiJobs()
    expect(stored).toHaveLength(1)
    expect(stored[0].state).toBe('queued')
  })

  it('records a state change so a reload reconnects where it left off', () => {
    rememberAiJob(job({ state: 'queued' }))
    updateAiJob('job-1', 'cold-start')
    expect(activeAiJobs(NOW + 1_000)[0].state).toBe('cold-start')
  })

  /**
   * A finished job has nothing to reattach to, and keeping it would have
   * the next page load poll a job id RunPod has already forgotten.
   */
  it('forgets a job the moment it reaches a terminal state', () => {
    rememberAiJob(job())
    updateAiJob('job-1', 'succeeded')
    expect(loadAiJobs()).toEqual([])
  })

  it('drops a job that outlived its deadline', () => {
    rememberAiJob(job())
    expect(activeAiJobs(NOW + 180_000 + 120_000)).toEqual([])
  })

  it('keeps a job that is merely slow', () => {
    rememberAiJob(job())
    expect(activeAiJobs(NOW + 179_000)).toHaveLength(1)
  })

  it('forgets one job without touching the others', () => {
    rememberAiJob(job())
    rememberAiJob(job({ jobId: 'job-2' }))
    forgetAiJob('job-1')
    expect(loadAiJobs().map((j) => j.jobId)).toEqual(['job-2'])
  })
})

describe('reading a vault that has been tampered with', () => {
  it('treats unparseable contents as no jobs rather than throwing on boot', () => {
    localStorage.setItem(AI_JOBS_KEY, '{not json')
    expect(loadAiJobs()).toEqual([])
  })

  it('discards entries that are not jobs', () => {
    localStorage.setItem(AI_JOBS_KEY, JSON.stringify([job(), { jobId: 42 }, null, 'nope']))
    expect(loadAiJobs()).toHaveLength(1)
  })

  it('discards an entry naming an action this build does not have', () => {
    localStorage.setItem(AI_JOBS_KEY, JSON.stringify([{ ...job(), actionId: 'summon-a-pony' }]))
    expect(loadAiJobs()).toEqual([])
  })
})
