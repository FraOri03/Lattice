import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseRepositories } from './supabase.js'

/**
 * The Supabase adapter, against a fake PostgREST client.
 *
 * `memory.ts` proves the CONTRACT; this file proves the things only the
 * real adapter can get wrong — which statement it builds, and what it does
 * when the database answers with an error instead of rows.
 *
 * No network, no key, no project: the fake records every call and returns
 * whatever the test tells it to.
 */

interface Call {
  table: string
  op: string
  payload?: unknown
  filters: [string, ...unknown[]][]
}

type Answer = { data: unknown; error: { message: string; code?: string } | null }

function fakeClient(answer: (call: Call) => Answer) {
  const calls: Call[] = []

  const builder = (call: Call) => {
    calls.push(call)
    const chain = (name: string) =>
      (...args: unknown[]) => {
        call.filters.push([name, ...args])
        return b
      }
    const b: Record<string, unknown> = {
      then: (resolve: (value: Answer) => unknown) =>
        Promise.resolve(answer(call)).then(resolve),
    }
    for (const name of [
      'select',
      'eq',
      'neq',
      'not',
      'is',
      'in',
      'limit',
      'order',
      'maybeSingle',
      'single',
    ]) {
      b[name] = chain(name)
    }
    return b
  }

  const client = {
    from: (table: string) => ({
      select: (...args: unknown[]) =>
        builder({ table, op: 'select', filters: [['select', ...args]] }),
      insert: (payload: unknown) => builder({ table, op: 'insert', payload, filters: [] }),
      upsert: (payload: unknown) => builder({ table, op: 'upsert', payload, filters: [] }),
      update: (payload: unknown) => builder({ table, op: 'update', payload, filters: [] }),
      delete: () => builder({ table, op: 'delete', filters: [] }),
    }),
  }

  return { client: client as unknown as SupabaseClient, calls }
}

const ok = (data: unknown): Answer => ({ data, error: null })
const fails = (message: string, code?: string): Answer => ({
  data: null,
  error: { message, code },
})

const filterNames = (call: Call): string[] => call.filters.map(([name]) => name)
const filterFor = (call: Call, name: string): unknown[] | undefined =>
  call.filters.find(([f]) => f === name)?.slice(1)

/* ---------------- errors ---------------- */

describe('a failed query throws rather than reading as "no rows"', () => {
  /**
   * The distinction this file exists for. Deny-all RLS and an unreachable
   * database both produce "nothing"; treating the second as "nobody owns
   * this address" is the difference between an outage and an authorisation
   * bypass.
   */
  it('throws when resolving an address to a user fails', async () => {
    const { client } = fakeClient(() => fails('connection reset'))
    const db = new SupabaseRepositories(client)
    await expect(db.identities.userByVerifiedEmail('ada@example.com')).rejects.toThrow(
      /resolve address to user/,
    )
  })

  it('throws when loading an ACL fails', async () => {
    const { client } = fakeClient(() => fails('timeout'))
    const db = new SupabaseRepositories(client)
    await expect(db.memberships.aclOf('p1')).rejects.toThrow(/load acl/)
  })

  it('throws when saving an identity fails', async () => {
    const { client } = fakeClient(() => fails('constraint violated'))
    const db = new SupabaseRepositories(client)
    await expect(
      db.identities.saveResolved({
        user: {
          id: 'usr_ada',
          primaryEmail: 'ada@example.com',
          displayName: 'Ada',
          avatarUrl: '',
          createdAt: 1,
          updatedAt: 1,
        },
        identity: {
          id: 'uid_1',
          userId: 'usr_ada',
          provider: 'google',
          providerSubject: 'g-1',
          email: 'ada@example.com',
          verifiedAt: 1,
        },
        createdUser: true,
        linkedIdentity: true,
      }),
    ).rejects.toThrow(/save user/)
  })
})

/* ---------------- identity ---------------- */

describe('identity lookups are targeted', () => {
  it('never selects the whole identity table', async () => {
    const { client, calls } = fakeClient(() => ok([]))
    const db = new SupabaseRepositories(client)
    await db.identities.recordsForClaim({
      provider: 'google',
      providerSubject: 'g-1',
      email: 'ada@example.com',
      emailVerified: true,
      displayName: 'Ada',
      avatarUrl: '',
    })
    const identityCalls = calls.filter((c) => c.table === 'user_identities')
    expect(identityCalls).toHaveLength(3) // one per matchable step of resolveClaim
    for (const call of identityCalls) {
      expect(filterNames(call)).toContain('limit')
    }
  })

  it('does not look users up at all when no identity matched', async () => {
    const { client, calls } = fakeClient(() => ok([]))
    const db = new SupabaseRepositories(client)
    const records = await db.identities.recordsForClaim({
      provider: 'google',
      providerSubject: 'g-1',
      email: 'ada@example.com',
      emailVerified: true,
      displayName: 'Ada',
      avatarUrl: '',
    })
    expect(records).toEqual({ users: [], identities: [] })
    expect(calls.some((c) => c.table === 'users')).toBe(false)
  })

  it('only consults verified identities when resolving an address', async () => {
    const { client, calls } = fakeClient(() => ok(null))
    const db = new SupabaseRepositories(client)
    await db.identities.userByVerifiedEmail('ada@example.com')
    const call = calls.find((c) => c.table === 'user_identities')
    expect(filterFor(call as Call, 'not')).toEqual(['verified_at', 'is', null])
  })

  it('lowercases the address before asking', async () => {
    const { client, calls } = fakeClient(() => ok(null))
    const db = new SupabaseRepositories(client)
    await db.identities.userByVerifiedEmail('  ADA@Example.COM ')
    const call = calls.find((c) => c.table === 'user_identities')
    expect(filterFor(call as Call, 'eq')).toEqual(['email', 'ada@example.com'])
  })
})

/* ---------------- membership ---------------- */

describe('membership statements', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    project_id: 'p1',
    email: 'ada@example.com',
    role: 'owner',
    user_id: null,
    invited_by: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  })

  it('rebuilds the ACL the endpoints already read', async () => {
    const { client } = fakeClient(() =>
      ok([
        row(),
        row({ email: 'grace@example.com', role: 'editor', user_id: 'usr_grace' }),
      ]),
    )
    const db = new SupabaseRepositories(client)
    expect(await db.memberships.aclOf('p1')).toEqual({
      ownerEmail: 'ada@example.com',
      admins: [],
      editors: ['grace@example.com'],
      commenters: [],
      viewers: [],
      bindings: { 'grace@example.com': 'usr_grace' },
    })
  })

  /**
   * 16.2's "never re-bind", enforced by the WHERE clause rather than by a
   * read-then-write that two requests could interleave.
   */
  it('binds only a slot nobody has claimed', async () => {
    const { client, calls } = fakeClient(() => ok(null))
    const db = new SupabaseRepositories(client)
    await db.memberships.bind('p1', 'grace@example.com', 'usr_grace')
    const call = calls.find((c) => c.op === 'update') as Call
    expect(filterFor(call, 'is')).toEqual(['user_id', null])
  })

  it('demotes the incumbent before granting ownership', async () => {
    const { client, calls } = fakeClient(() => ok(null))
    const db = new SupabaseRepositories(client)
    await db.memberships.setRole('p1', 'grace@example.com', 'owner')
    const demote = calls.find((c) => c.op === 'update') as Call
    expect(demote.payload).toMatchObject({ role: 'admin' })
    expect(filterFor(demote, 'neq')).toEqual(['email', 'grace@example.com'])
    expect(calls.some((c) => c.op === 'upsert')).toBe(true)
  })

  it('does not touch the owner row when granting a lesser role', async () => {
    const { client, calls } = fakeClient(() => ok(null))
    const db = new SupabaseRepositories(client)
    await db.memberships.setRole('p1', 'grace@example.com', 'editor')
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('revokes by deleting the row', async () => {
    const { client, calls } = fakeClient(() => ok(null))
    const db = new SupabaseRepositories(client)
    await db.memberships.setRole('p1', 'grace@example.com', null)
    expect(calls.some((c) => c.op === 'delete')).toBe(true)
  })

  it('keeps the address out of a PostgREST or-filter when listing projects', async () => {
    const { client, calls } = fakeClient(() => ok([]))
    const db = new SupabaseRepositories(client)
    await db.memberships.projectsOf(['usr_grace'], 'grace@example.com')
    // two plain queries, never a composed filter expression
    expect(calls).toHaveLength(2)
    for (const call of calls) expect(filterNames(call)).not.toContain('or')
  })
})

/* ---------------- invitations ---------------- */

describe('invitation conflicts', () => {
  const invite = {
    id: 'inv_1',
    projectId: 'p1',
    email: 'grace@example.com',
    role: 'editor' as const,
    token: 'tok_1',
    createdAt: 1_700_000_000_000,
    invitedBy: 'usr_ada',
    invitedByName: 'Ada',
    status: 'pending' as const,
    updatedAt: 1_700_000_000_000,
  }

  const existingRow = {
    id: 'inv_winner',
    project_id: 'p1',
    email: 'grace@example.com',
    role: 'editor',
    token: 'tok_winner',
    status: 'pending',
    invited_by: 'usr_ada',
    invited_by_name: 'Ada',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    resent_at: null,
    accepted_at: null,
    expires_at: null,
  }

  /**
   * Losing this race is success: somebody invited the same address a moment
   * earlier, and the caller wanted an invitation to exist.
   */
  it('returns the winner when the unique index rejects a concurrent insert', async () => {
    let seenSelects = 0
    const { client } = fakeClient((call) => {
      if (call.op === 'insert') return fails('duplicate key', '23505')
      seenSelects += 1
      // the pre-check finds nothing; the post-conflict re-read finds theirs
      return seenSelects === 1 ? ok(null) : ok(existingRow)
    })
    const db = new SupabaseRepositories(client)
    const created = await db.invitations.create(invite)
    expect(created.id).toBe('inv_winner')
  })

  it('does not insert at all when a pending invitation already covers the address', async () => {
    const { client, calls } = fakeClient(() => ok(existingRow))
    const db = new SupabaseRepositories(client)
    const created = await db.invitations.create(invite)
    expect(created.id).toBe('inv_winner')
    expect(calls.some((c) => c.op === 'insert')).toBe(false)
  })

  it('still throws on an error that is not a unique violation', async () => {
    const { client } = fakeClient((call) =>
      call.op === 'insert' ? fails('permission denied', '42501') : ok(null),
    )
    const db = new SupabaseRepositories(client)
    await expect(db.invitations.create(invite)).rejects.toThrow(/create invitation/)
  })
})

/* ---------------- entitlements ---------------- */

describe('entitlements', () => {
  it('reads a missing row as the free plan rather than an error', async () => {
    const { client } = fakeClient(() => ok(null))
    const db = new SupabaseRepositories(client)
    expect(await db.entitlements.of('usr_ada')).toMatchObject({
      userId: 'usr_ada',
      plan: 'free',
      status: 'active',
    })
  })

  it('still throws when the read itself fails', async () => {
    const { client } = fakeClient(() => fails('timeout'))
    const db = new SupabaseRepositories(client)
    await expect(db.entitlements.of('usr_ada')).rejects.toThrow(/load entitlement/)
  })
})
