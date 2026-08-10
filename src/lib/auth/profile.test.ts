import { describe, expect, it } from 'vitest'
import {
  applyProfilePatch,
  initialsOf,
  mergeProviderProfile,
  MAX_DISPLAY_NAME,
} from './profile'
import type { Account } from '@/types/model'

const base = (patch: Partial<Account> = {}): Account => ({
  id: 'acc_1',
  name: 'Francesco Ori',
  email: 'francesco@example.com',
  avatarUrl: 'https://provider/pic.png',
  providers: ['google'],
  providerProfile: { name: 'Francesco Ori', avatarUrl: 'https://provider/pic.png' },
  createdAt: 1,
  updatedAt: 1,
  ...patch,
})

describe('applyProfilePatch', () => {
  it('takes the name over from the provider', () => {
    const next = applyProfilePatch(base(), { name: 'Fra' })
    expect(next.name).toBe('Fra')
    expect(next.nameOverridden).toBe(true)
  })

  it('does not count re-typing the provider name as an override', () => {
    const next = applyProfilePatch(base(), { name: '  Francesco Ori  ' })
    expect(next.name).toBe('Francesco Ori')
    expect(next.nameOverridden).toBe(false)
  })

  it('reads an empty name as "go back to the provider"', () => {
    const overridden = base({ name: 'Fra', nameOverridden: true })
    const next = applyProfilePatch(overridden, { name: '   ' })
    expect(next.name).toBe('Francesco Ori')
    expect(next.nameOverridden).toBe(false)
  })

  it('keeps the current name when there is no provider to fall back to', () => {
    const local = base({ providerProfile: undefined, name: 'Local User', providers: ['mock'] })
    expect(applyProfilePatch(local, { name: '' }).name).toBe('Local User')
  })

  it('caps a display name rather than storing a paragraph', () => {
    const next = applyProfilePatch(base(), { name: 'x'.repeat(200) })
    expect(next.name).toHaveLength(MAX_DISPLAY_NAME)
  })

  it('clears the avatar back to the provider picture', () => {
    const overridden = base({ avatarUrl: 'data:image/png;base64,AAA', avatarOverridden: true })
    const next = applyProfilePatch(overridden, { avatarUrl: null })
    expect(next.avatarUrl).toBe('https://provider/pic.png')
    expect(next.avatarOverridden).toBe(false)
  })

  it('stores the usage type without touching anything else', () => {
    const next = applyProfilePatch(base(), { usageType: 'work' })
    expect(next.usageType).toBe('work')
    expect(next.name).toBe('Francesco Ori')
  })
})

describe('mergeProviderProfile', () => {
  const incoming = base({ name: 'Francesco Ori', avatarUrl: 'https://provider/new.png' })
  const provider = { name: 'Francesco Ori', avatarUrl: 'https://provider/new.png' }

  it('signing in again does not undo the name you chose', () => {
    const existing = base({ name: 'Fra', nameOverridden: true })
    const merged = mergeProviderProfile(existing, incoming, provider)
    expect(merged.name).toBe('Fra')
    // …and it still knows what Google says, so the override can be undone
    expect(merged.providerProfile).toEqual(provider)
  })

  it('lets the provider drive the name while it has not been taken over', () => {
    const existing = base({ name: 'Old Name' })
    const merged = mergeProviderProfile(existing, incoming, provider)
    expect(merged.name).toBe('Francesco Ori')
    expect(merged.nameOverridden).toBe(false)
  })

  it('keeps an overridden avatar and carries the usage type across', () => {
    const existing = base({
      avatarUrl: 'data:image/png;base64,AAA',
      avatarOverridden: true,
      usageType: 'education',
    })
    const merged = mergeProviderProfile(existing, incoming, provider)
    expect(merged.avatarUrl).toBe('data:image/png;base64,AAA')
    expect(merged.usageType).toBe('education')
  })

  it('works for a first sign-in with nothing stored', () => {
    const merged = mergeProviderProfile(null, incoming, provider)
    expect(merged.name).toBe('Francesco Ori')
    expect(merged.nameOverridden).toBe(false)
  })
})

describe('initialsOf', () => {
  it.each([
    ['Francesco Ori', 'FO'],
    ['madonna', 'M'],
    ['  Ada  Byron  Lovelace ', 'AL'],
    ['', '?'],
  ])('%s → %s', (name, expected) => {
    expect(initialsOf(name)).toBe(expected)
  })
})
