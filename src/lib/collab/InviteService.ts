import { nid } from '@/lib/id'
import type { CollabRole, ProjectInvite } from '@/types/collab'
import { authService } from '@/lib/auth/AuthService'
import { NotAuthenticatedError, sessionClient } from '@/lib/auth/sessionClient'
import { useCollabStore } from './collabStore'
import { currentIdentity } from './CollaborationProvider'
import { membersService } from './MembersService'
import { activityLog } from './ActivityLogService'
import { collabHub } from './hub'
import { INVITE_TTL_MS, effectiveStatus, isLive } from './invitations'

/**
 * InviteService — invite people to a project by e-mail address.
 *
 * ## Where the invitation lives (18.1, #88)
 *
 * It used to live here. The token was generated in this file and looked up
 * in `collabStore`, which works precisely as long as the invitation never
 * leaves the device that made it — and the recipient of a mailed invitation
 * is, by definition, on another one. So the record moved to the server
 * (`/api/invitations`), which mints the token, stores its digest, owns the
 * deadline and answers `resolve` for a link opened anywhere.
 *
 * The local path did not go away, because it is not a fallback for a broken
 * deployment: it is the Phase 7 tier. A Lattice with no database still
 * collaborates over a shared browser or a shared Drive, and invitations
 * there keep working exactly as before. `serverAvailable` goes false on the
 * first 501 and this file stops asking.
 *
 * ## The token, and the one copy of it that survives
 *
 * The server returns the raw token exactly once — the reply to `create` and
 * `resend` — because that is the only moment a link can be built. That copy
 * is kept HERE, on the inviter's own device, so "copy link" still works
 * after a reload. Everywhere else the invitation carries only its digest, so
 * a list of invitations is not a list of credentials.
 *
 * An invitation loaded from the server on a device that did not create it
 * therefore has no link to offer, and {@link InviteService.linkFor} says so
 * by returning null rather than producing a URL that opens nothing.
 *
 * ## What this file still does NOT do
 *
 * Verify who is accepting. {@link InviteService.accept} adds the CURRENT
 * identity as a member without checking that it owns the invited address,
 * which is the hole 18.3 (#90) exists to close. 18.1 deliberately does not
 * make that reachable from a link opened on another device: a server-resolved
 * invitation reports `source: 'server'`, and the caller is expected to refuse
 * to accept it locally.
 */

const INVITATIONS_URL = '/api/invitations'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** What the server said, or null when there is no server to ask. */
type Reply<T> = { ok: true; data: T } | { ok: false; error: string } | null

export interface InviteResult {
  ok: boolean
  invite?: ProjectInvite
  /** The server's own words when it refused; absent for a local rejection. */
  error?: string
}

/**
 * Where an invitation was found.
 *
 * `local` means this browser holds the invitation itself; `server` means only
 * the record does, and the person opening the link is somewhere the store
 * cannot see — which is exactly the case acceptance is not yet safe for.
 */
export interface InviteLookup {
  invite: ProjectInvite
  source: 'local' | 'server'
}

class InviteService {
  /** False once the server has said it has no database. Sticky, like sessionClient. */
  private serverAvailable = true

  /* ---------------- talking to the server ---------------- */

  /** An action only a member may perform, authenticated by the session. */
  private async ask<T>(body: Record<string, unknown>): Promise<Reply<T>> {
    if (!this.serverAvailable) return null
    try {
      const res = await sessionClient.post(INVITATIONS_URL, body, () =>
        authService.getAccessToken(),
      )
      if (res.status === 501) {
        this.serverAvailable = false
        return null
      }
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null
        return { ok: false, error: payload?.error ?? `Request failed (${res.status})` }
      }
      return { ok: true, data: (await res.json()) as T }
    } catch (err) {
      if (err instanceof NotAuthenticatedError) return null
      console.warn('[collab/invite] server call failed:', err)
      return null
    }
  }

  /**
   * An action the TOKEN authenticates, for someone who may not be signed in.
   *
   * A plain fetch, deliberately: the recipient of a link has no session yet
   * and no Google token to fall back on, and `sessionClient.post` would throw
   * before the request left the browser.
   */
  private async askWithToken<T>(body: Record<string, unknown>): Promise<Reply<T>> {
    if (!this.serverAvailable) return null
    try {
      const res = await fetch(INVITATIONS_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 501) {
        this.serverAvailable = false
        return null
      }
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null
        return { ok: false, error: payload?.error ?? `Request failed (${res.status})` }
      }
      return { ok: true, data: (await res.json()) as T }
    } catch {
      return null
    }
  }

  /* ---------------- reading ---------------- */

  /**
   * This project's invitations, with the clock already applied — an offer
   * whose deadline passed reads as `expired` here rather than waiting for a
   * server round-trip to admit it.
   */
  invitesOf(projectId: string): ProjectInvite[] {
    const now = Date.now()
    const stored = useCollabStore.getState().invites[projectId] ?? []
    return stored.map((invite) => {
      const status = effectiveStatus(invite, now)
      return status === invite.status ? invite : { ...invite, status }
    })
  }

  /**
   * Pull the server's list into the store.
   *
   * The server is the authority on everything except the raw token, which it
   * cannot return and this device may still hold — so a local token is
   * carried over onto the record that replaces it, and "copy link" survives
   * a refresh.
   */
  async refresh(projectId: string): Promise<void> {
    const reply = await this.ask<{ invites: ProjectInvite[] }>({
      action: 'list',
      projectId,
    })
    if (!reply?.ok) return
    const tokens = new Map(
      this.invitesOf(projectId)
        .filter((i) => i.token)
        .map((i) => [i.id, i.token as string]),
    )
    const merged = reply.data.invites.map((invite) => {
      const token = tokens.get(invite.id)
      return token ? { ...invite, token } : invite
    })
    useCollabStore.getState().setInvites(projectId, merged)
    collabHub.broadcastState(projectId)
  }

  /**
   * The invitation a link points at: this browser first, the server second.
   *
   * The second half is the whole point of 18.1 — before it, a link opened
   * anywhere but the inviter's own browser found nothing at all.
   */
  async findByToken(token: string): Promise<InviteLookup | null> {
    const now = Date.now()
    for (const list of Object.values(useCollabStore.getState().invites)) {
      const hit = list.find((i) => i.token === token && isLive(i, now))
      if (hit) return { invite: hit, source: 'local' }
    }
    const reply = await this.askWithToken<{ invite: ProjectInvite }>({
      action: 'resolve',
      token,
    })
    if (!reply?.ok) return null
    return isLive(reply.data.invite, now)
      ? { invite: reply.data.invite, source: 'server' }
      : null
  }

  /**
   * The URL for an invitation, or null when this device does not hold its
   * token — a record loaded from the server, or one whose token was rotated
   * by a resend somewhere else. Null is the honest answer: the alternative
   * is a link that resolves to nothing.
   */
  linkFor(invite: ProjectInvite): string | null {
    if (!invite.token) return null
    return `${location.origin}${location.pathname}#invite=${invite.token}`
  }

  /* ---------------- writing ---------------- */

  async create(
    projectId: string,
    email: string,
    role: CollabRole,
  ): Promise<InviteResult> {
    const clean = email.trim().toLowerCase()
    if (!EMAIL.test(clean)) return { ok: false }

    const existing = this.invitesOf(projectId).find(
      (i) => i.email === clean && i.status === 'pending',
    )
    if (existing) return { ok: true, invite: existing }

    const reply = await this.ask<{ invite: ProjectInvite; token: string | null }>({
      action: 'create',
      projectId,
      email: clean,
      role,
    })
    if (reply && !reply.ok) return { ok: false, error: reply.error }

    const invite: ProjectInvite = reply
      ? { ...reply.data.invite, ...(reply.data.token ? { token: reply.data.token } : {}) }
      : this.localInvite(projectId, clean, role)

    this.store(projectId, [invite, ...this.invitesOf(projectId)])
    activityLog.log(projectId, 'member.invited', `${clean} was invited as ${role}`, invite.id)
    // reserve the role server-side so the invitee is recognised by the
    // realtime backend the moment they sign in (16.2's unbound slot)
    void import('./ServerAclService').then(({ serverAcl }) =>
      serverAcl.setRole(projectId, clean, role),
    )
    return { ok: true, invite }
  }

  /**
   * Send it again — which, when a server holds the record, mints a NEW token
   * and retires the old link.
   *
   * That is not a choice this file makes: the server stores a digest, so the
   * previous link is unreproducible, and a resend that kept it could never
   * put a link in a message. The reply carries the new token, and it is
   * stored here so the sender can copy it.
   */
  async resend(projectId: string, inviteId: string): Promise<ProjectInvite | null> {
    const reply = await this.ask<{ invite: ProjectInvite; token: string }>({
      action: 'resend',
      projectId,
      inviteId,
    })
    if (reply?.ok) {
      const updated = { ...reply.data.invite, token: reply.data.token }
      this.replace(projectId, updated)
      return updated
    }
    if (reply && !reply.ok) return null
    return this.patch(projectId, inviteId, {
      resentAt: Date.now(),
      expiresAt: Date.now() + INVITE_TTL_MS,
      status: 'pending',
    })
  }

  async revoke(projectId: string, inviteId: string): Promise<void> {
    const invite = this.invitesOf(projectId).find((i) => i.id === inviteId)
    const reply = await this.ask<{ invite: ProjectInvite }>({
      action: 'revoke',
      projectId,
      inviteId,
    })
    if (reply?.ok) this.replace(projectId, reply.data.invite)
    else if (!reply) this.patch(projectId, inviteId, { status: 'revoked' })
    else return

    // drop the server-side reservation unless they already joined
    if (invite && invite.status === 'pending') {
      void import('./ServerAclService').then(({ serverAcl }) =>
        serverAcl.setRole(projectId, invite.email, null),
      )
    }
  }

  /** Change what is being offered, which is only possible before acceptance. */
  async setRole(
    projectId: string,
    inviteId: string,
    role: CollabRole,
  ): Promise<ProjectInvite | null> {
    const reply = await this.ask<{ invite: ProjectInvite }>({
      action: 'set-role',
      projectId,
      inviteId,
      role,
    })
    if (reply?.ok) {
      this.replace(projectId, reply.data.invite)
      return reply.data.invite
    }
    if (reply && !reply.ok) return null
    return this.patch(projectId, inviteId, { role })
  }

  /** The recipient's answer, which is a different fact from being revoked. */
  async decline(token: string): Promise<boolean> {
    const reply = await this.askWithToken<{ invite: ProjectInvite }>({
      action: 'decline',
      token,
    })
    return !!reply?.ok
  }

  /* ---------------- acceptance (unchanged — 18.3 owns it) ---------------- */

  /**
   * Accept an invite as the CURRENT identity.
   *
   * It does not check that the current identity owns the invited address.
   * That is the hole #90 closes, and it is left exactly as it was rather
   * than half-moved: the only change 18.1 makes is refusing to expose it to
   * invitations resolved from the server, where a token alone would
   * otherwise be enough from any browser.
   */
  accept(invite: ProjectInvite): boolean {
    if (!isLive(invite, Date.now())) return false
    const identity = currentIdentity()
    membersService.addMember(invite.projectId, {
      userId: identity.userId,
      name: identity.name,
      email: identity.email || invite.email,
      avatarUrl: identity.avatarUrl,
      role: invite.role,
      invitedBy: invite.invitedBy,
    })
    this.patch(invite.projectId, invite.id, {
      status: 'accepted',
      acceptedAt: Date.now(),
    })
    return true
  }

  /**
   * Simulate the invitee accepting (offline testing): creates a mock member
   * from the invited email so roles/permissions can be exercised without a
   * second person. Local tier only — it writes no server record.
   */
  acceptAsMock(invite: ProjectInvite): boolean {
    if (!isLive(invite, Date.now())) return false
    membersService.addMember(invite.projectId, {
      userId: `mock_${invite.email}`,
      name: invite.email.split('@')[0],
      email: invite.email,
      role: invite.role,
      invitedBy: invite.invitedBy,
    })
    this.patch(invite.projectId, invite.id, {
      status: 'accepted',
      acceptedAt: Date.now(),
    })
    return true
  }

  /* ---------------- the local store ---------------- */

  private localInvite(
    projectId: string,
    email: string,
    role: CollabRole,
  ): ProjectInvite {
    const identity = currentIdentity()
    const now = Date.now()
    return {
      id: nid('inv'),
      projectId,
      email,
      role,
      // no server record, so there is no digest to compare against: the
      // token in this record IS the only copy, and the link only works
      // where this store is reachable
      tokenHash: '',
      token: nid('tok') + nid('tok'),
      createdAt: now,
      invitedBy: identity.userId,
      invitedByName: identity.name,
      status: 'pending',
      expiresAt: now + INVITE_TTL_MS,
      updatedAt: now,
    }
  }

  private store(projectId: string, invites: ProjectInvite[]): void {
    useCollabStore.getState().setInvites(projectId, invites)
    collabHub.broadcastState(projectId)
  }

  /** Put the server's version of a record in place of ours, token kept. */
  private replace(projectId: string, invite: ProjectInvite): void {
    const mine = this.invitesOf(projectId).find((i) => i.id === invite.id)
    const merged =
      !invite.token && mine?.token ? { ...invite, token: mine.token } : invite
    this.store(
      projectId,
      this.invitesOf(projectId).map((i) => (i.id === invite.id ? merged : i)),
    )
  }

  private patch(
    projectId: string,
    inviteId: string,
    patch: Partial<ProjectInvite>,
  ): ProjectInvite | null {
    let updated: ProjectInvite | null = null
    this.store(
      projectId,
      this.invitesOf(projectId).map((i) => {
        if (i.id !== inviteId) return i
        updated = { ...i, ...patch, updatedAt: Date.now() }
        return updated
      }),
    )
    return updated
  }
}

export const inviteService = new InviteService()
