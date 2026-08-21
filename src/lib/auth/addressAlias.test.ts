import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * A label, and only a label.
 *
 * The mapping is read once, at module load, from a build-time variable — so
 * every case here re-imports the module behind a stubbed environment rather
 * than mutating state the module does not expose.
 */

type Alias = typeof import('./addressAlias')

async function withAliases(value: string): Promise<Alias> {
  vi.stubEnv('VITE_ADDRESS_ALIASES', value)
  vi.resetModules()
  return import('./addressAlias')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('displayAddress', () => {
  it('renames the addresses the build maps, and nothing else', async () => {
    const { displayAddress } = await withAliases('owner@gmail.com=admin@lattice.apps')
    expect(displayAddress('owner@gmail.com')).toBe('admin@lattice.apps')
    expect(displayAddress('someone@else.com')).toBe('someone@else.com')
  })

  it('matches case-insensitively, as every other address check does', async () => {
    const { displayAddress } = await withAliases('Owner@Gmail.com=admin@lattice.apps')
    expect(displayAddress('OWNER@gmail.com')).toBe('admin@lattice.apps')
  })

  it('is a no-op when the build maps nothing', async () => {
    const { displayAddress, hasAddressAliases } = await withAliases('')
    expect(hasAddressAliases).toBe(false)
    expect(displayAddress('owner@gmail.com')).toBe('owner@gmail.com')
  })

  it('drops a malformed pair rather than half-applying it', async () => {
    const { displayAddress } = await withAliases('not-an-address=x,owner@gmail.com=')
    expect(displayAddress('owner@gmail.com')).toBe('owner@gmail.com')
  })

  it('reads several pairs', async () => {
    const { displayAddress } = await withAliases('a@x.com=one@y, b@x.com=two@y')
    expect(displayAddress('a@x.com')).toBe('one@y')
    expect(displayAddress('b@x.com')).toBe('two@y')
  })
})

describe('realAddress', () => {
  it('resolves a label back, so a pasted alias invites the right mailbox', async () => {
    const { realAddress } = await withAliases('owner@gmail.com=admin@lattice.apps')
    expect(realAddress('admin@lattice.apps')).toBe('owner@gmail.com')
    expect(realAddress(' ADMIN@lattice.apps ')).toBe('owner@gmail.com')
  })

  it('leaves an ordinary address alone', async () => {
    const { realAddress } = await withAliases('owner@gmail.com=admin@lattice.apps')
    expect(realAddress('someone@else.com')).toBe('someone@else.com')
  })
})

describe('maskAddresses', () => {
  it('renames an address embedded in a sentence the server wrote', async () => {
    const { maskAddresses } = await withAliases('owner@gmail.com=admin@lattice.apps')
    expect(maskAddresses('owner@gmail.com is not a member of this project (server check).')).toBe(
      'admin@lattice.apps is not a member of this project (server check).',
    )
  })

  it('leaves prose without a mapped address untouched', async () => {
    const { maskAddresses } = await withAliases('owner@gmail.com=admin@lattice.apps')
    const text = 'someone@else.com is not a member of this project (server check).'
    expect(maskAddresses(text)).toBe(text)
  })
})
