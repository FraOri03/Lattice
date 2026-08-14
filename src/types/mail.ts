/**
 * Mail sending limits (Phase 18.2, #89).
 *
 * Shared with the browser for the same reason `otp.ts` is: the UI has to be
 * able to say what the ceiling is, and a copy of the number in a component
 * is a copy that drifts. Nothing here decides anything — the endpoint does —
 * but both read the same constants.
 */

export type MailKind = 'invitation' | 'sign-in-code'

/** One message that was attempted. Content is never recorded. */
export interface MailSend {
  id: string
  kind: MailKind
  /** Lowercased recipient address. */
  recipient: string
  /** The projectId an invitation belongs to; '' when the message has none. */
  scope: string
  createdAt: number
}

/** The window every ceiling below is counted over. */
export const MAIL_WINDOW_MS = 60 * 60 * 1000

/**
 * Per address, across every project.
 *
 * The limit that protects the *recipient*: without it, a handful of members
 * on unrelated projects can point Lattice at one mailbox and let it do the
 * flooding. Five in an hour is already more invitations than anyone gets.
 */
export const MAIL_MAX_PER_RECIPIENT = 5

/**
 * Per project, across every address.
 *
 * The limit that protects everyone else: one compromised or careless account
 * inviting a stolen contact list is the abuse this bounds. Twenty an hour
 * leaves an ordinary team onboarding untouched — 18.1 already stops repeat
 * invitations to the same address from consuming any of it.
 */
export const MAIL_MAX_PER_PROJECT = 20

/**
 * What happened to the message, reported alongside the invitation.
 *
 * The record and the link are valid in all three cases — delivery is a
 * separate thing from the invitation existing, and saying so lets the UI
 * offer the link instead of implying a mail is on its way when it is not.
 */
export type MailDelivery = 'sent' | 'failed' | 'unavailable'
