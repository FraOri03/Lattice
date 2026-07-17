import { Liveblocks } from '@liveblocks/node'
import type { CollabRole } from '../../src/types/collab.js'
import { contentRoomId } from '../../src/lib/collab/roleAccess.js'

/**
 * Shared helpers for the realtime endpoints (api/realtime/*).
 *
 * SECURITY MODEL — the parts the browser can never override:
 *  - Identity: the client sends its Google OAuth access token; we verify
 *    it against Google (tokeninfo checks signature/expiry/audience) and
 *    derive the e-mail from Google's answer, never from the request body.
 *  - Authorization: each project's ACL lives in the Liveblocks room
 *    metadata (emails per role), writable only through these endpoints
 *    with the LIVEBLOCKS_SECRET_KEY. Access tokens are minted with
 *    exactly the scopes the role allows; Liveblocks enforces them on
 *    every websocket operation.
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

export interface RoomAcl {
  ownerEmail: string
  admins: string[]
  editors: string[]
  commenters: string[]
  viewers: string[]
}

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
  return meta
}

export function roleOf(acl: RoomAcl, email: string): CollabRole | null {
  if (acl.ownerEmail === email) return 'owner'
  if (acl.admins.includes(email)) return 'admin'
  if (acl.editors.includes(email)) return 'editor'
  if (acl.commenters.includes(email)) return 'commenter'
  if (acl.viewers.includes(email)) return 'viewer'
  return null
}

/** Remove an e-mail from every role list (before re-adding elsewhere). */
export function stripEmail(acl: RoomAcl, email: string): RoomAcl {
  const drop = (l: string[]) => l.filter((e) => e !== email)
  return {
    ownerEmail: acl.ownerEmail,
    admins: drop(acl.admins),
    editors: drop(acl.editors),
    commenters: drop(acl.commenters),
    viewers: drop(acl.viewers),
  }
}

export function addEmail(acl: RoomAcl, email: string, role: CollabRole): RoomAcl {
  const next = stripEmail(acl, email)
  switch (role) {
    case 'owner':
      next.ownerEmail = email
      break
    case 'admin':
      next.admins = [...next.admins, email]
      break
    case 'editor':
      next.editors = [...next.editors, email]
      break
    case 'commenter':
      next.commenters = [...next.commenters, email]
      break
    case 'viewer':
      next.viewers = [...next.viewers, email]
      break
  }
  return next
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

/** Basic shared validation: verified identity or an error response. */
export async function requireIdentity(
  res: ApiRes,
  googleToken: unknown,
): Promise<VerifiedIdentity | null> {
  if (typeof googleToken !== 'string' || !googleToken) {
    sendError(res, 401, 'Missing Google access token.')
    return null
  }
  const identity = await verifyGoogleToken(googleToken)
  if (!identity) {
    sendError(res, 401, 'Google rejected this token (expired or wrong audience).')
    return null
  }
  return identity
}
