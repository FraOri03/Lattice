import { beforeEach, describe, expect, it } from 'vitest'
import {
  adoptGuestVault,
  bootScope,
  GUEST_SCOPE,
  resetVaultScopeForTests,
  vaultKey,
} from './vaultScope'

/**
 * The bug this module exists for: sign out of one Google account, sign in
 * with another, and the dashboard still lists the first account's projects.
 * Every persisted name was per-ORIGIN, so there was one vault per browser
 * and the second account simply inherited it — then the sync engine pushed
 * it to their Drive.
 */

/**
 * Boot the app "as" someone. The trailing read is not incidental: in the app
 * the slot is claimed by the first `vaultKey` call, which happens while the
 * store modules are still being imported.
 */
function bootAs(accountId: string | null): void {
  resetVaultScopeForTests()
  if (accountId) {
    localStorage.setItem('lattice-account', JSON.stringify({ id: accountId }))
  } else {
    localStorage.removeItem('lattice-account')
  }
  bootScope()
}

beforeEach(() => {
  localStorage.clear()
  resetVaultScopeForTests()
})

describe('vaultScope', () => {
  it('gives two accounts two different vaults', () => {
    bootAs('usr_alice')
    const alice = vaultKey('lattice-vault-v1')

    bootAs('usr_bob')
    const bob = vaultKey('lattice-vault-v1')

    expect(bob).not.toBe(alice)
  })

  it('leaves the existing install exactly where it is', () => {
    // the build before namespacing wrote here, and this person is signed in
    localStorage.setItem('lattice-vault-v1', '{"state":{}}')
    bootAs('usr_alice')

    // the unsuffixed keys are claimed, not abandoned: no migration, no copy
    expect(vaultKey('lattice-vault-v1')).toBe('lattice-vault-v1')
    expect(localStorage.getItem(vaultKey('lattice-vault-v1'))).toBe('{"state":{}}')
  })

  it('does not hand the legacy vault to the second account too', () => {
    bootAs('usr_alice')
    expect(vaultKey('lattice-vault-v1')).toBe('lattice-vault-v1')

    bootAs('usr_bob')
    expect(vaultKey('lattice-vault-v1')).toBe('lattice-vault-v1::usr_bob')
  })

  it('scopes every storage name, not just the vault', () => {
    bootAs('usr_alice')
    bootAs('usr_bob')

    for (const base of [
      'lattice-vault-v1',
      'lattice-vault-blobs',
      'lattice-sync-meta',
      'lattice-collab-v1',
      'lattice-github-token',
    ]) {
      expect(vaultKey(base)).toBe(`${base}::usr_bob`)
    }
  })

  it('reads guest when nobody is signed in', () => {
    bootAs(null)
    expect(bootScope()).toBe(GUEST_SCOPE)
  })

  it('keeps the booted scope even after a new account is written', () => {
    bootAs('usr_alice')
    const alice = vaultKey('lattice-vault-v1')

    // exactly what signIn() does before the reload
    localStorage.setItem('lattice-account', JSON.stringify({ id: 'usr_bob' }))

    // the loaded modules are still keyed to Alice — which is why the
    // provider compares against this and reloads instead of switching live
    expect(bootScope()).toBe('usr_alice')
    expect(vaultKey('lattice-vault-v1')).toBe(alice)
  })

  describe('adoptGuestVault', () => {
    it('carries work done before signing in into the new account', () => {
      bootAs(null)
      const guest = vaultKey('lattice-vault-v1')
      localStorage.setItem(guest, '{"state":{"projects":{}}}')

      expect(adoptGuestVault('usr_alice')).toBe(true)

      bootAs('usr_alice')
      expect(vaultKey('lattice-vault-v1')).toBe(guest)
      expect(localStorage.getItem(vaultKey('lattice-vault-v1'))).toBe(
        '{"state":{"projects":{}}}',
      )
    })

    it('leaves the guest scope without a vault of its own afterwards', () => {
      bootAs(null)
      const guest = vaultKey('lattice-vault-v1')
      adoptGuestVault('usr_alice')

      // signing out lands on a fresh guest vault, not on the adopted one
      bootAs(null)
      expect(vaultKey('lattice-vault-v1')).not.toBe(guest)
    })

    it('refuses to merge a guest session into an account that already has one', () => {
      bootAs('usr_alice')
      const alice = vaultKey('lattice-vault-v1')
      bootAs(null)

      expect(adoptGuestVault('usr_alice')).toBe(false)

      bootAs('usr_alice')
      expect(vaultKey('lattice-vault-v1')).toBe(alice)
    })

    it('does nothing when there is no guest vault to adopt', () => {
      bootAs('usr_alice')
      expect(adoptGuestVault('usr_bob')).toBe(false)
    })
  })

  it('survives a corrupt map instead of locking anyone out', () => {
    localStorage.setItem('lattice-vaults', 'not json')
    bootAs('usr_alice')
    expect(vaultKey('lattice-vault-v1')).toBe('lattice-vault-v1')
  })
})
