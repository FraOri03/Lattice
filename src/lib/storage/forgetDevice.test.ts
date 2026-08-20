import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetThisDevice } from './forgetDevice'
import { bootScope, resetVaultScopeForTests, vaultKey } from './vaultScope'

/**
 * "Forget this device" (#257).
 *
 * Namespacing stopped one account READING another's vault and removed
 * nothing: every byte stayed on the machine under a slot the UI never named.
 * This is the delete that was missing, and the two things it must get right
 * are the two ways a delete goes wrong — leaving some of the vault behind,
 * and taking somebody else's with it.
 */

vi.mock('./StorageProvider', () => ({
  storage: { close: () => {} },
}))

vi.mock('@/lib/crdt/YjsManager', () => ({
  yjsManager: { stop: () => {}, destroyRooms: () => {} },
}))

/** Databases the fake IndexedDB holds, and how each answers a delete. */
let databases: string[] = []
let blocks: Set<string> = new Set()
let deleted: string[] = []
/** Whether this browser enumerates databases (Firefox does not). */
let enumerable = true

function installIndexedDb(): void {
  const fake = {
    databases: enumerable
      ? async () => databases.map((name) => ({ name, version: 1 }))
      : undefined,
    deleteDatabase(name: string) {
      const req = {} as IDBOpenDBRequest & {
        onsuccess: (() => void) | null
        onerror: (() => void) | null
        onblocked: (() => void) | null
      }
      // the handlers are attached after this returns, as in a real request
      queueMicrotask(() => {
        if (blocks.has(name)) {
          req.onblocked?.()
          return
        }
        deleted.push(name)
        databases = databases.filter((d) => d !== name)
        req.onsuccess?.()
      })
      return req
    },
  }
  ;(globalThis as unknown as { indexedDB: unknown }).indexedDB = fake
}

function bootAs(accountId: string | null): void {
  resetVaultScopeForTests()
  if (accountId) {
    localStorage.setItem('lattice-account', JSON.stringify({ id: accountId }))
  } else {
    localStorage.removeItem('lattice-account')
  }
  bootScope()
}

const map = () =>
  JSON.parse(localStorage.getItem('lattice-vaults') ?? '{}') as Record<string, string>

beforeEach(() => {
  localStorage.clear()
  resetVaultScopeForTests()
  databases = []
  blocks = new Set()
  deleted = []
  enumerable = true
  installIndexedDb()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('forgetThisDevice', () => {
  it('takes this slot and leaves every other one alone', async () => {
    // Alice owns the legacy slot; Bob is the second account here
    bootAs('usr_alice')
    localStorage.setItem('lattice-vault-v1', '{"alice":1}')
    localStorage.setItem('lattice-github-token', 'ghp_alice')

    bootAs('usr_bob')
    const bobVault = vaultKey('lattice-vault-v1')
    localStorage.setItem(bobVault, '{"bob":1}')
    localStorage.setItem(vaultKey('lattice-github-token'), 'ghp_bob')
    localStorage.setItem(vaultKey('lattice-photo-gemini-key'), 'AIza_bob')

    // keys that belong to nobody's slot
    localStorage.setItem('lattice-identity', '{"users":[]}')
    localStorage.setItem('lattice-workspace-layout', '{"state":{}}')
    localStorage.setItem('some-other-app', 'untouched')

    databases = [vaultKey('lattice-vault-blobs'), 'lattice-vault-blobs']

    const result = await forgetThisDevice()

    expect(localStorage.getItem(bobVault)).toBeNull()
    expect(localStorage.getItem(vaultKey('lattice-github-token'))).toBeNull()
    expect(localStorage.getItem(vaultKey('lattice-photo-gemini-key'))).toBeNull()
    expect(result.keys).toBe(3)

    // Alice keeps hers, and so do the keys that live outside the namespace
    expect(localStorage.getItem('lattice-vault-v1')).toBe('{"alice":1}')
    expect(localStorage.getItem('lattice-github-token')).toBe('ghp_alice')
    expect(localStorage.getItem('lattice-identity')).toBe('{"users":[]}')
    expect(localStorage.getItem('lattice-workspace-layout')).toBe('{"state":{}}')
    expect(localStorage.getItem('some-other-app')).toBe('untouched')

    expect(deleted).toEqual([vaultKey('lattice-vault-blobs')])
    expect(databases).toContain('lattice-vault-blobs')
  })

  it('deletes the legacy slot without taking the keys that live outside it', async () => {
    bootAs('usr_alice') // claims the unsuffixed keys
    localStorage.setItem('lattice-vault-v1', '{"alice":1}')
    localStorage.setItem('lattice-sync-meta', '{}')
    localStorage.setItem('lattice-account', JSON.stringify({ id: 'usr_alice' }))
    localStorage.setItem('lattice-call-ui', '{}')
    databases = ['lattice-vault-blobs', 'lattice-vault-blobs::v9']

    await forgetThisDevice()

    expect(localStorage.getItem('lattice-vault-v1')).toBeNull()
    expect(localStorage.getItem('lattice-sync-meta')).toBeNull()
    // the account record and the per-device ergonomics are not vault data
    expect(localStorage.getItem('lattice-account')).not.toBeNull()
    expect(localStorage.getItem('lattice-call-ui')).toBe('{}')
    // and another slot's database is not this session's to delete
    expect(deleted).toEqual(['lattice-vault-blobs'])
  })

  it('releases the slot, so nothing points at the bytes that are gone', async () => {
    bootAs('usr_alice')
    bootAs('usr_bob')
    expect(map()['usr_bob']).toBeDefined()

    await forgetThisDevice()

    expect(map()['usr_bob']).toBeUndefined()
    expect(map()['usr_alice']).toBe('')
  })

  it('reconstructs the database names when the browser will not list them', async () => {
    enumerable = false
    installIndexedDb()
    bootAs('usr_alice')
    bootAs('usr_bob')
    localStorage.setItem(
      vaultKey('lattice-vault-v1'),
      JSON.stringify({ state: { projects: { proj_a: {}, proj_b: {} } } }),
    )

    await forgetThisDevice()

    expect(deleted).toEqual([
      vaultKey('lattice-vault-blobs'),
      vaultKey('lattice-yjs-proj_a-content'),
      vaultKey('lattice-yjs-proj_a-collab'),
      vaultKey('lattice-yjs-proj_b-content'),
      vaultKey('lattice-yjs-proj_b-collab'),
    ])
  })

  it('reports a database another tab is holding open instead of claiming a clean wipe', async () => {
    bootAs('usr_alice')
    bootAs('usr_bob')
    const stuck = vaultKey('lattice-vault-blobs')
    databases = [stuck]
    blocks = new Set([stuck])

    vi.useFakeTimers()
    const pending = forgetThisDevice()
    await vi.advanceTimersByTimeAsync(5_000)
    const result = await pending

    expect(result.blocked).toEqual([stuck])
    expect(result.databases).toBe(0)
  })
})
