import { describe, expect, it } from 'vitest'
import { BUILD_EPOCH_MS, buildNumber, commitRef, composeVersion } from './buildStamp'

/**
 * The whole point of this module is a number that only ever goes up. If it
 * repeats, two different production deploys claim the same version and the
 * next bug report is unattributable — so monotonicity is the test, not the
 * formatting.
 */

describe('buildNumber', () => {
  it('grows with time', () => {
    const early = buildNumber(BUILD_EPOCH_MS + 60_000)
    const later = buildNumber(BUILD_EPOCH_MS + 120_000)
    expect(later).toBeGreaterThan(early)
  })

  it('advances once a minute', () => {
    expect(buildNumber(BUILD_EPOCH_MS)).toBe(0)
    expect(buildNumber(BUILD_EPOCH_MS + 59_999)).toBe(0)
    expect(buildNumber(BUILD_EPOCH_MS + 60_000)).toBe(1)
  })

  it('never goes negative for a clock set before the epoch', () => {
    expect(buildNumber(BUILD_EPOCH_MS - 86_400_000)).toBe(0)
  })
})

describe('composeVersion', () => {
  it('keeps major.minor from the declared version and replaces the tail', () => {
    expect(composeVersion('0.8.0', 833760)).toBe('0.8.833760')
    expect(composeVersion('1.2.7', 5)).toBe('1.2.5')
  })

  it('accepts a two-part declared version', () => {
    expect(composeVersion('2.0', 41)).toBe('2.0.41')
  })

  it('leaves a version it cannot read alone rather than mangling it', () => {
    expect(composeVersion('nightly', 41)).toBe('nightly')
    expect(composeVersion('', 41)).toBe('')
  })
})

describe('commitRef', () => {
  it('shortens whichever CI sha is present', () => {
    expect(commitRef({ VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890' })).toBe('abcdef1')
    expect(commitRef({ GITHUB_SHA: 'fedcba0987654321' })).toBe('fedcba0')
  })

  it('says so plainly when there is no CI', () => {
    expect(commitRef({})).toBe('local')
  })
})
