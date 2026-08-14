import { Liveblocks } from '@liveblocks/node'
import { contentRoomId } from '../../src/lib/collab/roleAccess.js'
import {
  decodeBindings,
  encodeBindings,
  type Principal,
  type RoomAcl,
} from '../../src/lib/collab/acl.js'
import { googleUserIds } from '../../src/lib/auth/identity.js'
import type { Session } from '../../src/types/session.js'
import { repositories } from './db/index.js'
import { csrfOk, sessionOf, touchSession, type ApiRequest } from './session.js'

/**
 * Shared helpers for the realtime endpoints (api/realtime/*).
 *
 * SECURITY MODEL — the parts the browser can never override:
 *  - Identity: the client sends its Google OAuth access token; we verify
 *    it against Google (tokeninfo checks signature/expiry/audience) and
 *    derive the e-mail from Google's answer, never from the request body.
 *  - Authorization: each project's ACL lives in the Liveblocks room
 *    metadata (a slot per member, opened with an address and bound to a
 *    userId once its owner shows up — see src/lib/collab/acl.ts),
 *    writable only through these endpoints with the
 *    LIVEBLOCKS_SECRET_KEY. Access tokens are minted with exactly the
 *    scopes the role allows; Liveblocks enforces them on every websocket
 *    operation.
 */

/* ---------------- environment ---------------- */

export function liveblocksClient(): Liveblocks | null {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY
  if (!secret) return null
  return new Liveblocks({ secret })
}

/* ---------------- Google identity verification ---------------- */

export interface VerifiedIdentity {
  /** Google account id (stable) */
  sub: string
  /** lowercased e-mail — the ACL key */
  email: string
  name: string
  picture: string
}

interface TokenInfo {
  aud?: string
  sub?: string
  email?: string
  email_verified?: string
  expires_in?: string
}

/**
 * Verify a Google OAuth access token: Google's tokeninfo endpoint rejects
 * forged/expired tokens, and the audience check rejects tokens minted for
 * a different application.
 */
export async function verifyGoogleToken(
  token: string,
): Promise<VerifiedIdentity | null> {
  if (!token || token.length > 4096) return null
  const infoRes = await fetch(
    `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`,
  )
  if (!infoRes.ok) return null
  const info = (await infoRes.json()) as TokenInfo
  if (!info.sub) return null
  const expectedAud = process.env.VITE_GOOGLE_CLIENT_ID
  if (expectedAud && info.aud !== expectedAud) return null

  // profile details (name/picture) are cosmetic; e-mail comes from
  // tokeninfo first (verified), userinfo as fallback
  let name = ''
  let picture = ''
  let email = (info.email ?? '').toLowerCase()
  try {
    const profRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (profRes.ok) {
      const prof = (await profRes.json()) as {
        email?: string
        name?: string
        picture?: string
      }
      name = prof.name ?? ''
      picture = prof.picture ?? ''
      if (!email) email = (prof.email ?? '').toLowerCase()
    }
  } catch {
    // cosmetic only
  }
  if (!email) return null
  return { sub: info.sub, email, name, picture }
}

/* ---------------- room ACL (metadata) ---------------- */

/**
 * The ACL shape and the rule that resolves it live in
 * `src/lib/collab/acl.ts`, shared verbatim with the browser. What stays
 * here is only how it is stored: Liveblocks room metadata.
 */
type Metadata = Record<string, string | string[]>

const asList = (v: string | string[] | undefined): string[] =>
  Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []

export function aclFromMetadata(meta: Metadata | undefined): RoomAcl | null {
  if (!meta || meta.kind !== 'lattice-project') return null
  const ownerEmail = typeof meta.ownerEmail === 'string' ? meta.ownerEmail : ''
  if (!ownerEmail) return null
  return {
    ownerEmail,
    admins: asList(meta.admins),
    editors: asList(meta.editors),
    commenters: asList(meta.commenters),
    viewers: asList(meta.viewers),
    // absent on every room written before 16.2, which is exactly the
    // "nobody has claimed these addresses yet" state
    bindings: decodeBindings(asList(meta.bound)),
  }
}

export function aclToMetadata(projectId: string, acl: RoomAcl): Metadata {
  const meta: Metadata = {
    kind: 'lattice-project',
    projectId,
    ownerEmail: acl.ownerEmail,
  }
  if (acl.admins.length) meta.admins = acl.admins
  if (acl.editors.length) meta.editors = acl.editors
  if (acl.commenters.length) meta.commenters = acl.commenters
  if (acl.viewers.length) meta.viewers = acl.viewers
  const bound = encodeBindings(acl.bindings)
  if (bound.length) meta.bound = bound
  return meta
}

/**
 * Who is calling, as the ACL asks about them.
 *
 * Both halves come from Google's answer and nothing else: the address it
 * verified, and every userId derivable from the subject it verified. The
 * browser never sends a userId, so there is no claim to be trusted or
 * checked — 16.2's key is as unforgeable as the e-mail it replaces.
 */
export function principalOf(identity: VerifiedIdentity): Principal {
  return { email: identity.email, userIds: googleUserIds(identity.sub) }
}

/** Load a project's ACL from its content room; null when no room yet. */
export async function loadAcl(
  lb: Liveblocks,
  projectId: string,
): Promise<RoomAcl | null> {
  try {
    const room = await lb.getRoom(contentRoomId(projectId))
    return aclFromMetadata(room.metadata as Metadata)
  } catch {
    return null // room does not exist yet
  }
}

/* ---------------- tiny response helpers ---------------- */

export interface ApiRes {
  status(code: number): ApiRes
  setHeader(name: string, value: string): ApiRes
  json(body: unknown): void
}

export function sendError(res: ApiRes, code: number, error: string): void {
  res.status(code).json({ error })
}

/**
 * The identity a session asserts.
 *
 * Exactly the shape `verifyGoogleToken` produces, which is the point: the
 * ACL, `principalOf`, `roleOf` and the whole permission matrix cannot tell
 * the two apart, so 17.2 changes how a caller is identified without
 * touching what they are allowed to do.
 */
export function identityFromSession(session: Session): VerifiedIdentity {
  return {
    sub: session.providerSubject,
    email: session.email,
    name: session.displayName,
    picture: session.avatarUrl,
  }
}

/**
 * Who is calling: the session cookie first, the Google token in the body
 * as a fallback.
 *
 * ## Why both, for now
 *
 * The fallback is the transitional path 17.2 owes the deployments it
 * changes under. A browser that has not established a session yet — one
 * mid-upgrade, or one on a deployment with no database at all — keeps
 * working exactly as it did, because realtime breaking for everyone during
 * a rollout is not an acceptable way to improve security. It is the branch
 * 16.3 predicted, and 17.3 is where the Google token stops being accepted.
 *
 * ## Why a session request must also carry a CSRF token
 *
 * A cookie is sent by the browser whether or not the page meant to send
 * it. Every endpoint reached through here mints a credential or changes a
 * membership, so presenting the cookie is not enough: the caller has to
 * prove it can also read the session, which only same-origin script can.
 * The body-token path needs no such check — a token nobody's browser
 * attaches automatically cannot be ridden.
 */
export async function requireIdentity(
  req: ApiRequest,
  res: ApiRes,
  googleToken: unknown,
): Promise<VerifiedIdentity | null> {
  const db = repositories()
  if (db) {
    const session = await sessionOf(req, db.sessions)
    if (session) {
      if (!(await csrfOk(req, session, db.sessions))) {
        sendError(res, 403, 'Missing or invalid CSRF token.')
        return null
      }
      await touchSession(session, db.sessions)
      return identityFromSession(session)
    }
  }

  if (typeof googleToken !== 'string' || !googleToken) {
    sendError(res, 401, 'Not signed in: no session cookie and no Google access token.')
    return null
  }
  const identity = await verifyGoogleToken(googleToken)
  if (!identity) {
    sendError(res, 401, 'Google rejected this token (expired or wrong audience).')
    return null
  }
  return identity
}
