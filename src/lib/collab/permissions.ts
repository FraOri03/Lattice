import type { CollabRole } from '@/types/collab'

/**
 * PermissionsService — the single source of truth for what each role may
 * do. Pure functions; UI and services both consult this module so the
 * permission matrix can never drift between them.
 */

export type Capability =
  // project lifecycle
  | 'project.delete'
  | 'project.transfer-ownership'
  | 'project.manage-integrations' // Drive / GitHub connections
  | 'project.settings'
  // membership
  | 'members.manage' // invite, remove, change roles (below own rank)
  | 'members.manage-admins'
  // content
  | 'content.create'
  | 'content.edit'
  | 'content.delete'
  // comments
  | 'comments.add'
  | 'comments.resolve-own'
  | 'comments.resolve-any'
  // versions
  | 'versions.create'
  | 'versions.restore'
  // code locks
  | 'locks.force-unlock'

const EDITOR_CAPS: Capability[] = [
  'content.create',
  'content.edit',
  'content.delete',
  'comments.add',
  'comments.resolve-own',
  'comments.resolve-any',
  'versions.create',
  'versions.restore',
]

const ADMIN_CAPS: Capability[] = [
  ...EDITOR_CAPS,
  'project.settings',
  'members.manage',
  'locks.force-unlock',
]

const MATRIX: Record<CollabRole, ReadonlySet<Capability>> = {
  owner: new Set<Capability>([
    ...ADMIN_CAPS,
    'project.delete',
    'project.transfer-ownership',
    'project.manage-integrations',
    'members.manage-admins',
  ]),
  admin: new Set<Capability>(ADMIN_CAPS),
  editor: new Set<Capability>(EDITOR_CAPS),
  commenter: new Set<Capability>(['comments.add', 'comments.resolve-own']),
  viewer: new Set<Capability>([]),
}

export function can(role: CollabRole | null | undefined, cap: Capability): boolean {
  if (!role) return false
  return MATRIX[role].has(cap)
}

/** Roles ordered by rank; used for "may X change Y's role" checks. */
const RANK: Record<CollabRole, number> = {
  owner: 5,
  admin: 4,
  editor: 3,
  commenter: 2,
  viewer: 1,
}

export function rankOf(role: CollabRole): number {
  return RANK[role]
}

/**
 * Whether `actor` may change/remove a member holding `target`'s role.
 * Owners manage everyone; admins manage everyone below admin.
 */
export function canManageRole(actor: CollabRole, target: CollabRole): boolean {
  if (actor === 'owner') return target !== 'owner'
  if (actor === 'admin') return RANK[target] < RANK.admin
  return false
}

/** Roles an actor may assign when inviting or editing a member. */
export function assignableRoles(actor: CollabRole): CollabRole[] {
  if (actor === 'owner') return ['admin', 'editor', 'commenter', 'viewer']
  if (actor === 'admin') return ['editor', 'commenter', 'viewer']
  return []
}

/** Convenient read-only check used by editors/boards/sheets. */
export function isReadOnly(role: CollabRole | null | undefined): boolean {
  return !can(role, 'content.edit')
}
