import type { CollabRole, InviteStatus, ProjectInvite, ProjectMember } from '@/types/collab'

/**
 * What the server-backed sections can honestly answer today (13.3, built in
 * 15.5).
 *
 * The phase's thesis, and the reason this module is small: **more exists than
 * the brief assumed, and less exists than the prototype shows.** Members, roles
 * and invitations all ship in `lib/collab`; an invite *inbox* and a
 * shared-projects *index* do not. So two of these three sections have a real,
 * partial answer, and the honest thing is to give it and then say what is
 * missing — not to disable the lot.
 *
 * Pure, so the "what can we actually see" rule is asserted once rather than
 * re-derived inside three components.
 */

/** The minimum a project has to expose for these folds. */
export interface ProjectFacts {
  id: string
  name: string
  icon: string
  updatedAt: number
  archived: boolean
}

/**
 * How a shared project reached this reader.
 *
 * 13.3 settled that there were only two paths and that each row must say
 * which one it is reading. 18.4 adds the third it was waiting for: the
 * server index, which knows about projects this device has never held.
 */
export type SharedScope = 'browser' | 'drive' | 'server'

export interface SharedProject {
  projectId: string
  /**
   * Null when only the server knows about it. Postgres holds memberships,
   * not projects — titles live in Yjs and Drive — so a project this device
   * has never opened has no name to show, and inventing one would be worse
   * than saying so.
   */
  name: string | null
  icon: string
  /** My role in it — never `owner`, or it would not be shared *with* me. */
  role: Exclude<CollabRole, 'owner'>
  /** 0 when unknown, which is the case for a server-only row. */
  updatedAt: number
  scope: SharedScope
}

/** One membership as `/api/shared` reports it (18.4). */
export interface ServerShared {
  projectId: string
  role: Exclude<CollabRole, 'owner'>
  ownerEmail: string
  claimed: boolean
}

export interface SharedGroup {
  /** Null when no active owner is recorded — surfaced, not hidden. */
  ownerName: string | null
  ownerEmail: string | null
  items: SharedProject[]
}

/**
 * Projects someone else owns and this browser can already see.
 *
 * The rule is the one `useMyRole` already applies: you are the owner of
 * anything that does not say otherwise, so a project is shared *with* you only
 * when its membership list names you, actively, in a role that is not owner.
 * That is a complete answer for the data present — and a partial answer to the
 * question, which is why the page still needs the unavailable state for
 * everything outside these two paths (#91).
 *
 * Grouped by owner, because 13.1 scopes people-owned surfaces by whoever is on
 * the other side.
 */
export function collectShared(
  projects: Record<string, ProjectFacts>,
  members: Record<string, ProjectMember[]>,
  myUserId: string,
  scope: SharedScope,
  server: ServerShared[] = [],
): SharedGroup[] {
  const groups = new Map<string, SharedGroup>()

  for (const project of Object.values(projects)) {
    if (project.archived) continue
    const roster = members[project.id]
    if (!roster) continue
    const me = roster.find((m) => m.userId === myUserId && m.status === 'active')
    if (!me || me.role === 'owner') continue

    const owner = roster.find((m) => m.role === 'owner' && m.status === 'active')
    // an owner-less roster is a real state, not a reason to drop the row: the
    // project is still shared with you, and the page says the owner is unknown
    const key = owner?.userId ?? '__unknown__'
    const group = groups.get(key) ?? {
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? null,
      items: [],
    }
    group.items.push({
      projectId: project.id,
      name: project.name,
      icon: project.icon,
      role: me.role,
      updatedAt: project.updatedAt,
      scope,
    })
    groups.set(key, group)
  }

  /**
   * What only the server knows (18.4).
   *
   * A project already found above is left alone: this device holds it, so it
   * has a name, an icon and a real timestamp, and the server would only
   * repeat the membership. The rows added here are the ones the page could
   * never show before — shared with you, and not on this device.
   */
  const alreadyListed = new Set(
    [...groups.values()].flatMap((g) => g.items.map((i) => i.projectId)),
  )
  for (const entry of server) {
    if (alreadyListed.has(entry.projectId)) continue
    const key = entry.ownerEmail || '__unknown__'
    const group = groups.get(key) ?? {
      ownerName: null,
      ownerEmail: entry.ownerEmail || null,
      items: [],
    }
    group.items.push({
      projectId: entry.projectId,
      name: null,
      icon: '',
      role: entry.role,
      updatedAt: 0,
      scope: 'server',
    })
    groups.set(key, group)
  }

  for (const group of groups.values()) {
    group.items.sort((a, b) => b.updatedAt - a.updatedAt)
  }
  return [...groups.values()].sort((a, b) =>
    (a.ownerName ?? a.ownerEmail ?? '￿').localeCompare(b.ownerName ?? b.ownerEmail ?? '￿'),
  )
}

export interface SentInvite {
  invite: ProjectInvite
  projectId: string
  projectName: string
}

/**
 * The statuses a sent invitation may be shown in.
 *
 * `expired` and `declined` were absent until 18.1, and for the same reason
 * rather than by preference: no `expiresAt` existed and nothing computed it,
 * and a recipient's refusal had no value to be recorded as — so a row wearing
 * either badge would have been making a claim the app had no way to have
 * checked. Both are real facts now (#88), so both are shown.
 *
 * What 13.3 ruled out still stands: no e-mail backend, so no *delivered* and
 * no *failed*. That is 18.2's to add.
 */
export const SHOWN_INVITE_STATUSES = [
  'pending',
  'accepted',
  'declined',
  'revoked',
  'expired',
] as const satisfies readonly InviteStatus[]

/**
 * Invitations *you* issued, folded over the projects this device holds.
 *
 * 13.3 is precise about what this is: real per project, and a workspace-wide
 * list is a UI fold rather than a server feature. Which is also why the
 * received tab cannot exist — `collabStore.invites` is keyed by project and
 * lives on the **inviter's** device, so the recipient's copy is nowhere.
 */
export function collectSentInvites(
  projects: Record<string, ProjectFacts>,
  invitesOf: (projectId: string) => ProjectInvite[],
): SentInvite[] {
  const out: SentInvite[] = []
  for (const project of Object.values(projects)) {
    for (const invite of invitesOf(project.id)) {
      if (!(SHOWN_INVITE_STATUSES as readonly string[]).includes(invite.status)) continue
      out.push({ invite, projectId: project.id, projectName: project.name })
    }
  }
  return out.sort((a, b) => b.invite.createdAt - a.invite.createdAt)
}
