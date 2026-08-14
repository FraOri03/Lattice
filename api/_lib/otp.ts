import { randomInt, scrypt, timingSafeEqual } from 'node:crypto'
import { nid } from '../../src/lib/id.js'
import type { OtpCode } from '../../src/types/otpRecord.js'
import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_PER_EMAIL,
  OTP_MAX_PER_IP,
  OTP_RATE_WINDOW_MS,
  OTP_TTL_MS,
} from '../../src/types/otp.js'
import type { OtpRepository } from './db/repositories.js'
import { headerOf, type ApiRequest } from './session.js'

/**
 * E-mail one-time codes: minting, hashing, and the rules (Phase 17.3, #86).
 *
 * ## Six digits is not much, so everything else has to hold
 *
 * A million possibilities sounds like a lot until something can guess a
 * thousand a second. Four separate limits are what make this safe, and
 * removing any one of them undoes the others:
 *
 *  - the code dies after ten minutes;
 *  - it is single use, and a new request invalidates the last;
 *  - five wrong guesses burn it;
 *  - an address and a source can only ask so often.
 *
 * ## Why scrypt and not SHA-256
 *
 * Hashing six digits with a fast hash is barely hashing at all — a laptop
 * enumerates the whole space instantly, so a leaked table would be a leaked
 * set of live codes. scrypt salted with the address makes the dump worth
 * very little for the ten minutes it would matter.
 */

/* ---------------- minting ---------------- */

/**
 * A uniform six-digit code.
 *
 * `randomInt` is rejection-sampled by Node, so this has none of the modulo
 * bias that `random() % 1000000` would introduce — a bias that quietly
 * makes some codes likelier than others.
 */
export function mintCode(): string {
  const max = 10 ** OTP_LENGTH
  return String(randomInt(0, max)).padStart(OTP_LENGTH, '0')
}

/**
 * scrypt, salted with the address.
 *
 * The address as salt means two people who happen to be issued the same
 * digits get different hashes, so one leaked pair never reveals another.
 */
export function hashCode(code: string, email: string): Promise<string> {
  return new Promise((resolve, reject) => {
    scrypt(code, `lattice-otp:${email.toLowerCase()}`, 32, (err, key) => {
      if (err) reject(err)
      else resolve(key.toString('hex'))
    })
  })
}

/** Constant-time comparison of two scrypt digests. */
export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length || !a) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
  } catch {
    return false
  }
}

/* ---------------- addresses and sources ---------------- */

/** Lightweight shape check. Delivery is the real test of an address. */
export function normaliseEmail(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const email = raw.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ''
  return email
}

/**
 * The caller's source address, for rate limiting only.
 *
 * The LEFTMOST entry of `x-forwarded-for` is the client as the first proxy
 * saw it; everything after is the proxy chain. On Vercel the header is set
 * by the platform, so it cannot be spoofed end-to-end — but this value is
 * never used for anything but counting, precisely because a header is a
 * weak thing to trust.
 */
export function sourceIp(req: ApiRequest): string {
  const forwarded = headerOf(req, 'x-forwarded-for')
  const first = forwarded.split(',')[0]?.trim() ?? ''
  return (first || headerOf(req, 'x-real-ip')).slice(0, 64)
}

/* ---------------- the rules ---------------- */

export interface RateDecision {
  allowed: boolean
  /** Which ceiling was hit. Never told to the caller; for logs only. */
  reason?: 'email' | 'ip'
}

/**
 * Whether another code may be issued.
 *
 * The result is deliberately NOT reflected in what the endpoint says. A
 * response that admitted "you are being rate limited" would confirm that
 * earlier requests for that address were counted, which is the account
 * enumeration this flow must not permit.
 */
export async function rateCheck(
  otp: OtpRepository,
  email: string,
  ip: string,
  now = Date.now(),
): Promise<RateDecision> {
  const since = now - OTP_RATE_WINDOW_MS
  if ((await otp.countForEmail(email, since)) >= OTP_MAX_PER_EMAIL) {
    return { allowed: false, reason: 'email' }
  }
  if (ip && (await otp.countForIp(ip, since)) >= OTP_MAX_PER_IP) {
    return { allowed: false, reason: 'ip' }
  }
  return { allowed: true }
}

/** Mint, hash and store a code, invalidating any earlier live one. */
export async function issueCode(
  otp: OtpRepository,
  email: string,
  ip: string,
  now = Date.now(),
): Promise<{ code: string; record: OtpCode }> {
  const code = mintCode()
  const record: OtpCode = {
    id: nid('otp'),
    email,
    codeHash: await hashCode(code, email),
    createdAt: now,
    expiresAt: now + OTP_TTL_MS,
    consumedAt: null,
    attempts: 0,
    requestIp: ip,
  }
  await otp.issue(record)
  return { code, record }
}

/**
 * Check a code and burn it if it is right.
 *
 * Every failure returns the same `false`. "No code was requested", "the
 * code expired", "wrong digits" and "too many attempts" are four different
 * situations that must look identical from outside, or the endpoint starts
 * answering questions about which addresses have sign-ins in flight.
 */
export async function verifyCode(
  otp: OtpRepository,
  email: string,
  presented: string,
  now = Date.now(),
): Promise<boolean> {
  const live = await otp.liveFor(email, now)
  if (!live) return false

  // out of attempts: burn it rather than letting it linger
  if (live.attempts >= OTP_MAX_ATTEMPTS) {
    await otp.consume(live.id, now)
    return false
  }

  const digits = typeof presented === 'string' ? presented.trim() : ''
  if (!/^\d+$/.test(digits) || digits.length !== OTP_LENGTH) {
    // still counts as an attempt: a malformed guess is a guess
    await otp.noteAttempt(live.id)
    return false
  }

  const hash = await hashCode(digits, email)
  if (!sameHash(hash, live.codeHash)) {
    const attempts = await otp.noteAttempt(live.id)
    if (attempts >= OTP_MAX_ATTEMPTS) await otp.consume(live.id, now)
    return false
  }

  // single use: the winning guess is the last one this code accepts
  await otp.consume(live.id, now)
  return true
}
