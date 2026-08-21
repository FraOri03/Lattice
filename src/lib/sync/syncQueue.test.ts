import { beforeEach, describe, expect, it } from 'vitest'
import {
  jobPercent,
  summarize,
  syncQueue,
  useSyncQueue,
  type NewSyncJob,
  type SyncJob,
} from './syncQueue'

/**
 * The queue the sync overlay reads. What is worth pinning here is not the
 * bookkeeping but the honesty rules: a percentage exists only when something
 * measured it, and a settled row never displaces one still in flight.
 */

const job = (over: Partial<NewSyncJob> = {}): NewSyncJob => ({
  key: 'upload:doc:d1',
  kind: 'doc',
  direction: 'upload',
  label: 'Notes',
  file: 'd1.json',
  ...over,
})

const find = (key: string): SyncJob => {
  const found = useSyncQueue.getState().jobs.find((j) => j.key === key)
  if (!found) throw new Error(`no job ${key}`)
  return found
}

beforeEach(() => {
  useSyncQueue.setState({ jobs: [], runStartedAt: null, runEndedAt: null })
})

describe('jobPercent', () => {
  it('is null while a transfer has no measurable size', () => {
    syncQueue.add(job())
    syncQueue.start('upload:doc:d1')
    expect(jobPercent(find('upload:doc:d1'))).toBeNull()
  })

  it('is the measured ratio once the transfer reports one', () => {
    syncQueue.add(job())
    syncQueue.start('upload:doc:d1')
    syncQueue.track('upload:doc:d1')(512, 1024)
    expect(jobPercent(find('upload:doc:d1'))).toBe(0.5)
  })

  it('never exceeds 1, even when the wire size undercounts the payload', () => {
    // a gzipped response: Content-Length is smaller than what arrives
    syncQueue.add(job({ key: 'download:doc:d1', direction: 'download' }))
    syncQueue.start('download:doc:d1')
    syncQueue.track('download:doc:d1')(4000, 1000)
    expect(jobPercent(find('download:doc:d1'))).toBe(1)
  })

  it('is 1 when done and null for outcomes that moved nothing', () => {
    syncQueue.add(job())
    syncQueue.add(job({ key: 'upload:code:c1', kind: 'code' }))
    syncQueue.add(job({ key: 'upload:sheet:s1', kind: 'sheet' }))
    syncQueue.start('upload:doc:d1')
    syncQueue.done('upload:doc:d1')
    syncQueue.fail('upload:code:c1', 'Drive API 429')
    syncQueue.skip('upload:sheet:s1', 'no-local-copy')
    expect(jobPercent(find('upload:doc:d1'))).toBe(1)
    expect(jobPercent(find('upload:code:c1'))).toBeNull()
    expect(jobPercent(find('upload:sheet:s1'))).toBeNull()
  })
})

describe('progress', () => {
  it('ignores sub-percent steps, so a big upload does not re-render per packet', () => {
    syncQueue.add(job({ total: 1_000_000 }))
    syncQueue.start('upload:doc:d1')
    const tick = syncQueue.track('upload:doc:d1')
    tick(500_000, 1_000_000)
    const before = useSyncQueue.getState().jobs
    tick(500_100, 1_000_000) // +0.01%
    expect(useSyncQueue.getState().jobs).toBe(before)
    tick(520_000, 1_000_000) // +2%
    expect(useSyncQueue.getState().jobs).not.toBe(before)
  })

  it('always lets the final byte land', () => {
    syncQueue.add(job({ total: 1_000_000 }))
    syncQueue.start('upload:doc:d1')
    const tick = syncQueue.track('upload:doc:d1')
    tick(999_000, 1_000_000)
    tick(1_000_000, 1_000_000)
    expect(jobPercent(find('upload:doc:d1'))).toBe(1)
  })

  it('is ignored for a job that is not running', () => {
    syncQueue.add(job())
    syncQueue.track('upload:doc:d1')(10, 100) // still queued
    expect(find('upload:doc:d1').loaded).toBe(0)
  })
})

describe('summarize', () => {
  it('counts settled files whole and running ones by what they have moved', () => {
    syncQueue.add(job())
    syncQueue.add(job({ key: 'upload:code:c1', kind: 'code' }))
    syncQueue.start('upload:doc:d1')
    syncQueue.done('upload:doc:d1')
    syncQueue.start('upload:code:c1')
    syncQueue.track('upload:code:c1')(250, 1000)

    const s = summarize(useSyncQueue.getState().jobs)
    expect(s).toMatchObject({ total: 2, settled: 1, active: 1, failed: 0 })
    expect(s.percent).toBeCloseTo(0.625)
  })

  it('counts a failure as settled — the run is not still waiting on it', () => {
    syncQueue.add(job())
    syncQueue.start('upload:doc:d1')
    syncQueue.fail('upload:doc:d1', 'Drive API 403')
    expect(summarize(useSyncQueue.getState().jobs)).toMatchObject({
      settled: 1,
      failed: 1,
      percent: 1,
    })
  })
})

describe('runs', () => {
  it('opens empty, so a run that died mid-way strands nothing', () => {
    syncQueue.add(job())
    syncQueue.add(job({ key: 'upload:asset:a1', kind: 'asset' }))
    syncQueue.start('upload:doc:d1')
    syncQueue.fail('upload:doc:d1', 'Drive API 500')
    // upload:asset:a1 never got its turn — the run threw before reaching it

    syncQueue.beginRun()
    expect(useSyncQueue.getState().jobs).toEqual([])
    expect(useSyncQueue.getState().runEndedAt).toBeNull()
  })

  it('re-queues a key already settled instead of stacking a duplicate row', () => {
    syncQueue.add(job())
    syncQueue.start('upload:doc:d1')
    syncQueue.done('upload:doc:d1')
    syncQueue.add(job())
    expect(useSyncQueue.getState().jobs).toHaveLength(1)
    expect(find('upload:doc:d1').status).toBe('queued')
  })

  it('drops the oldest settled rows once the list outgrows its ceiling', () => {
    for (let i = 0; i < 260; i++) {
      const key = `upload:doc:d${i}`
      syncQueue.add(job({ key }))
      // leave the last ten in flight
      if (i < 250) {
        syncQueue.start(key)
        syncQueue.done(key)
      }
    }
    const jobs = useSyncQueue.getState().jobs
    expect(jobs).toHaveLength(250)
    // nothing unfinished was evicted
    expect(jobs.filter((j) => j.status === 'queued')).toHaveLength(10)
    expect(jobs.some((j) => j.key === 'upload:doc:d0')).toBe(false)
  })

  it('clears settled rows on demand and leaves the rest alone', () => {
    syncQueue.add(job())
    syncQueue.add(job({ key: 'upload:asset:a1', kind: 'asset' }))
    syncQueue.start('upload:doc:d1')
    syncQueue.done('upload:doc:d1')
    useSyncQueue.getState().clearSettled()
    expect(useSyncQueue.getState().jobs.map((j) => j.key)).toEqual(['upload:asset:a1'])
  })
})
