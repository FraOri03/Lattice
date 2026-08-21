import { notificationService } from './NotificationService'
import type { AclResult } from './ServerAclService'

/**
 * serverMirror — carry a local membership change to the server, and say so
 * when the server would not take it.
 *
 * Every grant in Lattice is written twice: once in the local member list,
 * which is what the UI reads, and once in the realtime ACL, which is what
 * the endpoints enforce. The second write was fire-and-forget in every
 * caller — `void import('./ServerAclService').then(…)` — and its failures
 * reached a `console.warn` and stopped there.
 *
 * Both directions of that silence are real:
 *
 *  - **a grant that never landed.** Inviting somebody to a project whose
 *    realtime rooms do not exist yet answers 404 (`set-role` has no ACL to
 *    write into). The invitation is minted, the recipient accepts, opens the
 *    project — and gets a red "No access" lock with the endpoint's own
 *    sentence in the tooltip. Nobody was told.
 *  - **a revocation that never landed**, which is worse: the member vanishes
 *    from the sender's screen and keeps write access on the server.
 *
 * So a mirror that fails is now an event, not a log line. It goes through
 * `notificationService.notify` rather than a toast because the caller is
 * often not a person waiting — a background broadcast, a sweep across a
 * whole vault — and because that path already carries the mute preferences
 * (14.4) instead of inventing a second gate.
 *
 * Where a person IS waiting on the answer — the invite composer, one row's
 * "Reserve on the server" button — the caller awaits `serverAcl` directly
 * and reports inline. Duplicating it here would tell them twice.
 */

/**
 * @param projectId  the project the change belongs to, for the notification's
 *                   deep link and for the per-project mute
 * @param consequence what is still true because the write did not happen,
 *                   phrased as the fact the reader has to act on — never
 *                   "the request failed"
 */
export async function mirrorToServer(
  projectId: string,
  consequence: string,
  call: () => Promise<AclResult>,
): Promise<AclResult> {
  const result = await call()
  if (!result.ok) {
    notificationService.notify(
      projectId,
      'realtime-failure',
      'Server permissions were not updated',
      `${consequence} ${result.error ?? ''}`.trim(),
    )
  }
  return result
}
