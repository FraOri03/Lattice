import { describe, expect, it } from 'vitest'
import { databaseEnv, looksLikePublicKey } from './client.js'

/**
 * Guards the boundary #87 is about: which environment variables the server
 * reads, and which key it reads them for. Nothing here touches a network.
 */

/** A JWT-shaped key whose payload claims the given role. */
function jwtWithRole(role: string): string {
  const payload = Buffer.from(JSON.stringify({ role, iss: 'supabase' })).toString(
    'base64',
  )
  return `header.${payload}.signature`
}

const SECRET = 'sb_secret_realkeyvalue'

describe('looksLikePublicKey', () => {
  it('rejects the new publishable key', () => {
    expect(looksLikePublicKey('sb_publishable_abc123')).toBe(true)
  })

  it('rejects the legacy anon JWT by its role claim', () => {
    expect(looksLikePublicKey(jwtWithRole('anon'))).toBe(true)
  })

  it('accepts the service role JWT', () => {
    expect(looksLikePublicKey(jwtWithRole('service_role'))).toBe(false)
  })

  it('accepts an opaque secret key', () => {
    expect(looksLikePublicKey(SECRET)).toBe(false)
  })

  it('does not mistake a malformed key for a public one', () => {
    // it is not our job to validate keys, only to refuse the one that
    // would silently grant nothing
    expect(looksLikePublicKey('not.a.jwt')).toBe(false)
  })
})

describe('databaseEnv', () => {
  it('is null when nothing is configured — a deployment without a database is valid', () => {
    expect(databaseEnv({})).toBeNull()
  })

  it('is null when the url is present but no usable secret is', () => {
    expect(databaseEnv({ SUPABASE_URL: 'https://x.supabase.co' })).toBeNull()
  })

  it('reads url and secret', () => {
    expect(
      databaseEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: SECRET }),
    ).toEqual({ url: 'https://x.supabase.co', secret: SECRET })
  })

  it('prefers the new secret name over the legacy service-role one', () => {
    const legacy = jwtWithRole('service_role')
    expect(
      databaseEnv({
        SUPABASE_URL: 'https://x.supabase.co',
        SUPABASE_SECRET_KEY: SECRET,
        SUPABASE_SERVICE_ROLE_KEY: legacy,
      })?.secret,
    ).toBe(SECRET)
  })

  it('falls back to the legacy name when the new one is absent', () => {
    const legacy = jwtWithRole('service_role')
    expect(
      databaseEnv({
        SUPABASE_URL: 'https://x.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: legacy,
      })?.secret,
    ).toBe(legacy)
  })

  it('skips a public key and keeps looking', () => {
    const legacy = jwtWithRole('service_role')
    expect(
      databaseEnv({
        SUPABASE_URL: 'https://x.supabase.co',
        SUPABASE_SECRET_KEY: 'sb_publishable_oops',
        SUPABASE_SERVICE_ROLE_KEY: legacy,
      })?.secret,
    ).toBe(legacy)
  })

  it('refuses a configuration whose only secret is the public key', () => {
    // deny-all RLS answers "no rows" rather than "forbidden", so accepting
    // this would produce a deployment that looks empty instead of broken
    expect(
      databaseEnv({
        SUPABASE_URL: 'https://x.supabase.co',
        SUPABASE_SECRET_KEY: 'sb_publishable_oops',
      }),
    ).toBeNull()
  })

  /**
   * The one that matters for #87: Vite inlines `VITE_*` into the client
   * bundle at build time, so a secret behind that prefix is a published
   * secret. This asserts the server does not even look there.
   */
  it('never reads a VITE_-prefixed variable', () => {
    expect(
      databaseEnv({
        VITE_SUPABASE_URL: 'https://x.supabase.co',
        VITE_SUPABASE_SECRET_KEY: SECRET,
        VITE_SUPABASE_SERVICE_ROLE_KEY: SECRET,
      }),
    ).toBeNull()
  })
})
