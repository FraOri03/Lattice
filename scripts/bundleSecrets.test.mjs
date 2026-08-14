import { describe, expect, it } from 'vitest'
import {
  auditBundle,
  dangerousNames,
  findCredentialShapes,
  findLeakedValues,
  isCheckableValue,
  isPublicByDefinition,
  isSecretName,
} from './bundleSecrets.mjs'

/**
 * The check that guards the boundary of this deployment (17.4, #87).
 *
 * Worth testing carefully for two opposite reasons: a check that misses a
 * leak is useless, and a check that cries wolf gets disabled — which is
 * the same outcome by a slower route.
 */

const file = (text, path = 'dist/assets/index.js') => ({ path, text })

/** A JWT-shaped string whose payload claims the given role. */
function jwt(role) {
  const payload = Buffer.from(JSON.stringify({ role, iss: 'supabase' })).toString(
    'base64url',
  )
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.c2lnbmF0dXJlLXZhbHVl`
}

describe('recognising a secret by its name', () => {
  it('catches the obvious ones', () => {
    for (const name of [
      'SUPABASE_SECRET_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'LIVEBLOCKS_SECRET_KEY',
      'LIVEKIT_API_SECRET',
      'GITHUB_CLIENT_SECRET',
      'RESEND_API_KEY',
      'POSTGRES_PASSWORD',
      'SUPABASE_JWT_SECRET',
    ]) {
      expect(isSecretName(name), name).toBe(true)
    }
  })

  /**
   * The anon key is public by definition — RLS is what makes that safe.
   * Flagging it would train everyone to ignore this check, which is worse
   * than not having one.
   */
  it('does not flag what is public by definition', () => {
    for (const name of [
      'SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'VITE_GOOGLE_CLIENT_ID',
      'VITE_GITHUB_CLIENT_ID',
      'VITE_LIVEKIT_URL',
      'SUPABASE_PUBLISHABLE_KEY',
      // a Google browser key: referrer-restricted, not secret
      'VITE_GOOGLE_API_KEY',
    ]) {
      expect(isSecretName(name), name).toBe(false)
      expect(isPublicByDefinition(name), name).toBe(true)
    }
  })

  /** The allowlist is by NAME, so a real secret API key still trips. */
  it('still flags an API key that is not on the allowlist', () => {
    expect(isSecretName('VITE_SENTRY_API_KEY')).toBe(true)
    expect(isSecretName('MAILGUN_API_KEY')).toBe(true)
  })

  it('does not flag ordinary configuration', () => {
    for (const name of ['VITE_APP_ENV', 'VITE_REALTIME_BACKEND', 'SUPABASE_URL', 'MAIL_FROM']) {
      expect(isSecretName(name), name).toBe(false)
    }
  })
})

describe('a secret given a VITE_ prefix', () => {
  /** The mistake the phase exists to make impossible. */
  it('is caught before it ever holds a value', () => {
    expect(
      dangerousNames([
        'VITE_SUPABASE_SECRET_KEY',
        'VITE_GOOGLE_CLIENT_ID',
        'SUPABASE_SECRET_KEY',
      ]),
    ).toEqual(['VITE_SUPABASE_SECRET_KEY'])
  })

  it('catches a service-role key behind the prefix', () => {
    expect(dangerousNames(['VITE_SUPABASE_SERVICE_ROLE_KEY'])).toHaveLength(1)
  })

  it('leaves the correctly-named server variables alone', () => {
    expect(
      dangerousNames(['SUPABASE_SECRET_KEY', 'LIVEBLOCKS_SECRET_KEY', 'RESEND_API_KEY']),
    ).toEqual([])
  })
})

describe('a secret value that reached the output', () => {
  it('is found verbatim', () => {
    const findings = findLeakedValues(
      { SUPABASE_SECRET_KEY: 'sb_secret_abcdefghijklmnop' },
      [file('const k="sb_secret_abcdefghijklmnop";')],
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].name).toBe('SUPABASE_SECRET_KEY')
  })

  it('says nothing when the bundle is clean', () => {
    expect(
      findLeakedValues({ SUPABASE_SECRET_KEY: 'sb_secret_abcdefghijklmnop' }, [
        file('const k=import.meta.env.VITE_APP_ENV;'),
      ]),
    ).toEqual([])
  })

  it('ignores the anon key, which is meant to be there', () => {
    const anon = jwt('anon')
    expect(findLeakedValues({ SUPABASE_ANON_KEY: anon }, [file(anon)])).toEqual([])
  })

  /** Matching "production" everywhere would bury a real finding in noise. */
  it('ignores values too ordinary to mean anything', () => {
    expect(isCheckableValue('production')).toBe(false)
    expect(isCheckableValue('true')).toBe(false)
    expect(isCheckableValue('8080')).toBe(false)
    expect(isCheckableValue('short')).toBe(false)
    expect(isCheckableValue('sb_secret_abcdefghijklmnop')).toBe(true)
  })

  it('reports a variable once, not once per file', () => {
    const findings = findLeakedValues({ LIVEBLOCKS_SECRET_KEY: 'sk_live_aaaaaaaaaaaaaaaaaaaa' }, [
      file('leak', 'dist/a.js'),
      file('sk_live_aaaaaaaaaaaaaaaaaaaa', 'dist/b.js'),
      file('sk_live_aaaaaaaaaaaaaaaaaaaa', 'dist/c.js'),
    ])
    expect(findings).toHaveLength(1)
  })
})

describe('credential shapes, with no environment to help', () => {
  it('catches a key pasted into a source file', () => {
    const cases = [
      'sb_secret_zzzzzzzzzzzzzzzz',
      're_abcd1234_abcdefghijklmnopqrst',
      'sk_live_abcdefghijklmnopqrst',
      'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
      '-----BEGIN PRIVATE KEY-----',
      'postgresql://user:hunter2@db.example.com:5432/postgres',
    ]
    for (const text of cases) {
      expect(findCredentialShapes([file(text)]), text).not.toHaveLength(0)
    }
  })

  /** A service_role JWT is the one that bypasses row level security. */
  it('catches a privileged JWT and spares the anon one', () => {
    expect(findCredentialShapes([file(jwt('service_role'))])).toHaveLength(1)
    expect(findCredentialShapes([file(jwt('anon'))])).toHaveLength(0)
  })

  it('leaves an ordinary bundle alone', () => {
    expect(
      findCredentialShapes([
        file('const a=1;function b(){return"https://x.supabase.co"}'),
      ]),
    ).toEqual([])
  })
})

describe('the whole audit', () => {
  it('passes a clean build', () => {
    expect(
      auditBundle({
        env: { SUPABASE_SECRET_KEY: 'sb_secret_abcdefghijklmnop' },
        envNames: ['SUPABASE_SECRET_KEY', 'VITE_GOOGLE_CLIENT_ID'],
        files: [file('console.log("hello")')],
      }),
    ).toEqual([])
  })

  it('reports a name mistake and a value leak together', () => {
    const findings = auditBundle({
      env: { SUPABASE_SECRET_KEY: 'sb_secret_abcdefghijklmnop' },
      envNames: ['VITE_LIVEKIT_API_SECRET', 'SUPABASE_SECRET_KEY'],
      files: [file('const k="sb_secret_abcdefghijklmnop";')],
    })
    expect(findings.map((f) => f.kind).sort()).toEqual(['name', 'shape', 'value'])
  })
})
