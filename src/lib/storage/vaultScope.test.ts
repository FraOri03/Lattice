import { beforeEach, describe, expect, it } from 'vitest'
import {
  adoptGuestVault,
  bootScope,
  bootSlot,
  GUEST_SCOPE,
  keyBelongsToSlot,
  releaseSlot,
  resetVaultScopeForTests,
  UNSCOPED_KEYS,
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

/** What `AccountProvider.switchVault` does, minus the reload. */
function signIn(accountId: string): void {
  adoptGuestVault(accountId)
  bootAs(accountId)
}

const map = () => JSON.parse(localStorage.getItem('lattice-vaults') ?? '{}') as Record<string, string>

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
    expect(vaultKey('lattice-vault-v1')).not.toBe('lattice-vault-v1')
  })

  it('scopes every storage name, not just the vault', () => {
    bootAs('usr_alice')
    bootAs('usr_bob')
    const slot = bootSlot()
    expect(slot).not.toBe('')

    for (const base of [
      'lattice-vault-v1',
      'lattice-vault-blobs',
      'lattice-sync-meta',
      'lattice-collab-v1',
      'lattice-github-token',
    ]) {
      expect(vaultKey(base)).toBe(`${base}::${slot}`)
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

  /**
   * #257 — the slot used to be the scope's own name, so the anonymous scope
   * derived `guest`, `adoptGuestVault` handed `guest` to an account, and
   * every later sign-out derived it right back.
   */
  describe('a slot belongs to exactly one scope', () => {
    it('does not give the anonymous scope an account vault after a sign-out', () => {
      // Alice is the existing install and owns the unsuffixed keys
      bootAs('usr_alice')
      localStorage.setItem(vaultKey('lattice-vault-v1'), '{"alice":1}')

      // she signs out; the page reloads into an anonymous scope
      bootAs(null)
      expect(localStorage.getItem(vaultKey('lattice-vault-v1'))).toBeNull()

      // Bob signs in from that page and adopts the (empty) guest vault
      signIn('usr_bob')
      const bobKey = vaultKey('lattice-vault-v1')
      localStorage.setItem(bobKey, '{"bob":"private plans"}')

      // Bob signs out. This is where the anonymous scope used to be handed
      // his vault back, in full — GitHub token and Gemini key included.
      bootAs(null)
      expect(vaultKey('lattice-vault-v1')).not.toBe(bobKey)
      expect(localStorage.getItem(vaultKey('lattice-vault-v1'))).toBeNull()
      expect(localStorage.getItem(bobKey)).toBe('{"bob":"private plans"}')
    })

    it("does not let the next account adopt the previous one's vault", () => {
      bootAs('usr_alice')
      bootAs(null)
      signIn('usr_bob')
      const bobKey = vaultKey('lattice-vault-v1')
      localStorage.setItem(bobKey, '{"bob":"private plans"}')

      bootAs(null) // Bob signs out
      signIn('usr_carol') // and Carol signs in on the same browser

      expect(vaultKey('lattice-vault-v1')).not.toBe(bobKey)
      expect(localStorage.getItem(vaultKey('lattice-vault-v1'))).toBeNull()
    })

    it('repairs a map the derived-name build already broke', () => {
      // exactly what shipped: Bob and the anonymous scope on one slot
      localStorage.setItem(
        'lattice-vaults',
        JSON.stringify({ usr_alice: '', usr_bob: 'guest', guest: 'guest' }),
      )
      localStorage.setItem('lattice-vault-v1::guest', '{"bob":"private plans"}')

      bootAs(null)
      expect(vaultKey('lattice-vault-v1')).not.toBe('lattice-vault-v1::guest')
      expect(localStorage.getItem(vaultKey('lattice-vault-v1'))).toBeNull()

      // and Bob still has every byte of his
      bootAs('usr_bob')
      expect(localStorage.getItem(vaultKey('lattice-vault-v1'))).toBe(
        '{"bob":"private plans"}',
      )
    })

    it('never mints a slot another scope already holds', () => {
      const slots = new Set<string>()
      for (const id of ['usr_a', 'usr_b', 'usr_c', 'usr_d']) {
        bootAs(id)
        slots.add(bootSlot())
      }
      bootAs(null)
      slots.add(bootSlot())
      expect(slots.size).toBe(5)
    })
  })

  /**
   * #257 — the other door: the unsuffixed keys went to whoever asked first,
   * and on a browser whose owner had signed out before updating, that is the
   * anonymous scope.
   */
  describe('the legacy vault', () => {
    it('is not given to an anonymous scope on an install that has had accounts', () => {
      localStorage.setItem('lattice-vault-v1', '{"state":{"projects":{"p":1}}}')
      localStorage.setItem(
        'lattice-identity',
        JSON.stringify({ users: [{ id: 'usr_alice' }], identities: [] }),
      )

      bootAs(null)
      expect(vaultKey('lattice-vault-v1')).not.toBe('lattice-vault-v1')
      expect(localStorage.getItem(vaultKey('lattice-vault-v1'))).toBeNull()
    })

    it('is not given to an anonymous scope that cannot prove it is a guest install', () => {
      localStorage.setItem('lattice-vault-v1', '{"state":{"projects":{"p":1}}}')
      bootAs(null) // no skip flag: nothing says these bytes are a guest's
      expect(vaultKey('lattice-vault-v1')).not.toBe('lattice-vault-v1')
    })

    it('stays with a browser that has only ever been used without an account', () => {
      localStorage.setItem('lattice-vault-v1', '{"state":{"projects":{"p":1}}}')
      localStorage.setItem('lattice-login-skipped', '1')

      bootAs(null)
      expect(vaultKey('lattice-vault-v1')).toBe('lattice-vault-v1')
      expect(localStorage.getItem(vaultKey('lattice-vault-v1'))).toBe(
        '{"state":{"projects":{"p":1}}}',
      )
    })
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

  describe('keyBelongsToSlot', () => {
    it('matches a suffixed key against its own slot only', () => {
      expect(keyBelongsToSlot('lattice-vault-v1::v123', 'v123')).toBe(true)
      expect(keyBelongsToSlot('lattice-vault-v1::v456', 'v123')).toBe(false)
      expect(keyBelongsToSlot('lattice-vault-v1', 'v123')).toBe(false)
    })

    it('reads the legacy slot as every unsuffixed lattice key', () => {
      expect(keyBelongsToSlot('lattice-vault-v1', '')).toBe(true)
      expect(keyBelongsToSlot('lattice-sync-meta', '')).toBe(true)
      expect(keyBelongsToSlot('lattice-vault-v1::v123', '')).toBe(false)
      expect(keyBelongsToSlot('some-other-app', '')).toBe(false)
    })

    it('leaves the keys that live outside the namespace alone', () => {
      for (const key of UNSCOPED_KEYS) {
        expect(keyBelongsToSlot(key, '')).toBe(false)
      }
    })
  })

  it('releaseSlot drops the mapping, so nothing points at deleted bytes', () => {
    bootAs('usr_alice')
    bootAs('usr_bob')
    const wiped = bootSlot()

    releaseSlot('usr_bob')
    expect(map()['usr_bob']).toBeUndefined()

    // Bob comes back to an empty vault, not to the one "forget this device"
    // just deleted underneath him
    bootAs('usr_bob')
    expect(bootSlot()).not.toBe(wiped)
  })

  it('survives a corrupt map instead of locking anyone out', () => {
    localStorage.setItem('lattice-vaults', 'not json')
    bootAs('usr_alice')
    expect(vaultKey('lattice-vault-v1')).toBe('lattice-vault-v1')
  })
})
