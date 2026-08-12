import type { StarKind, Workspace } from '@/types/model'
import type { EntitySources } from '@/lib/entities/entityLabel'

/**
 * The soft-delete model (15.6) — the memory Trash needs before Trash.
 *
 * Six decisions, and the first one settles the rest:
 *
 * **A soft delete hides the record; it does not move it.** `deletedAt` and
 * `deletedBy` go onto the entity that is already there. Nothing is copied to a
 * holding area, nothing is removed from the store, and `storage.deleteDocument`
 * is not called until a purge actually runs. Three things follow for free:
 * restore is clearing two fields, the bytes stay countable while they are still
 * occupied — which is what lets the Storage bar report a trash figure — and the
 * Drive mirror is untouched, so Lattice's trash and Drive's stay separate
 * rather than one silently emptying the other.
 *
 * **It covers all eight kinds.** Projects are the loud case and entities are
 * deleted far more often; since the mechanism is two optional fields, covering
 * one costs the same as covering all. Workspaces stay out: `deleteWorkspace`
 * already has non-destructive semantics — its projects are adopted by the
 * personal workspace rather than deleted.
 *
 * **Retention is 30 days, and the purge runs on load.** A device left closed
 * for two months purges a batch when it opens, so the sweep returns how many it
 * took and the app can say so instead of quietly shrinking.
 *
 * Pure, so the arithmetic that decides what disappears can be asserted without
 * a clock or a DOM.
 */

/** How long a deleted item is kept before it is removed for good. */
export const RETENTION_DAYS = 30

const DAY = 86_400_000

/** What can be trashed — the same eight kinds that can be starred. */
export type TrashKind = StarKind

export interface TrashItem {
  kind: TrashKind
  id: string
  name: string
  /** Where it was: its project, or its workspace for a project. */
  location: string | null
  /** True when its project is in the trash too — restore has to say so. */
  orphaned: boolean
  deletedAt: number
  deletedBy: string | null
  /** Whole days remaining; 0 means it goes in tonight's sweep. */
  daysLeft: number
  purgeDate: number
  /** Only assets carry a size; everything else contributes nothing. */
  bytes: number
}

/** When an item is removed for good. */
export function purgeDateOf(deletedAt: number): number {
  return deletedAt + RETENTION_DAYS * DAY
}

function midnight(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Days left, counted in local calendar days rather than elapsed milliseconds.
 *
 * Elapsed time gets both ends of this wrong. Flooring it says "in 29 days"
 * about something deleted a second ago, because 30 days minus a second floors
 * to 29; ceiling it says "in 1 day" about something the next sweep will take
 * tonight. Counting the boundary between today and the purge date answers what
 * a person means: deleted today with a 30-day window is *in 30 days*, and a
 * purge date of today is **zero** — which is the state the page draws as
 * "purging tonight".
 *
 * Local midnight, for the same reason `groupByDay` uses it: a UTC boundary puts
 * anything after 01:00 in Rome on the wrong side of the day.
 */
export function daysLeftOf(deletedAt: number, now: number): number {
  return Math.max(0, Math.round((midnight(purgeDateOf(deletedAt)) - midnight(now)) / DAY))
}

/** Past its retention window — what the sweep on load collects. */
export function isExpired(deletedAt: number, now: number): boolean {
  return now >= purgeDateOf(deletedAt)
}

export interface TrashSources extends EntitySources {
  projects: Record<string, { name: string; deletedAt?: number; deletedBy?: string }>
}

const ENTITY_SLICES = [
  ['board', 'boards'],
  ['doc', 'docs'],
  ['note', 'notes'],
  ['sheet', 'sheetDocs'],
  ['present', 'presentDocs'],
  ['code', 'codeDocs'],
  ['asset', 'assets'],
] as const satisfies readonly (readonly [Exclude<TrashKind, 'project'>, keyof EntitySources])[]

/** Whether a record is in the trash. One predicate, so no reader guesses. */
export function isTrashed(record: { deletedAt?: number } | undefined | null): boolean {
  return !!record?.deletedAt
}

/**
 * Everything currently in the trash, newest deletion first.
 *
 * An entity whose project is *also* trashed is marked `orphaned`: restoring it
 * alone cannot put it back where it came from, because where it came from is
 * not there either. The page has to say that rather than promise a location it
 * will not deliver.
 */
export function collectTrash(
  src: TrashSources,
  workspaces: Record<string, Workspace>,
  now: number,
): TrashItem[] {
  const out: TrashItem[] = []

  const make = (
    kind: TrashKind,
    id: string,
    name: string,
    rec: { deletedAt?: number; deletedBy?: string },
    location: string | null,
    orphaned: boolean,
    bytes = 0,
  ): TrashItem | null => {
    if (!rec.deletedAt) return null
    return {
      kind,
      id,
      name,
      location,
      orphaned,
      deletedAt: rec.deletedAt,
      deletedBy: rec.deletedBy ?? null,
      daysLeft: daysLeftOf(rec.deletedAt, now),
      purgeDate: purgeDateOf(rec.deletedAt),
      bytes,
    }
  }

  for (const [id, project] of Object.entries(src.projects)) {
    const ws = Object.values(workspaces).find((w) => w.projectIds.includes(id))
    const item = make('project', id, project.name, project, ws?.name ?? null, false)
    if (item) out.push(item)
  }

  for (const [kind, slice] of ENTITY_SLICES) {
    for (const [id, entity] of Object.entries(src[slice])) {
      const rec = entity as {
        deletedAt?: number
        deletedBy?: string
        projectId?: string
        size?: number
        name?: string
        title?: string
        extension?: string
      }
      if (!rec.deletedAt) continue
      const project = rec.projectId ? src.projects[rec.projectId] : undefined
      const name =
        kind === 'code' && rec.title && rec.extension
          ? `${rec.title}.${rec.extension}`
          : (rec.title ?? rec.name ?? id)
      const item = make(
        kind,
        id,
        name,
        rec,
        project?.name ?? null,
        // its project is in the trash too, so "restore" cannot mean "put it back"
        !!project?.deletedAt,
        rec.size ?? 0,
      )
      if (item) out.push(item)
    }
  }

  return out.sort((a, b) => b.deletedAt - a.deletedAt)
}

/** Total bytes still occupied by the trash — what the Storage bar reports. */
export function trashedBytes(items: TrashItem[]): number {
  return items.reduce((sum, i) => sum + i.bytes, 0)
}
