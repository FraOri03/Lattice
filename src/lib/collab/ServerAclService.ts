import type { CollabRole } from '@/types/collab'
import type { RoomAcl } from './acl'
import { authService } from '@/lib/auth/AuthService'
import { NotAuthenticatedError, sessionClient } from '@/lib/auth/sessionClient'
import { env, hasRealtimeBackend } from '@/lib/env'

/**
 * ServerAclService — keeps the realtime backend's project ACL in step
 * with local membership changes.
 *
 * The server is the authority (api/realtime/rooms re-checks the caller's
 * role on every request); this client merely REQUESTS changes. When the
 * realtime backend is not configured every call is a cheap no-op, so the
 * Phase 7 local/Drive collaboration flows keep working unchanged.
 *
 * Memberships are still *opened* with an e-mail address — an address is
 * all you have for someone you have not met — but from 16.2 the slot is
 * bound to the invitee's userId the first time they open the project, and
 * stops answering to the address (src/lib/collab/acl.ts). Invite people
 * with the address they sign in to Google with; after that, the address is
 * only a label.
 */

export interface AclResult {
  ok: boolean
  error?: string
}

/**
 * What the server says about a project's membership, in the four shapes the
 * UI has to render differently.
 *
 * A single `ok/error` pair cannot carry this: "there is no realtime backend
 * in this build" is not a problem, "this project has no rooms yet" is fixed
 * by its owner opening it, and "the server does not know you here" is fixed
 * by somebody else. Collapsing them is how the drift between the local
 * member list and the enforced ACL stayed invisible.
 */
export type ServerMembers =
  | { state: 'unconfigured' }
  | { state: 'no-rooms' }
  | { state: 'denied'; error: string }
  | { state: 'error'; error: string }
  | { state: 'ok'; acl: RoomAcl }

class ServerAclService {
  private async post(body: Record<string, unknown>): Promise<AclResult> {
    if (!hasRealtimeBackend) return { ok: true } // nothing to mirror
    try {
      const res = await sessionClient.post(env.realtimeRoomsUrl, body, () =>
        authService.getAccessToken(),
      )
      if (res.ok) return { ok: true }
      const payload = (await res.json().catch(() => null)) as { error?: string } | null
      return { ok: false, error: payload?.error ?? `Server ACL update failed (${res.status})` }
    } catch (err) {
      if (err instanceof NotAuthenticatedError) {
        return { ok: false, error: 'Sign in to update server permissions.' }
      }
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * The ACL the endpoints actually enforce, for this project.
   *
   * Read-only, and the only way the app can see the list that decides
   * anything: `ShareDialog` otherwise shows the LOCAL member list, which is
   * a different record kept in a different place and merged by a different
   * rule. When the two disagree the local one is the optimistic story — the
   * realtime token is minted from this one.
   */
  async members(projectId: string): Promise<ServerMembers> {
    if (!hasRealtimeBackend) return { state: 'unconfigured' }
    try {
      const res = await sessionClient.post(
        env.realtimeRoomsUrl,
        { action: 'members', projectId },
        () => authService.getAccessToken(),
      )
      if (res.ok) {
        const payload = (await res.json()) as { acl: RoomAcl }
        return { state: 'ok', acl: payload.acl }
      }
      const payload = (await res.json().catch(() => null)) as { error?: string } | null
      const error = payload?.error ?? `Server ACL read failed (${res.status})`
      if (res.status === 404) return { state: 'no-rooms' }
      if (res.status === 403) return { state: 'denied', error }
      if (res.status === 501) return { state: 'unconfigured' }
      return { state: 'error', error }
    } catch (err) {
      if (err instanceof NotAuthenticatedError) {
        return { state: 'error', error: 'Sign in to read server permissions.' }
      }
      return { state: 'error', error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Grant/change a member's role on the server (null removes them). */
  async setRole(
    projectId: string,
    email: string,
    role: CollabRole | null,
  ): Promise<AclResult> {
    if (!email) return { ok: false, error: 'Member has no e-mail address.' }
    const result = await this.post({ action: 'set-role', projectId, email, role })
    if (!result.ok) console.warn('[collab/acl] set-role failed:', result.error)
    return result
  }

  /**
   * Owner only: hand the project to another member.
   *
   * Its own call rather than `setRole(email, 'owner')`, because the endpoint
   * refuses to move the owner slot through `set-role` — the swap has to be
   * one write, or a project ends up with two owners or none.
   */
  async transferOwnership(projectId: string, email: string): Promise<AclResult> {
    if (!email) return { ok: false, error: 'Member has no e-mail address.' }
    const result = await this.post({ action: 'transfer-ownership', projectId, email })
    if (!result.ok) console.warn('[collab/acl] ownership transfer failed:', result.error)
    return result
  }

  /** Owner only: delete the project's realtime rooms. */
  async deleteRooms(projectId: string): Promise<AclResult> {
    const result = await this.post({ action: 'delete', projectId })
    if (!result.ok) console.warn('[collab/acl] room delete failed:', result.error)
    return result
  }
}

export const serverAcl = new ServerAclService()
