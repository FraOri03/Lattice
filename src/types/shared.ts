import type { CollabRole, ProjectInvite } from './collab.js'

/**
 * The shared-projects index (Phase 18.4, #91).
 *
 * What the server can say about "what belongs to me", which is deliberately
 * less than the dashboard shows: ids, roles and owners. Project names live
 * in Yjs and Drive and never reach Postgres, so the client joins whatever it
 * already holds and says so plainly for anything it does not.
 */

export interface SharedMembership {
  projectId: string
  /** Never `owner` — a project you own is not shared *with* you. */
  role: Exclude<CollabRole, 'owner'>
  /** The owner's address, or '' when the project has no owner row. */
  ownerEmail: string
  /**
   * Whether the slot is bound to this account, or still open to the address.
   * An unclaimed slot is what an invitation accepted but never opened looks
   * like, and the difference is worth showing rather than flattening.
   */
  claimed: boolean
}

export interface SharedIndex {
  projects: SharedMembership[]
  /** Invitations waiting for any address this account has proved. */
  invitations: ProjectInvite[]
  /** Those addresses, so the UI can explain which mailbox a row came through. */
  addresses: string[]
}

/** The empty answer, used before the first load and when there is no server. */
export const EMPTY_SHARED_INDEX: SharedIndex = {
  projects: [],
  invitations: [],
  addresses: [],
}
