import { nid } from '../../src/lib/id.js'
import type { MailKind } from '../../src/types/mail.js'
import {
  MAIL_MAX_PER_PROJECT,
  MAIL_MAX_PER_RECIPIENT,
  MAIL_WINDOW_MS,
} from '../../src/types/mail.js'
import type { MailSendRepository } from './db/repositories.js'

/**
 * How much mail one address and one project may cause (Phase 18.2, #89).
 *
 * The shape is 17.3's, deliberately: a ceiling is worth nothing unless the
 * thing it counts is the thing being abused, so this counts **messages**,
 * not invitations. An invitation that is resent fifty times is one row in
 * `project_invitations` and fifty e-mails, and only the second number is a
 * problem for the person receiving them.
 *
 * ## Two ceilings, protecting two different people
 *
 * Per recipient, across every project: without it, members of unrelated
 * projects can each stay under a per-project limit and still point Lattice
 * at one mailbox together.
 *
 * Per project, across every address: without it, one careless or stolen
 * account can mail a contact list.
 *
 * Either alone leaves the other route open, which is why both are checked
 * and the stricter answer wins.
 *
 * ## Refusing is visible here, unlike the OTP
 *
 * 17.3 hides its throttle, because admitting one would confirm that earlier
 * requests for that address were counted — and that is a fact about whether
 * somebody has an account. Nothing of the sort applies here: the caller is
 * an authenticated member acting on their own project, they already know the
 * address they typed, and telling them plainly that they have hit a limit is
 * the difference between a rule and a silent failure.
 */

export interface MailAllowance {
  allowed: boolean
  /** Which ceiling refused, for a message the caller can act on. */
  reason?: 'recipient' | 'project'
}

export async function mailAllowance(
  repo: MailSendRepository,
  recipient: string,
  scope: string,
  now = Date.now(),
): Promise<MailAllowance> {
  const since = now - MAIL_WINDOW_MS

  const toRecipient = await repo.countForRecipient(recipient, since)
  if (toRecipient >= MAIL_MAX_PER_RECIPIENT) {
    return { allowed: false, reason: 'recipient' }
  }

  if (scope) {
    const fromProject = await repo.countForScope(scope, since)
    if (fromProject >= MAIL_MAX_PER_PROJECT) {
      return { allowed: false, reason: 'project' }
    }
  }

  return { allowed: true }
}

/**
 * Write the attempt down.
 *
 * Recorded whether or not the provider then accepts the message, because the
 * limit exists to bound what Lattice *tries* to send. A failed delivery that
 * did not count would make retrying a way around the ceiling.
 */
export async function recordSend(
  repo: MailSendRepository,
  kind: MailKind,
  recipient: string,
  scope = '',
  now = Date.now(),
): Promise<void> {
  await repo.record({
    id: nid('mls'),
    kind,
    recipient: recipient.toLowerCase(),
    scope,
    createdAt: now,
  })
}

/** What a caller is told when a ceiling refused. */
export function limitMessage(reason: MailAllowance['reason']): string {
  return reason === 'project'
    ? 'This project has sent too many invitations in the last hour. Try again later.'
    : 'This address has been invited too many times in the last hour. Try again later.'
}
