import { describe, expect, it } from 'vitest'
import {
  AUTO_CONVERT_MAX_BYTES,
  describeVideoConversion,
  eligibleForAutoConvert,
  thumbnailArgs,
  transcodeArgs,
} from './videoConversion'

describe('eligibleForAutoConvert', () => {
  it('accepts a file under the auto-convert ceiling', () => {
    expect(eligibleForAutoConvert({ size: 10 * 1024 * 1024 })).toEqual({ eligible: true })
  })

  it('accepts a file exactly at the ceiling', () => {
    expect(eligibleForAutoConvert({ size: AUTO_CONVERT_MAX_BYTES }).eligible).toBe(true)
  })

  it('rejects a file over the ceiling, with a human reason', () => {
    const res = eligibleForAutoConvert({ size: AUTO_CONVERT_MAX_BYTES + 1 })
    expect(res.eligible).toBe(false)
    if (!res.eligible) {
      expect(res.reason).toMatch(/150 MB/)
      expect(res.reason).toMatch(/kept as uploaded/)
    }
  })
})

describe('transcodeArgs', () => {
  it('targets H.264/AAC MP4 with web-safe flags', () => {
    const args = transcodeArgs('input.mov', 'output.mp4')
    expect(args).toContain('libx264')
    expect(args).toContain('aac')
    expect(args).toContain('yuv420p')
    expect(args).toContain('+faststart')
    expect(args[args.length - 1]).toBe('output.mp4')
    expect(args.slice(0, 2)).toEqual(['-i', 'input.mov'])
  })
})

describe('thumbnailArgs', () => {
  it('seeks before the input and takes exactly one frame', () => {
    const args = thumbnailArgs('input.mp4', 'thumb.jpg', 1)
    const seekIdx = args.indexOf('-ss')
    const inputIdx = args.indexOf('-i')
    expect(seekIdx).toBeGreaterThanOrEqual(0)
    expect(seekIdx).toBeLessThan(inputIdx) // seeking before -i, for fast demux-level seek
    expect(args).toContain('1')
    expect(args).toContain('-frames:v')
    expect(args[args.length - 1]).toBe('thumb.jpg')
  })

  it('honours the requested seek time', () => {
    expect(thumbnailArgs('a.mp4', 'b.jpg', 0)).toContain('0')
  })
})

describe('describeVideoConversion', () => {
  it('is empty when there is no state', () => {
    expect(describeVideoConversion(undefined)).toBe('')
  })

  it('describes queued and converting (with and without progress)', () => {
    expect(describeVideoConversion({ status: 'queued' })).toMatch(/Queued/)
    expect(describeVideoConversion({ status: 'converting' })).toBe('Converting…')
    expect(describeVideoConversion({ status: 'converting', progress: 0.42 })).toBe(
      'Converting… 42%',
    )
  })

  it('describes done, skipped and error', () => {
    expect(describeVideoConversion({ status: 'done' })).toMatch(/Converted/)
    expect(describeVideoConversion({ status: 'skipped', skippedReason: 'too big' })).toBe(
      'too big',
    )
    expect(describeVideoConversion({ status: 'skipped' })).toMatch(/skipped/)
    expect(describeVideoConversion({ status: 'error', error: 'boom' })).toBe(
      'Conversion failed: boom',
    )
    expect(describeVideoConversion({ status: 'error' })).toBe('Conversion failed')
  })
})
