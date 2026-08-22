import { beforeEach, describe, expect, it } from 'vitest'
import { bootScope, resetVaultScopeForTests } from '@/lib/storage/vaultScope'
import {
  BYOK_PROVIDERS,
  byokKey,
  byokProviderByVendorId,
  byokProvidersFor,
  byokStorageKey,
  clearAllByokKeys,
  configuredByokProviders,
  hasAnyByokKey,
  hasByokKey,
  setByokKey,
} from './byok'

/**
 * A key the user pasted is the most sensitive thing this feature touches, so
 * the tests are about where it can and cannot be reached from — not about
 * whether a setter sets.
 */

/** Boot the app "as" someone, the way `vaultScope`'s own suite does. */
function bootAs(accountId: string | null): void {
  resetVaultScopeForTests()
  if (accountId) localStorage.setItem('lattice-account', JSON.stringify({ id: accountId }))
  else localStorage.removeItem('lattice-account')
  bootScope()
}

beforeEach(() => {
  localStorage.clear()
  resetVaultScopeForTests()
})

describe('the key belongs to an account, not to a browser', () => {
  it('is invisible to the next account signed in on the same machine', () => {
    bootAs('usr_alice')
    setByokKey('gemini', 'alice-key')
    expect(byokKey('gemini')).toBe('alice-key')

    bootAs('usr_bob')
    // the whole point of #257: a second account resolves a different slot,
    // and a key is one of the things that used to leak across that line
    expect(byokKey('gemini')).toBe('')
    expect(hasByokKey('gemini')).toBe(false)

    bootAs('usr_alice')
    expect(byokKey('gemini')).toBe('alice-key')
  })

  it('writes under a namespaced name, and only there', () => {
    bootAs('usr_alice')
    setByokKey('gemini', 'alice-key')
    const written = Object.keys(localStorage).filter((k) => localStorage.getItem(k) === 'alice-key')
    expect(written).toEqual([byokStorageKey('gemini')])
    expect(byokStorageKey('gemini')).toContain(BYOK_PROVIDERS.gemini.storageBase)
  })

  /**
   * The name Photo mode wrote. Renaming it would silently log out every user
   * who has already pasted a key, with no error and no way to tell what
   * happened — so the storage moved and the name did not.
   */
  it('keeps the name the feature has been writing since Photo mode', () => {
    expect(BYOK_PROVIDERS.gemini.storageBase).toBe('lattice-photo-gemini-key')
  })
})

describe('adding and removing', () => {
  beforeEach(() => bootAs('usr_alice'))

  it('trims, because a pasted key usually arrives with whitespace', () => {
    setByokKey('gemini', '  a-key\n')
    expect(byokKey('gemini')).toBe('a-key')
  })

  it('treats an empty value as a removal rather than storing nothing', () => {
    setByokKey('gemini', 'a-key')
    setByokKey('gemini', '   ')
    expect(localStorage.getItem(byokStorageKey('gemini'))).toBeNull()
  })

  it('reports what the user actually holds', () => {
    expect(hasAnyByokKey()).toBe(false)
    expect(configuredByokProviders()).toEqual([])
    setByokKey('gemini', 'a-key')
    expect(hasAnyByokKey()).toBe(true)
    expect(configuredByokProviders().map((p) => p.id)).toEqual(['gemini'])
    clearAllByokKeys()
    expect(hasAnyByokKey()).toBe(false)
  })
})

describe('the registry', () => {
  it('says which key would unlock which action', () => {
    expect(byokProvidersFor('design-set').map((p) => p.id)).toEqual(['gemini'])
    // no vendor sells the deployment's GPU work on the user's own key today,
    // and claiming otherwise would offer a remedy that does not exist
    expect(byokProvidersFor('text-to-image')).toEqual([])
  })

  /**
   * The join between a stored key and a consent record. The provider's
   * disclosure files consent under a stable vendor id; without this the
   * settings panel would need a second table saying which key that id meant.
   */
  it('maps a consent record’s vendor id back to the key that pays for it', () => {
    expect(byokProviderByVendorId('google-gemini')?.id).toBe('gemini')
    expect(byokProviderByVendorId('someone-else')).toBeNull()
  })
})
