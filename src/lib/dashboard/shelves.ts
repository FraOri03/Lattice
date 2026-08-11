import type { StarKind, Workspace } from '@/types/model'
import { describeEntity, type EntitySources } from '@/lib/entities/entityLabel'

/**
 * The two personal shelves — Recents and Starred (13.1, built in 15.2).
 *
 * 13.1 calls them shelves because they answer questions about *you* rather than
 * about a workspace, so both **span every workspace** and label each row with
 * the one it came from. Hiding the file you closed two minutes ago because you
 * switched workspace afterwards would be a bug, not scoping.
 *
 * Pure, like `resolveRecents` and for the same reason: the ordering rules and
 * the day boundaries are the part worth asserting, and neither needs a DOM.
 */

/** A row on either shelf, with everything a row has to name. */
export interface ShelfItem {
  kind: StarKind
  id: string
  title: string
  /** Null for entities written before projects carried an id. */
  projectId: string | null
  projectName: string | null
  /** Null when the project belongs to no workspace this browser knows. */
  workspaceId: string | null
  workspaceName: string | null
}

export interface ShelfSources extends EntitySources {
  projects: Record<string, { name: string; starred?: boolean }>
}

/** The seven entity slices, in the order the shelf lists them. */
const ENTITY_SLICES = [
  ['board', 'boards'],
  ['doc', 'docs'],
  ['note', 'notes'],
  ['sheet', 'sheetDocs'],
  ['present', 'presentDocs'],
  ['code', 'codeDocs'],
  ['asset', 'assets'],
] as const satisfies readonly (readonly [Exclude<StarKind, 'project'>, keyof EntitySources])[]

/** Which workspace holds a project — the label every shelf row carries. */
export function workspaceOfProject(
  projectId: string | null,
  workspaces: Record<string, Workspace>,
): { id: string; name: string } | null {
  if (!projectId) return null
  const ws = Object.values(workspaces).find((w) => w.projectIds.includes(projectId))
  return ws ? { id: ws.id, name: ws.name } : null
}

function attribute(
  projectId: string | undefined,
  src: ShelfSources,
  workspaces: Record<string, Workspace>,
): Pick<ShelfItem, 'projectId' | 'projectName' | 'workspaceId' | 'workspaceName'> {
  const pid = projectId ?? null
  const project = pid ? (src.projects[pid] ?? null) : null
  const ws = workspaceOfProject(pid, workspaces)
  return {
    projectId: pid,
    projectName: project?.name ?? null,
    workspaceId: ws?.id ?? null,
    workspaceName: ws?.name ?? null,
  }
}

/**
 * Everything currently on the Starred shelf, across every workspace.
 *
 * **Order never changes on its own** (13.5 §3). That rules out sorting by
 * `updatedAt`, which would reshuffle the shelf every time someone edited one of
 * its members — the exact behaviour 13.1 contrasts Starred *against* Recents to
 * avoid. Kind, then title, is stable: it moves only when the user renames
 * something, which is a change they made and can see.
 *
 * A star pointing at a deleted entity resolves to nothing and is dropped, the
 * same degradation `resolveRecents` applies.
 */
export function collectStarred(
  src: ShelfSources,
  workspaces: Record<string, Workspace>,
): ShelfItem[] {
  const out: ShelfItem[] = []

  for (const [id, project] of Object.entries(src.projects)) {
    if (!project.starred) continue
    const ws = workspaceOfProject(id, workspaces)
    out.push({
      kind: 'project',
      id,
      title: project.name,
      // a project is its own attribution: naming it twice on its own row reads
      // as a bug, so only the workspace label is carried
      projectId: id,
      projectName: null,
      workspaceId: ws?.id ?? null,
      workspaceName: ws?.name ?? null,
    })
  }

  for (const [kind, slice] of ENTITY_SLICES) {
    for (const [id, entity] of Object.entries(src[slice])) {
      if (!entity.starred) continue
      const hit = describeEntity(kind, id, src)
      if (!hit) continue
      out.push({ kind, id, title: hit.title, ...attribute(hit.projectId, src, workspaces) })
    }
  }

  const order = ['project', ...ENTITY_SLICES.map(([k]) => k)] as StarKind[]
  return out.sort(
    (a, b) =>
      order.indexOf(a.kind) - order.indexOf(b.kind) ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
  )
}

/** One day's worth of recents, newest day first. */
export interface ShelfDay<T> {
  /** Local midnight the day starts at — the group's stable key. */
  dayStart: number
  /** 0 is today, 1 is yesterday; the component turns this into a heading. */
  daysAgo: number
  items: T[]
}

const DAY = 86_400_000

function midnight(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Group timestamped rows by local day, newest first (13.5 §3).
 *
 * Local midnight, not `at / DAY`: a UTC bucket puts anything opened after 01:00
 * in Rome into "tomorrow", so the first group on a normal evening would be
 * labelled with a date that has not happened yet.
 *
 * `now` is a parameter rather than a `Date.now()` call so the day boundaries can
 * be asserted without freezing the clock.
 */
export function groupByDay<T extends { at: number }>(items: T[], now: number): ShelfDay<T>[] {
  const today = midnight(now)
  const groups = new Map<number, T[]>()
  for (const item of items) {
    const day = midnight(item.at)
    const bucket = groups.get(day)
    if (bucket) bucket.push(item)
    else groups.set(day, [item])
  }
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([dayStart, dayItems]) => ({
      dayStart,
      daysAgo: Math.round((today - dayStart) / DAY),
      items: dayItems.sort((a, b) => b.at - a.at),
    }))
}
