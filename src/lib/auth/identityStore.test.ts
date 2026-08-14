import { beforeEach, describe, expect, it } from 'vitest'
import { LocalIdentityStore } from './identityStore'
import type { Account } from '@/types/model'

/**
 * The upgrade path, which is the part that can only fail once: a user who
 * is already signed in must come out of it as the SAME user. Their id is
 * on every comment, member row and activity entry they have ever written,
 * including in other people's browsers.
 */

const LEGACY: Account = {
  id: 'acc_104729382910473829102',
  name: 'Fra',
  email: 'francesco@example.com',
  avatarUrl: 'https://provider/pic.png',
  providers: ['google'],
  providerProfile: { name: 'Francesco Ori', avatarUrl: 'https://provider/pic.png' },
  nameOverridden: true,
  createdAt: 10,
  updatedAt: 20,
}

const GOOGLE_CLAIM = {
  provider: 'google' as const,
  providerSubject: '104729382910473829102',
  email: 'francesco@example.com',
  emailVerified: true,
  displayName: 'Francesco Ori',
  avatarUrl: 'https://provider/pic.png',
}

beforeEach(() => {
  localStorage.clear()
})

describe('LocalIdentityStore', () => {
  it('adopts the account already signed in, keeping its id', () => {
    localStorage.setItem('lattice-account', JSON.stringify(LEGACY))
    const store = new LocalIdentityStore()
    const records = store.records()
    expect(records.users).toHaveLength(1)
    expect(records.users[0].id).toBe(LEGACY.id)
    expect(records.users[0].displayName).toBe('Fra')
    expect(localStorage.getItem('lattice-identity')).toBeTruthy()
  })

  it('signs that same person back in as themselves, not as a twin', () => {
    localStorage.setItem('lattice-account', JSON.stringify(LEGACY))
    const store = new LocalIdentityStore()
    const resolved = store.resolve(GOOGLE_CLAIM)
    expect(resolved.user.id).toBe(LEGACY.id)
    expect(resolved.createdUser).toBe(false)
    expect(store.records().users).toHaveLength(1)
  })

  it('mints one user for a first-ever sign-in, and reuses it after a reload', () => {
    const first = new LocalIdentityStore().resolve(GOOGLE_CLAIM)
    expect(first.createdUser).toBe(true)
    // a fresh instance reads what the previous one persisted
    const second = new LocalIdentityStore().resolve(GOOGLE_CLAIM)
    expect(second.user.id).toBe(first.user.id)
    expect(second.createdUser).toBe(false)
  })

  it('mirrors the effective profile onto the user record', () => {
    const store = new LocalIdentityStore()
    const { user } = store.resolve(GOOGLE_CLAIM)
    store.update(user.id, { displayName: 'Fra', avatarUrl: '' })
    expect(store.user(user.id)?.displayName).toBe('Fra')
    expect(new LocalIdentityStore().user(user.id)?.displayName).toBe('Fra')
  })

  it('survives a corrupt store rather than locking anyone out', () => {
    localStorage.setItem('lattice-identity', '{not json')
    localStorage.setItem('lattice-account', JSON.stringify(LEGACY))
    const store = new LocalIdentityStore()
    expect(store.resolve(GOOGLE_CLAIM).user.id).toBe(LEGACY.id)
  })
})
