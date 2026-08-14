/**
 * The stored form of a one-time code (Phase 17.3, #86).
 *
 * Separate from `otp.ts` — which holds the policy the browser also needs —
 * because nothing here should ever reach a client bundle. `codeHash` is a
 * hash, not a code, but a record that describes the security state of a
 * sign-in in flight has no business being shipped to a browser at all.
 */
export interface OtpCode {
  id: string
  email: string
  /** scrypt of the digits, salted with the address. Never the digits. */
  codeHash: string
  createdAt: number
  expiresAt: number
  /** Set when accepted, superseded, or burned by too many wrong guesses. */
  consumedAt: number | null
  attempts: number
  requestIp: string
}
