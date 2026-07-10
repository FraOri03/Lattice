import type { CollabRole } from '@/types/collab'
import { authService } from '@/lib/auth/AuthService'
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
 * ACL keys are Google account e-mails: invite people with the address
 * they sign in to Google with.
 */

export interface AclResult {
  ok: boolean
  error?: string
}

class ServerAclService {
  private async post(body: Record<string, unknown>): Promise<AclResult> {
    if (!hasRealtimeBackend) return { ok: true } // nothing to mirror
    const googleToken = await authService.getAccessToken()
    if (!googleToken) {
      return { ok: false, error: 'Sign in with Google to update server permissions.' }
    }
    try {
      const res = await fetch(env.realtimeRoomsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, googleToken }),
      })
      if (res.ok) return { ok: true }
      const payload = (await res.json().catch(() => null)) as { error?: string } | null
      return { ok: false, error: payload?.error ?? `Server ACL update failed (${res.status})` }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
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

  /** Owner only: delete the project's realtime rooms. */
  async deleteRooms(projectId: string): Promise<AclResult> {
    const result = await this.post({ action: 'delete', projectId })
    if (!result.ok) console.warn('[collab/acl] room delete failed:', result.error)
    return result
  }
}

export const serverAcl = new ServerAclService()
