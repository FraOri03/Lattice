import { useMemo } from 'react'
import { useAccount } from '@/lib/auth/AccountProvider'
import { useSyncStore } from '@/lib/sync/syncStore'
import { hasRealtimeBackend } from '@/lib/env'

/**
 * collabPresentation — the ONE place that decides how the collaboration
 * state is described across the whole UI (COL-1 / issue #9).
 *
 * The honest question the product must answer is: "when I see presence and a
 * Share button, what does 'collaborate' actually mean right now?" The answer
 * is derived from the active provider's real capability signals — a
 * configured realtime backend + a Google identity — not from scattered env
 * reads. Every surface (RealtimeStatusChip, TopBar presence/Share, ShareDialog)
 * pulls its wording from here so nothing can drift or over-promise.
 */

export type CollabTier = 'realtime' | 'drive' | 'local'

export interface CollabMode {
  tier: CollabTier
  /** short chip/badge word, e.g. "Live" · "Drive" · "This browser" */
  shortLabel: string
  /** who a change reaches, e.g. "everyone, live" · "same Google Drive" */
  scopeLabel: string
  /** presence-badge word next to avatars: "live" · "Drive" · "same browser" */
  presenceScope: string
  /** one-line, honest summary of what collaboration currently delivers */
  description: string
  /** true ONLY when cross-device realtime is actually available */
  isRealtime: boolean
}

export interface CollabModeInputs {
  /** VITE_REALTIME_BACKEND=liveblocks was baked into this build */
  hasRealtimeBackend: boolean
  /** a real Google identity is signed in (mock accounts do not count) */
  googleSignedIn: boolean
  /** this project's Google Drive folder is connected for sync */
  driveConnected: boolean
}

/**
 * Pure tier derivation. Realtime wins only when the backend is configured AND
 * a Google identity is present (exactly the RealtimeCollaborationProvider
 * availability condition). Otherwise we degrade honestly to Drive polling, or
 * — with no Drive either — to same-browser tabs.
 */
export function deriveCollabMode(i: CollabModeInputs): CollabMode {
  if (i.hasRealtimeBackend && i.googleSignedIn) {
    return {
      tier: 'realtime',
      shortLabel: 'Live',
      scopeLabel: 'everyone, live',
      presenceScope: 'live',
      isRealtime: true,
      description:
        'Realtime multiplayer is active: documents, code and boards merge live across devices over Liveblocks + Yjs, with server-enforced permissions.',
    }
  }
  if (i.driveConnected) {
    return {
      tier: 'drive',
      shortLabel: 'Drive',
      scopeLabel: 'same Google Drive',
      presenceScope: 'Drive',
      isRealtime: false,
      description:
        'Cross-device realtime is off. Members, comments and content sync through this project’s Google Drive folder (~20s); tabs of this browser co-edit live. There is no live cross-device presence.',
    }
  }
  return {
    tier: 'local',
    shortLabel: 'This browser',
    scopeLabel: 'tabs of this browser',
    presenceScope: 'same browser',
    isRealtime: false,
    description:
      'Cross-device realtime is off and Drive is not connected. “Live” means tabs of this browser only (BroadcastChannel). Connect Google Drive or enable a realtime backend to collaborate across devices.',
  }
}

/**
 * Live collaboration mode, reactive to login/logout and Drive connect/
 * disconnect (the two signals that actually change what "collaborate" means).
 */
export function useCollabMode(): CollabMode {
  const account = useAccount().account
  const provider = useSyncStore((s) => s.provider)
  return useMemo(
    () =>
      deriveCollabMode({
        hasRealtimeBackend,
        googleSignedIn: !!account && account.providers.includes('google'),
        driveConnected: provider === 'google-drive',
      }),
    [account, provider],
  )
}
