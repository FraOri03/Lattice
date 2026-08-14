import { describe, expect, it } from 'vitest'
import { MemoryRepositories } from './db/memory.js'
import {
  hashCode,
  issueCode,
  mintCode,
  normaliseEmail,
  rateCheck,
  sameHash,
  sourceIp,
  verifyCode,
} from './otp.js'
import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_PER_EMAIL,
  OTP_MAX_PER_IP,
  OTP_RATE_WINDOW_MS,
  OTP_TTL_MS,
} from '../../src/types/otp.js'

/**
 * The four limits that make six digits safe (17.3, #86). Each one is
 * load-bearing: removing any of them undoes the others.
 */

const EMAIL = 'ada@example.com'
const IP = '203.0.113.7'

/** Issue a code and hand back the digits the user would have received. */
async function issue(db: MemoryRepositories, email = EMAIL, ip = IP, now = Date.now()) {
  return issueCode(db.otp, email, ip, now)
}

describe('minting', () => {
  it('is six digits, zero-padded', () => {
    for (let i = 0; i < 200; i++) {
      const code = mintCode()
      expect(code).toMatch(/^\d{6}$/)
      expect(code).toHaveLength(OTP_LENGTH)
    }
  })

  it('does not repeat itself in any obvious way', () => {
    const seen = new Set(Array.from({ length: 200 }, () => mintCode()))
    // birthday-safe: 200 draws from a million should almost never collide
    expect(seen.size).toBeGreaterThan(190)
  })
})

describe('hashing', () => {
  it('is deterministic for the same code and address', async () => {
    expect(await hashCode('123456', EMAIL)).toBe(await hashCode('123456', EMAIL))
  })

  /** The address as salt: the same digits for two people hash differently. */
  it('salts with the address', async () => {
    expect(await hashCode('123456', EMAIL)).not.toBe(
      await hashCode('123456', 'grace@example.com'),
    )
  })

  it('does not contain the code', async () => {
    expect(await hashCode('123456', EMAIL)).not.toContain('123456')
  })

  it('compares in constant time and rejects a length mismatch', async () => {
    const h = await hashCode('123456', EMAIL)
    expect(sameHash(h, h)).toBe(true)
    expect(sameHash(h, await hashCode('654321', EMAIL))).toBe(false)
    expect(sameHash(h, 'short')).toBe(false)
    expect(sameHash('', '')).toBe(false)
  })
})

describe('addresses and sources', () => {
  it('normalises and validates an address', () => {
    expect(normaliseEmail('  ADA@Example.COM ')).toBe(EMAIL)
    expect(normaliseEmail('not-an-address')).toBe('')
    expect(normaliseEmail(42)).toBe('')
    expect(normaliseEmail(`${'a'.repeat(250)}@x.com`)).toBe('')
  })

  it('takes the leftmost forwarded address as the client', () => {
    expect(
      sourceIp({ headers: { 'x-forwarded-for': '203.0.113.7, 70.41.3.18' } }),
    ).toBe('203.0.113.7')
  })

  it('falls back to x-real-ip, and to nothing at all', () => {
    expect(sourceIp({ headers: { 'x-real-ip': '198.51.100.4' } })).toBe('198.51.100.4')
    expect(sourceIp({ headers: {} })).toBe('')
  })
})

describe('the code itself', () => {
  it('verifies once, and only once', async () => {
    const db = new MemoryRepositories()
    const { code } = await issue(db)
    expect(await verifyCode(db.otp, EMAIL, code)).toBe(true)
    // single use: the winning guess is the last one this code accepts
    expect(await verifyCode(db.otp, EMAIL, code)).toBe(false)
  })

  it('never stores the digits', async () => {
    const db = new MemoryRepositories()
    const { code } = await issue(db)
    expect(JSON.stringify(db.data.otp)).not.toContain(code)
  })

  it('rejects the wrong digits', async () => {
    const db = new MemoryRepositories()
    const { code } = await issue(db)
    const wrong = code === '000000' ? '111111' : '000000'
    expect(await verifyCode(db.otp, EMAIL, wrong)).toBe(false)
  })

  it('expires', async () => {
    const db = new MemoryRepositories()
    const now = Date.now()
    const { code } = await issue(db, EMAIL, IP, now)
    expect(await verifyCode(db.otp, EMAIL, code, now + OTP_TTL_MS + 1)).toBe(false)
  })

  /** "Previous codes invalidated" — a requirement, so it is a repository op. */
  it('invalidates the previous code when a new one is issued', async () => {
    const db = new MemoryRepositories()
    const first = await issue(db)
    await issue(db)
    expect(await verifyCode(db.otp, EMAIL, first.code)).toBe(false)
  })

  it('burns the code after too many wrong guesses', async () => {
    const db = new MemoryRepositories()
    const { code } = await issue(db)
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      expect(await verifyCode(db.otp, EMAIL, wrong)).toBe(false)
    }
    // even the RIGHT code is dead now — this is what stops brute force
    expect(await verifyCode(db.otp, EMAIL, code)).toBe(false)
  })

  it('counts a malformed guess as an attempt', async () => {
    const db = new MemoryRepositories()
    const { code } = await issue(db)
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      expect(await verifyCode(db.otp, EMAIL, 'abcdef')).toBe(false)
    }
    expect(await verifyCode(db.otp, EMAIL, code)).toBe(false)
  })

  it('does not let one address burn another address’s code', async () => {
    const db = new MemoryRepositories()
    const mine = await issue(db, EMAIL)
    const wrong = mine.code === '000000' ? '111111' : '000000'
    for (let i = 0; i < OTP_MAX_ATTEMPTS + 2; i++) {
      await verifyCode(db.otp, 'grace@example.com', wrong)
    }
    expect(await verifyCode(db.otp, EMAIL, mine.code)).toBe(true)
  })

  it('answers false when no code was ever requested', async () => {
    const db = new MemoryRepositories()
    expect(await verifyCode(db.otp, EMAIL, '123456')).toBe(false)
  })
})

describe('rate limiting', () => {
  it('allows a reasonable number of requests', async () => {
    const db = new MemoryRepositories()
    const now = Date.now()
    for (let i = 0; i < OTP_MAX_PER_EMAIL; i++) {
      expect((await rateCheck(db.otp, EMAIL, IP, now)).allowed).toBe(true)
      await issue(db, EMAIL, IP, now)
    }
  })

  it('stops an address asking forever', async () => {
    const db = new MemoryRepositories()
    const now = Date.now()
    for (let i = 0; i < OTP_MAX_PER_EMAIL; i++) await issue(db, EMAIL, IP, now)
    const decision = await rateCheck(db.otp, EMAIL, IP, now)
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('email')
  })

  it('lets the window pass', async () => {
    const db = new MemoryRepositories()
    const now = Date.now()
    for (let i = 0; i < OTP_MAX_PER_EMAIL; i++) await issue(db, EMAIL, IP, now)
    const later = now + OTP_RATE_WINDOW_MS + 1
    expect((await rateCheck(db.otp, EMAIL, IP, later)).allowed).toBe(true)
  })

  it('stops one source spraying many addresses', async () => {
    const db = new MemoryRepositories()
    const now = Date.now()
    for (let i = 0; i < OTP_MAX_PER_IP; i++) {
      await issue(db, `person${i}@example.com`, IP, now)
    }
    const decision = await rateCheck(db.otp, 'fresh@example.com', IP, now)
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toBe('ip')
  })

  it('does not let a request with no source address escape the per-address limit', async () => {
    const db = new MemoryRepositories()
    const now = Date.now()
    for (let i = 0; i < OTP_MAX_PER_EMAIL; i++) await issue(db, EMAIL, '', now)
    expect((await rateCheck(db.otp, EMAIL, '', now)).allowed).toBe(false)
  })
})
