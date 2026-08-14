import { describe, expect, it } from 'vitest'
import {
  MOCK_SUBJECT,
  migrateLegacyAccount,
  newUserId,
  providerIdsOf,
  resolveClaim,
} from './identity'
import type { IdentityClaim, IdentityRecords } from '@/types/identity'
import type { Account } from '@/types/model'

/**
 * The two rules 16.1 exists to guarantee, asserted directly:
 *  - a second way of signing in lands on the account you already have;
 *  - an UNVERIFIED address never does.
 */

const EMPTY: IdentityRecords = { users: [], identities: [] }

const google = (patch: Partial<IdentityClaim> = {}): IdentityClaim => ({
  provider: 'google',
  providerSubject: '104729382910473829102',
  email: 'francesco@example.com',
  emailVerified: true,
  displayName: 'Francesco Ori',
  avatarUrl: 'https://provider/pic.png',
  ...patch,
})

const otp = (patch: Partial<IdentityClaim> = {}): IdentityClaim =>
  google({
    provider: 'email',
    providerSubject: 'francesco@example.com',
    displayName: 'Francesco',
    avatarUrl: '',
    ...patch,
  })

/** Sign in once against empty records. */
const signIn = (claim: IdentityClaim, records: IdentityRecords = EMPTY) =>
  resolveClaim(records, claim, 1_000)

/** The pre-16.1 record, as it still sits in localStorage today. */
const account = (patch: Partial<Account> = {}): Account => ({
  id: 'acc_104729382910473829102',
  name: 'Francesco Ori',
  email: 'Francesco@Example.com',
  avatarUrl: 'https://provider/pic.png',
  providers: ['google'],
  createdAt: 10,
  updatedAt: 20,
  ...patch,
})

describe('newUserId', () => {
  it('is opaque: the provider subject is not readable from it', () => {
    const id = newUserId(google())
    expect(id.startsWith('usr_')).toBe(true)
    expect(id).not.toContain('104729382910473829102')
  })

  it('is the same on another device, so one person stays one author', () => {
    expect(newUserId(google())).toBe(newUserId(google()))
  })

  it('differs per provider, so an unverified claim cannot guess it', () => {
    expect(newUserId(google())).not.toBe(newUserId(otp()))
  })
})

describe('resolveClaim', () => {
  it('creates the user and its first identity', () => {
    const { records, resolved } = signIn(google())
    expect(resolved.createdUser).toBe(true)
    expect(records.users).toHaveLength(1)
    expect(records.identities).toHaveLength(1)
    expect(resolved.user.primaryEmail).toBe('francesco@example.com')
    expect(resolved.identity.verifiedAt).toBe(1_000)
  })

  it('recognises the same subject without adding a second identity', () => {
    const first = signIn(google())
    const again = resolveClaim(first.records, google(), 2_000)
    expect(again.resolved.user.id).toBe(first.resolved.user.id)
    expect(again.resolved.createdUser).toBe(false)
    expect(again.records.users).toHaveLength(1)
    expect(again.records.identities).toHaveLength(1)
  })

  it('follows an address change under a stable subject', () => {
    const first = signIn(google())
    const renamed = resolveClaim(
      first.records,
      google({ email: 'f.ori@example.com' }),
      2_000,
    )
    expect(renamed.records.identities[0].email).toBe('f.ori@example.com')
    expect(renamed.resolved.user.id).toBe(first.resolved.user.id)
  })

  it('converges: the same VERIFIED address through OTP is the same account', () => {
    const first = signIn(google())
    const second = resolveClaim(first.records, otp(), 2_000)
    expect(second.resolved.user.id).toBe(first.resolved.user.id)
    expect(second.resolved.createdUser).toBe(false)
    expect(second.resolved.linkedIdentity).toBe(true)
    expect(second.records.users).toHaveLength(1)
    expect(providerIdsOf(second.records.identities)).toEqual(['google', 'email'])
  })

  it('refuses to converge an UNVERIFIED address onto an existing account', () => {
    const first = signIn(google())
    const impostor = resolveClaim(
      first.records,
      otp({ emailVerified: false, providerSubject: 'attacker' }),
      2_000,
    )
    expect(impostor.resolved.user.id).not.toBe(first.resolved.user.id)
    expect(impostor.resolved.createdUser).toBe(true)
    expect(impostor.records.users).toHaveLength(2)
  })

  it('keeps the local-only account out of a real one', () => {
    const first = signIn(google())
    const local = resolveClaim(
      first.records,
      {
        provider: 'mock',
        providerSubject: MOCK_SUBJECT,
        email: 'francesco@example.com',
        emailVerified: false,
        displayName: 'Local User',
        avatarUrl: '',
      },
      2_000,
    )
    expect(local.resolved.user.id).not.toBe(first.resolved.user.id)
  })

  it('treats a different address as a different person, leaving the first alone', () => {
    const first = signIn(google())
    const linked = resolveClaim(
      first.records,
      otp({ email: 'work@example.com', providerSubject: 'work@example.com' }),
      2_000,
    )
    // a different address cannot converge, so this is a different person…
    expect(linked.resolved.createdUser).toBe(true)
    // …and the original user's address is untouched
    expect(linked.records.users[0].primaryEmail).toBe('francesco@example.com')
  })

  it('repairs a migrated identity in place instead of duplicating it', () => {
    const legacy = migrateLegacyAccount(account({ id: 'acc_local1' }), 500)
    expect(legacy.identities[0].providerSubject).toBe('') // unrecoverable
    const back = resolveClaim(legacy, google(), 2_000)
    expect(back.resolved.user.id).toBe('acc_local1')
    expect(back.records.identities).toHaveLength(1)
    expect(back.records.identities[0].providerSubject).toBe(google().providerSubject)
  })
})

describe('migrateLegacyAccount', () => {
  it('keeps the legacy id, so nothing already written is orphaned', () => {
    const records = migrateLegacyAccount(account(), 500)
    expect(records.users[0].id).toBe('acc_104729382910473829102')
    expect(records.users[0].createdAt).toBe(10)
  })

  it('recovers the Google subject the old id was built from', () => {
    const records = migrateLegacyAccount(account(), 500)
    expect(records.identities[0].providerSubject).toBe('104729382910473829102')
    expect(records.identities[0].email).toBe('francesco@example.com')
    expect(records.identities[0].verifiedAt).toBe(20)
  })

  it('lets a migrated Google account sign back in as itself', () => {
    const records = migrateLegacyAccount(account(), 500)
    const back = resolveClaim(records, google(), 2_000)
    expect(back.resolved.user.id).toBe('acc_104729382910473829102')
    expect(back.resolved.createdUser).toBe(false)
  })

  it('never marks a local account as verified', () => {
    const records = migrateLegacyAccount(
      account({ id: 'acc_m4k2x', providers: ['mock'], email: 'local@lattice.dev' }),
      500,
    )
    expect(records.identities[0].provider).toBe('mock')
    expect(records.identities[0].verifiedAt).toBeNull()
  })

  it('drops github: it was a repository connection, not a sign-in', () => {
    const records = migrateLegacyAccount(account({ providers: ['google', 'github'] }), 500)
    expect(providerIdsOf(records.identities)).toEqual(['google'])
  })
})
