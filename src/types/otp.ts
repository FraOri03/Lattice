/* ---------------- e-mail one-time codes (Phase 17.3) ---------------- */

/**
 * Passwordless sign-in: an address, a six-digit code, and the session
 * 17.2 already issues.
 *
 * The numbers below are the security policy, in one place, shared by the
 * server that enforces them and the UI that has to explain them. A ceiling
 * the interface describes differently from the one the endpoint applies is
 * a support ticket waiting to happen.
 */

/** A code is dead ten minutes after it is minted. */
export const OTP_TTL_MS = 10 * 60 * 1000

/** Digits in a code. Six is what people can carry from a mail client. */
export const OTP_LENGTH = 6

/**
 * Wrong guesses allowed against one code before it is burned.
 *
 * Six digits is a million possibilities; five guesses in ten minutes makes
 * brute force hopeless without making a typo fatal.
 */
export const OTP_MAX_ATTEMPTS = 5

/** Window both rate limits are measured over. */
export const OTP_RATE_WINDOW_MS = 60 * 60 * 1000

/** Codes one address may request per window. Protects the mailbox owner. */
export const OTP_MAX_PER_EMAIL = 5

/**
 * Codes one source address may request per window.
 *
 * Higher than the per-address limit because a shared office NAT is one IP
 * for many people, and lower than "unlimited" because one script is also
 * one IP.
 */
export const OTP_MAX_PER_IP = 20

/**
 * What the server says after a code request — always this, whatever
 * happened.
 *
 * The response cannot depend on whether the address has an account, or the
 * endpoint becomes a way to ask "is this person a Lattice user?" one
 * address at a time. Rate limiting answers the same way for the same
 * reason: telling a caller they have been throttled tells them their
 * earlier guesses were being counted.
 */
export interface OtpRequestResult {
  /** Always true when the request was well-formed. Never a signal. */
  sent: boolean
  /** How long the code will live, so the UI can say it plainly. */
  expiresInMs: number
}

/** Why a verification failed, as far as the caller is ever told. */
export type OtpFailure = 'invalid' | 'unavailable'

export interface OtpVerifyFailure {
  ok: false
  reason: OtpFailure
}
