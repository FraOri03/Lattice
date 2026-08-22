import { nid } from '@/lib/id'
import type { CollabRole, ProjectInvite } from '@/types/collab'
import type { MailDelivery } from '@/types/mail'
import { useStore } from '@/store/useStore'
import { authService } from '@/lib/auth/AuthService'
import { realAddress } from '@/lib/auth/addressAlias'
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
  /**
   * What became of the message (18.2). Absent on the local tier, where no
   * message was ever attempted — which is a different thing from one that
   * could not be sent, and the UI says so differently.
   */
  delivery?: MailDelivery
  /**
   * Why delivery failed, in the provider's own words (or Lattice's, when it
   * could not compose the message). Shown to the sender because they are the
   * only person who can act on it — "verify your sending domain" is an
   * afternoon of guessing otherwise.
   */
  deliveryError?: string
  /**
   * Why the realtime ACL did not reserve the slot, in the server's words.
   *
   * An invitation is two grants, and only one of them is this record: the
   * other is a reservation in the project's room metadata, which is what
   * the endpoints actually enforce. That call used to be fired and
   * forgotten, so its commonest refusal — 404, because the project has no
   * rooms until somebody opens it with realtime connected — reached a
   * `console.warn` and nobody else. The recipient found out instead, as a
   * red "No access" lock, days later.
   *
   * Absent when the reservation succeeded or when this build has no
   * realtime backend to reserve anything in.
   */
  reservationError?: string
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

/**
 * What came of accepting (18.3).
 *
 * `address` is present whenever the refusal is about WHO is accepting, so
 * the UI can name the mailbox that was invited — the only fact that lets
 * somebody act on the refusal. It is safe to show: whoever holds the link
 * was mailed at that address.
 */
/**
 * What came of withdrawing an offer.
 *
 * It used to come of nothing: `revoke` returned `void`, and the one branch
 * that mattered — the server said no — fell off the end of the function
 * without a word. The row stayed on screen, the invitation stayed live, and
 * the only trace of the refusal was a reply nobody read. A × that answers
 * silence is indistinguishable from a × that is not wired up, which is
 * exactly what it was reported as.
 *
 * So the refusal is carried back to the person who clicked, in the server's
 * own words — "a viewer cannot manage invitations" and "not a member of this
 * project" are two different afternoons.
 */
export interface RevokeResult {
  ok: boolean
  /** The server's own words when it refused. */
  error?: string
  /**
   * The record is withdrawn but the ACL still reserves the role — the half
   * of a revocation that leaves an address holding access off-screen.
   * `mirrorToServer` has already raised it as an event; this lets a caller
   * standing in front of the row say so inline too.
   */
  reservationError?: string
}

export interface AcceptOutcome {
  ok: boolean
  invite?: ProjectInvite
  address?: string
  /** The server's own words, when it refused. */
  error?: string
}

/** Addresses compare case-insensitively, or the check has a trivial bypass. */
function sameAddress(a: string, b: string): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()
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
      /**
       * 404 means the SERVER does not know this project — it has no ACL to
       * check anyone against, which is true of every project that was never
       * shared. That is the local tier's case, so this falls back to it
       * rather than reporting an error: before 18.1 the invitation would
       * simply have been made locally, and it still should be.
       *
       * Not sticky: the endpoint is there, and the next project may well be
       * one it knows.
       */
      if (res.status === 404) return null
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
    /**
     * A display alias is a label, not a mailbox (`lib/auth/addressAlias`).
     * Somebody who copies one out of the members list and pastes it here
     * means the person it stands for, and inviting the label itself would
     * open a slot no address can ever claim — so it is resolved back before
     * anything is minted. A build with no aliases changes nothing.
     */
    const clean = realAddress(email).toLowerCase()
    if (!EMAIL.test(clean)) return { ok: false }

    /**
     * Already a member? Then there is nothing to offer.
     *
     * The server has refused this since 18.1, but the check lived ONLY there,
     * so the local tier could still mint an invitation for somebody who was
     * already in the project — which is how an address ends up listed as an
     * active owner and as a pending admin at the same time.
     */
    const member = useCollabStore
      .getState()
      .members[projectId]?.find(
        (m) => m.status === 'active' && m.email.toLowerCase() === clean,
      )
    if (member) {
      return { ok: false, error: `${clean} is already a member of this project.` }
    }

    const existing = this.invitesOf(projectId).find(
      (i) => i.email === clean && i.status === 'pending',
    )
    if (existing) return { ok: true, invite: existing }

    const reply = await this.ask<{
      invite: ProjectInvite
      token: string | null
      delivery?: MailDelivery
      deliveryError?: string
    }>({
      action: 'create',
      projectId,
      email: clean,
      role,
      ...this.messageContext(projectId),
    })
    if (reply && !reply.ok) return { ok: false, error: reply.error }

    const invite: ProjectInvite = reply
      ? { ...reply.data.invite, ...(reply.data.token ? { token: reply.data.token } : {}) }
      : this.localInvite(projectId, clean, role)

    this.store(projectId, [invite, ...this.invitesOf(projectId)])
    activityLog.log(projectId, 'member.invited', `${clean} was invited as ${role}`, invite.id)
    /**
     * Reserve the role server-side so the invitee is recognised by the
     * realtime backend the moment they sign in (16.2's unbound slot).
     *
     * Awaited, and its refusal returned: the sender is standing here, and
     * they are the only person who can act on "this project has no realtime
     * rooms yet". A no-op that answers `ok` on a build without a realtime
     * backend, so nothing is reported where nothing was attempted.
     */
    const { serverAcl } = await import('./ServerAclService')
    const reservation = await serverAcl.setRole(projectId, clean, role)
    return {
      ok: true,
      invite,
      delivery: reply?.ok ? reply.data.delivery : undefined,
      deliveryError: reply?.ok ? reply.data.deliveryError : undefined,
      reservationError: reservation.ok ? undefined : reservation.error,
    }
  }

  /**
   * What the message needs and the server cannot know (18.2).
   *
   * Postgres holds memberships, not projects, so the project's name lives
   * only here; and an address says nothing about what language its owner
   * reads, so the sender's UI language is the only signal there is. Both are
   * used for the body of the mail and for nothing else — no decision is made
   * from either.
   */
  private messageContext(projectId: string): Record<string, unknown> {
    const state = useStore.getState()
    return {
      projectName: state.projects[projectId]?.name ?? '',
      locale: state.locale,
    }
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
      ...this.messageContext(projectId),
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

  /**
   * Withdraw an offer, here and in the ACL that enforces it.
   *
   * A revoked invitation whose server-side reservation survives is not a
   * withdrawn offer: it is an address that still holds a role, off the screen
   * that was supposed to have removed it. So the second half is awaited, and
   * a refusal is raised as an event too (see `serverMirror`), because the
   * callers include a sweep across a whole vault with nobody watching it.
   *
   * The REFUSAL of the first half is returned rather than swallowed. The
   * server refusing to withdraw an invitation is the one outcome where
   * nothing changes anywhere, and it used to be the one outcome that said
   * nothing at all.
   */
  async revoke(projectId: string, inviteId: string): Promise<RevokeResult> {
    const invite = this.invitesOf(projectId).find((i) => i.id === inviteId)
    const reply = await this.ask<{ invite: ProjectInvite }>({
      action: 'revoke',
      projectId,
      inviteId,
    })
    if (reply?.ok) this.replace(projectId, reply.data.invite)
    else if (!reply) this.patch(projectId, inviteId, { status: 'revoked' })
    else return { ok: false, error: reply.error }

    // drop the server-side reservation unless they already joined
    if (invite && invite.status === 'pending') {
      const [{ serverAcl }, { mirrorToServer }] = await Promise.all([
        import('./ServerAclService'),
        import('./serverMirror'),
      ])
      const mirrored = await mirrorToServer(
        projectId,
        `${invite.email} still holds a reserved role on the server.`,
        () => serverAcl.setRole(projectId, invite.email, null),
      )
      if (!mirrored.ok) return { ok: true, reservationError: mirrored.error }
    }
    return { ok: true }
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

  /* ---------------- acceptance (18.3, #90) ---------------- */

  /**
   * Accept an invitation, having proved the address it was sent to.
   *
   * Two paths, and which one applies is not a preference — it is what the
   * invitation is:
   *
   *  - **A server record** (`tokenHash` set) is accepted only by the server,
   *    which checks the caller's account against the invited address using
   *    identities the database says are verified. This browser never grants
   *    it locally, whatever it believes about who is signed in, because a
   *    browser is exactly the thing that cannot be trusted to answer that.
   *  - **A local invitation** (`tokenHash` empty) has no server behind it, so
   *    the address is all there is — and it now has to match. Before 18.3
   *    this branch added whoever was signed in, which is how an invitation
   *    sent to one address ended up granting membership to another.
   */
  async accept(invite: ProjectInvite, token?: string): Promise<AcceptOutcome> {
    if (!isLive(invite, Date.now())) {
      return { ok: false, error: 'This invitation is no longer open.' }
    }

    if (invite.tokenHash) {
      if (!token) {
        return { ok: false, address: invite.email, error: 'This invitation needs its link.' }
      }
      const reply = await this.ask<{
        invite: ProjectInvite
        projectId: string
        role: CollabRole
      }>({ action: 'accept', token })
      if (!reply) {
        return {
          ok: false,
          address: invite.email,
          error: 'Sign in to accept this invitation.',
        }
      }
      if (!reply.ok) return { ok: false, address: invite.email, error: reply.error }
      this.replace(invite.projectId, reply.data.invite)
      return { ok: true, invite: reply.data.invite }
    }

    const identity = currentIdentity()
    if (!sameAddress(identity.email, invite.email)) {
      return { ok: false, address: invite.email }
    }
    membersService.addMember(invite.projectId, {
      userId: identity.userId,
      name: identity.name,
      email: identity.email,
      avatarUrl: identity.avatarUrl,
      role: invite.role,
      invitedBy: invite.invitedBy,
    })
    const patched = this.patch(invite.projectId, invite.id, {
      status: 'accepted',
      acceptedAt: Date.now(),
    })
    return { ok: true, invite: patched ?? invite }
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
