import { env, hasGoogleAuth } from '@/lib/env'
import { authService, REQUIRED_DRIVE_SCOPES } from '@/lib/auth/AuthService'
import {
  GoogleDriveStorageProvider,
  describeDriveError,
} from '@/lib/storage/GoogleDriveStorageProvider'
import { useSyncStore } from './syncStore'

/**
 * Drive diagnostics — the honest checklist behind the "Test Drive
 * connection" button. Every check performs (or reports) the REAL
 * operation; nothing is simulated. Checks run in dependency order and
 * later ones are skipped when a prerequisite fails.
 */

export type CheckState = 'ok' | 'fail' | 'skip'

export interface DriveCheck {
  id:
    | 'client-id'
    | 'token'
    | 'scopes'
    | 'api'
    | 'folder'
    | 'last-sync'
    | 'last-error'
  label: string
  state: CheckState
  /** short human-readable detail (masked ids, expiry, folder name, error) */
  detail: string
}

export interface DriveDiagnosticsReport {
  checks: DriveCheck[]
  /** overall: true only when every hard check passed */
  healthy: boolean
  origin: string
  checkedAt: number
}

function mask(id: string): string {
  return id.length > 16 ? `${id.slice(0, 12)}…${id.slice(-14)}` : id
}

function timeAgo(ts: number | null): string {
  if (!ts) return 'never'
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

/**
 * Verify the granted scopes of an access token against Google's tokeninfo
 * endpoint (authoritative — reflects what the user actually consented to).
 */
async function fetchGrantedScopes(accessToken: string): Promise<string[]> {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
  )
  if (!res.ok) throw new Error(`tokeninfo returned ${res.status} (token invalid or expired)`)
  const data = (await res.json()) as { scope?: string }
  return (data.scope ?? '').split(' ').filter(Boolean)
}

export async function runDriveDiagnostics(): Promise<DriveDiagnosticsReport> {
  const checks: DriveCheck[] = []
  const sync = useSyncStore.getState()
  const skip = (id: DriveCheck['id'], label: string, why: string) =>
    checks.push({ id, label, state: 'skip', detail: why })

  // 1 — client id baked into this build?
  const clientIdOk = hasGoogleAuth
  checks.push({
    id: 'client-id',
    label: 'Google client ID loaded',
    state: clientIdOk ? 'ok' : 'fail',
    detail: clientIdOk
      ? mask(env.googleClientId)
      : 'VITE_GOOGLE_CLIENT_ID is empty in this build — see setup steps below',
  })

  // 2 — access token present (silent refresh allowed, never a popup)?
  let token: string | null = null
  if (!clientIdOk) {
    skip('token', 'Drive API token present', 'no client id')
  } else {
    token = authService.peekToken()?.accessToken ?? (await authService.getAccessToken())
    const stored = authService.peekToken()
    checks.push({
      id: 'token',
      label: 'Drive API token present',
      state: token ? 'ok' : 'fail',
      detail: token
        ? `valid, expires in ${Math.max(0, Math.round(((stored?.expiresAt ?? 0) - Date.now()) / 60000))} min`
        : 'no valid token — sign in or use "Reconnect Drive"',
    })
  }

  // 3 — required scopes actually granted?
  if (!token) {
    skip('scopes', 'Required scopes granted', 'no token')
  } else {
    try {
      const granted = await fetchGrantedScopes(token)
      const missing = REQUIRED_DRIVE_SCOPES.filter((s) => !granted.includes(s))
      checks.push({
        id: 'scopes',
        label: 'Required scopes granted',
        state: missing.length === 0 ? 'ok' : 'fail',
        detail:
          missing.length === 0
            ? 'drive.file granted'
            : `missing ${missing.map((s) => s.split('/').pop()).join(', ')} — reconnect and accept the Drive permission`,
      })
    } catch (err) {
      checks.push({
        id: 'scopes',
        label: 'Required scopes granted',
        state: 'fail',
        detail: err instanceof Error ? err.message : 'scope check failed',
      })
    }
  }

  // 4 + 5 — Drive API reachable, app folder exists (find-or-create)
  const drive = new GoogleDriveStorageProvider(async () => token)
  if (!token) {
    skip('api', 'Drive API reachable', 'no token')
    skip('folder', `"${env.driveAppFolder}" folder in My Drive`, 'no token')
  } else {
    let apiOk = false
    try {
      const about = await drive.about()
      apiOk = true
      checks.push({
        id: 'api',
        label: 'Drive API reachable',
        state: 'ok',
        detail: about.user?.emailAddress ? `connected as ${about.user.emailAddress}` : 'reachable',
      })
    } catch (err) {
      checks.push({
        id: 'api',
        label: 'Drive API reachable',
        state: 'fail',
        detail: describeDriveError(err),
      })
    }
    if (!apiOk) {
      skip('folder', `"${env.driveAppFolder}" folder in My Drive`, 'Drive API unreachable')
    } else {
      try {
        const folderId = await drive.ensureAppFolder()
        checks.push({
          id: 'folder',
          label: `"${env.driveAppFolder}" folder in My Drive`,
          state: 'ok',
          detail: `found/created (id ${folderId.slice(0, 10)}…)`,
        })
      } catch (err) {
        checks.push({
          id: 'folder',
          label: `"${env.driveAppFolder}" folder in My Drive`,
          state: 'fail',
          detail: describeDriveError(err),
        })
      }
    }
  }

  // 6 — last sync status (informational)
  checks.push({
    id: 'last-sync',
    label: 'Last sync',
    state: sync.lastSyncAt ? 'ok' : 'skip',
    detail: `${sync.status} · last sync ${timeAgo(sync.lastSyncAt)}${
      sync.pendingChanges ? ` · ${sync.pendingChanges} pending` : ''
    }`,
  })

  // 7 — last recorded error (informational)
  checks.push({
    id: 'last-error',
    label: 'Last error',
    state: sync.error ? 'fail' : 'ok',
    detail: sync.error ?? 'none',
  })

  const hard = checks.filter((c) => c.id !== 'last-sync' && c.id !== 'last-error')
  return {
    checks,
    healthy: hard.every((c) => c.state === 'ok'),
    origin: window.location.origin,
    checkedAt: Date.now(),
  }
}
