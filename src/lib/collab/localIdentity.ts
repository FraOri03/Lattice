import { nid } from '@/lib/id'
import { vaultKey } from '@/lib/storage/vaultScope'

/**
 * Who this browser is, read from local storage and nothing else.
 *
 * Split out of `CollaborationProvider` so the project store can stamp a
 * creator without importing the realtime stack — that module pulls in the
 * auth service and the Yjs manager, and a store that imported it would drag
 * both into every bundle that touches a project.
 *
 * No network, no provider, no side effect beyond minting a guest id once.
 */

export interface CollabIdentity {
  userId: string
  name: string
  email: string
  avatarUrl: string
}

/**
 * Scoped like every other local store (#257). Unscoped, one anonymous id
 * was shared by every person who ever used this browser without signing in,
 * so two of them appeared to presence and comments as the same author — and
 * the id outlived the vault it had signed things in.
 */
const GUEST_KEY = vaultKey('lattice-guest-id')

/** Stable identity for presence/comments: the signed-in account, else a per-browser guest. */
export function currentIdentity(): CollabIdentity {
  try {
    const raw = localStorage.getItem('lattice-account')
    if (raw) {
      const acc = JSON.parse(raw) as {
        id: string
        name: string
        email: string
        avatarUrl: string
      }
      if (acc?.id) {
        return {
          userId: acc.id,
          name: acc.name || 'User',
          email: acc.email || '',
          avatarUrl: acc.avatarUrl || '',
        }
      }
    }
  } catch {
    /* fall through to guest */
  }
  let guestId = localStorage.getItem(GUEST_KEY)
  if (!guestId) {
    guestId = nid('guest')
    localStorage.setItem(GUEST_KEY, guestId)
  }
  return { userId: guestId, name: 'Guest', email: '', avatarUrl: '' }
}
