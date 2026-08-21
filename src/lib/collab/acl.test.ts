import { describe, expect, it } from 'vitest'
import {
  aclSlots,
  addEmail,
  bindUserId,
  decodeBindings,
  encodeBindings,
  matchOf,
  roleOf,
  roleOfSlot,
  stripEmail,
  type Principal,
  type RoomAcl,
} from './acl'

/**
 * The rule 16.2 turns on: a membership slot opened with an address stops
 * answering to that address once its owner has proved it.
 *
 * The case that matters most is the one that used to be silent — a work
 * address is reassigned to a new employee, and the new holder inherits a
 * project they were never given.
 */

const acl = (patch: Partial<RoomAcl> = {}): RoomAcl => ({
  ownerEmail: 'owner@example.com',
  admins: ['ada@example.com'],
  editors: ['bob@example.com'],
  commenters: [],
  viewers: ['viv@example.com'],
  bindings: {},
  ...patch,
})

const who = (email: string, ...userIds: string[]): Principal => ({ email, userIds })

describe('an unbound slot', () => {
  it('belongs to whoever proves its address', () => {
    expect(roleOf(acl(), who('bob@example.com', 'usr_bob'))).toBe('editor')
  })

  it('is what an invitation not yet accepted looks like', () => {
    // nothing is bound, so the address is still the only key there is
    expect(acl().bindings).toEqual({})
    expect(roleOf(acl(), who('viv@example.com'))).toBe('viewer')
  })

  it('gives a stranger nothing', () => {
    expect(roleOf(acl(), who('stranger@example.com', 'usr_x'))).toBeNull()
  })
})

describe('a bound slot', () => {
  const bound = acl({ bindings: { 'bob@example.com': 'usr_bob' } })

  it('belongs to its userId', () => {
    expect(roleOf(bound, who('bob@example.com', 'usr_bob'))).toBe('editor')
  })

  it('follows its owner to a new address', () => {
    // same Google account, renamed: the address no longer matches anything
    // in the ACL, and the membership survives anyway
    expect(roleOf(bound, who('robert@example.com', 'usr_bob'))).toBe('editor')
  })

  it('does NOT go to whoever holds the address next', () => {
    // the address was reassigned; before 16.2 this returned 'editor'
    expect(roleOf(bound, who('bob@example.com', 'usr_someone_else'))).toBeNull()
  })

  it('does not answer to the address with no userId at all', () => {
    expect(roleOf(bound, who('bob@example.com'))).toBeNull()
  })

  it('accepts the legacy id when that is what it was bound to', () => {
    const legacy = acl({ bindings: { 'bob@example.com': 'acc_112233' } })
    // one Google subject yields both forms; either may be presented
    expect(roleOf(legacy, who('bob@example.com', 'usr_bob', 'acc_112233'))).toBe(
      'editor',
    )
  })
})

describe('resolution order', () => {
  it('returns the strongest slot a person holds', () => {
    const two = acl({
      admins: ['ada@example.com'],
      viewers: ['ada@example.com', 'viv@example.com'],
    })
    expect(roleOf(two, who('ada@example.com'))).toBe('admin')
  })

  it('reports which slot matched, so it can be bound', () => {
    expect(matchOf(acl(), who('ada@example.com'))).toEqual({
      role: 'admin',
      slotEmail: 'ada@example.com',
    })
  })

  it('treats the owner as a slot like any other', () => {
    const bound = acl({ bindings: { 'owner@example.com': 'usr_owner' } })
    expect(roleOf(bound, who('owner@example.com', 'usr_owner'))).toBe('owner')
    expect(roleOf(bound, who('owner@example.com', 'usr_impostor'))).toBeNull()
  })
})

describe('roleOfSlot', () => {
  it('answers for a bound slot too', () => {
    // the rank checks depend on this: asking "what is bob" through the
    // principal path would report a bound admin as holding no role, and
    // an editor could then remove them
    const bound = acl({
      admins: ['ada@example.com'],
      bindings: { 'ada@example.com': 'usr_ada' },
    })
    expect(roleOfSlot(bound, 'ada@example.com')).toBe('admin')
    expect(roleOf(bound, who('ada@example.com'))).toBeNull()
  })

  it('is null for an address nobody was given', () => {
    expect(roleOfSlot(acl(), 'nobody@example.com')).toBeNull()
  })
})

describe('bindUserId', () => {
  it('binds a slot once', () => {
    const next = bindUserId(acl(), 'bob@example.com', 'usr_bob')
    expect(next.bindings).toEqual({ 'bob@example.com': 'usr_bob' })
  })

  it('never rebinds: a claimed slot stays with its claimant', () => {
    const bound = acl({ bindings: { 'bob@example.com': 'usr_bob' } })
    const next = bindUserId(bound, 'bob@example.com', 'usr_someone_else')
    expect(next.bindings['bob@example.com']).toBe('usr_bob')
    expect(next).toBe(bound) // and it does not churn the record
  })

  it('ignores an empty userId rather than binding a slot to nothing', () => {
    expect(bindUserId(acl(), 'bob@example.com', '').bindings).toEqual({})
  })
})

describe('membership edits', () => {
  it('keeps the binding across a role change', () => {
    const bound = acl({ bindings: { 'bob@example.com': 'usr_bob' } })
    const promoted = addEmail(bound, 'bob@example.com', 'admin')
    expect(promoted.admins).toContain('bob@example.com')
    expect(promoted.editors).not.toContain('bob@example.com')
    expect(roleOf(promoted, who('bob@example.com', 'usr_bob'))).toBe('admin')
  })

  it('forgets the binding when the member is removed', () => {
    const bound = acl({ bindings: { 'bob@example.com': 'usr_bob' } })
    const removed = stripEmail(bound, 'bob@example.com')
    expect(removed.bindings).toEqual({})
    // so re-inviting the address opens a fresh slot for whoever holds it
    const reinvited = addEmail(removed, 'bob@example.com', 'viewer')
    expect(roleOf(reinvited, who('bob@example.com', 'usr_new_person'))).toBe('viewer')
  })
})

describe('the wire format', () => {
  it('round-trips', () => {
    const bindings = { 'bob@example.com': 'usr_bob', 'ada@example.com': 'acc_99' }
    expect(decodeBindings(encodeBindings(bindings))).toEqual(bindings)
  })

  it('reads nothing as nothing, which is every room written before 16.2', () => {
    expect(decodeBindings(undefined)).toEqual({})
    expect(decodeBindings([])).toEqual({})
  })

  it('drops a malformed row instead of half-binding a slot', () => {
    expect(decodeBindings(['usr_only', '', ' bob@example.com', 'usr_b b@x.com'])).toEqual(
      { 'b@x.com': 'usr_b' },
    )
  })

  it('refuses to encode a value that would not survive the round trip', () => {
    expect(encodeBindings({ 'a b@x.com': 'usr_a' })).toEqual([])
  })
})

describe('aclSlots', () => {
  it('flattens the whole grant, highest rank first', () => {
    expect(aclSlots(acl()).map((s) => `${s.role}:${s.email}`)).toEqual([
      'owner:owner@example.com',
      'admin:ada@example.com',
      'editor:bob@example.com',
      'viewer:viv@example.com',
    ])
  })

  it('says which slots have been claimed — the difference a reader needs', () => {
    const claimed = aclSlots(acl({ bindings: { 'ada@example.com': 'usr_ada' } }))
    expect(claimed.find((s) => s.email === 'ada@example.com')?.claimed).toBe(true)
    expect(claimed.find((s) => s.email === 'bob@example.com')?.claimed).toBe(false)
  })

  it('reads an ownerless ACL as holding no owner slot, rather than an empty one', () => {
    expect(aclSlots(acl({ ownerEmail: '' })).some((s) => s.role === 'owner')).toBe(false)
  })
})
