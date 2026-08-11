import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_SECTIONS,
  isSettingsSection,
  resolveSettingsSection,
} from './sections'

describe('settings sections', () => {
  it('keeps the order the side navigation renders', () => {
    expect([...SETTINGS_SECTIONS]).toEqual([
      'account',
      'profile',
      'appearance',
      'notifications',
      'security',
      'connections',
      'storage',
      'billing',
      'developer',
    ])
  })

  it('opens on the first section by default', () => {
    expect(DEFAULT_SETTINGS_SECTION).toBe(SETTINGS_SECTIONS[0])
  })

  it.each(SETTINGS_SECTIONS)('accepts %s', (section) => {
    expect(isSettingsSection(section)).toBe(true)
  })

  it.each([undefined, null, '', 'Account', 'plans', 'unknown'])(
    'rejects %s',
    (value) => {
      expect(isSettingsSection(value)).toBe(false)
    },
  )

  it('degrades a stale link to the default rather than refusing it', () => {
    // a link that named a section we since renamed is still a request to see
    // settings, so it opens — it just opens somewhere real
    expect(resolveSettingsSection('plans')).toBe(DEFAULT_SETTINGS_SECTION)
    expect(resolveSettingsSection(undefined)).toBe(DEFAULT_SETTINGS_SECTION)
  })

  it('keeps a known section untouched', () => {
    expect(resolveSettingsSection('appearance')).toBe('appearance')
  })
})
