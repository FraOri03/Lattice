import { env, hasMediaCalls } from '@/lib/env'
import { authService } from '@/lib/auth/AuthService'
import type { CollabRole } from '@/types/collab'
import type { MediaCapabilities } from './mediaPermissions'

/**
 * Client half of the project-call handshake. It only ever ASKS: the role and
 * the capabilities in the answer are derived server-side from the project ACL
 * (api/realtime/media-token.ts) and are already baked into the signed token.
 * Nothing here can widen them — the UI uses `capabilities` purely to hide
 * controls the server would refuse anyway.
 */

export interface MediaGrant {
  token: string
  url: string
  room: string
  role: CollabRole
  capabilities: MediaCapabilities
}

/** Why calls are unavailable, in words a user can act on. */
export type MediaUnavailableReason =
  | 'not-configured'
  | 'signed-out'
  | null

export function mediaUnavailableReason(signedIn: boolean): MediaUnavailableReason {
  if (!hasMediaCalls) return 'not-configured'
  if (!signedIn) return 'signed-out'
  return null
}

export function mediaUnavailableMessage(reason: MediaUnavailableReason): string {
  switch (reason) {
    case 'not-configured':
      return 'Project calls are not configured for this deployment.'
    case 'signed-out':
      return 'Sign in with Google to join the project call.'
    default:
      return ''
  }
}

/**
 * Ask the server for a LiveKit grant for this project. Throws with the
 * server's own explanation (including the honest 501 when calls are not
 * configured) so the UI never invents a reason.
 */
export async function fetchMediaGrant(projectId: string): Promise<MediaGrant> {
  const googleToken = await authService.getAccessToken()
  if (!googleToken) {
    throw new Error(mediaUnavailableMessage('signed-out'))
  }
  const res = await fetch(env.mediaTokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, googleToken }),
  })
  const body = (await res.json().catch(() => null)) as
    | (Partial<MediaGrant> & { error?: string })
    | null
  if (!res.ok || !body?.token) {
    throw new Error(body?.error || `Could not join the call (HTTP ${res.status}).`)
  }
  return {
    token: body.token,
    // the server echoes the configured URL; fall back to the build-time one
    url: body.url || env.livekitUrl,
    room: body.room ?? '',
    role: body.role as CollabRole,
    capabilities: body.capabilities as MediaCapabilities,
  }
}
