import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APPEARANCE,
  UI_SCALE_FACTOR,
  appearanceAttributes,
  motionReduced,
  resolveTheme,
} from './appearance'

describe('resolveTheme', () => {
  it('follows the system when asked to', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('ignores the system once the user has chosen', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('motionReduced', () => {
  it('defers to the operating system by default', () => {
    expect(motionReduced('system', true)).toBe(true)
    expect(motionReduced('system', false)).toBe(false)
  })

  it('lets the app ask for less motion than the system does', () => {
    expect(motionReduced('reduce', false)).toBe(true)
  })

  it('never argues with an OS that already asked for less', () => {
    // there is no preference that turns motion back ON against the system
    expect(motionReduced('system', true)).toBe(true)
    expect(motionReduced('reduce', true)).toBe(true)
  })
})

describe('appearanceAttributes', () => {
  it('writes what the stylesheet keys off', () => {
    expect(
      appearanceAttributes(
        { ...DEFAULT_APPEARANCE, contrast: 'high', density: 'compact' },
        { theme: 'light', motionReduced: true },
      ),
    ).toEqual({ theme: 'light', contrast: 'high', density: 'compact', motion: 'reduce' })
  })

  it('reports the resolved theme, not the preference', () => {
    const attrs = appearanceAttributes(DEFAULT_APPEARANCE, {
      theme: 'dark',
      motionReduced: false,
    })
    expect(attrs.theme).toBe('dark')
    expect(attrs.motion).toBe('full')
  })
})

describe('UI scale', () => {
  it('leaves the default untouched and steps either side of it', () => {
    expect(UI_SCALE_FACTOR.default).toBe(1)
    expect(UI_SCALE_FACTOR.small).toBeLessThan(1)
    expect(UI_SCALE_FACTOR.large).toBeGreaterThan(1)
  })
})
