import type { RecentEntry } from '@/types/model'
import { useStore } from '@/store/useStore'
import { describeEntity, type EntitySources } from '@/lib/entities/entityLabel'

/**
 * Recents, resolved (Phase 11.2.3).
 *
 * `RecentEntry` is `{ kind, id, at }` — no title, no project. That is enough
 * inside a project, where "the project" is ambient, and not enough on Home,
 * where there is no ambient project to attribute an entry to.
 *
 * Storing a project id on the entry would not have saved the lookup: the
 * title has to come from the entity anyway, and the entity carries its own
 * `projectId`. So resolution stays a read of live state, the persisted shape
 * is untouched, and there is no store migration in this phase.
 *
 * The degradation is deliberate. An entry whose entity is gone resolves to
 * nothing and is dropped — the same rule the sidebar already applied by
 * dropping entries with no label.
 */

export interface ResolvedRecent {
  kind: RecentEntry['kind']
  id: string
  at: number
  /** The entity's own title, already suffixed for code files. */
  title: string
  /** Null for entities written before projects carried an id. */
  projectId: string | null
  projectName: string | null
}

/**
 * The store slices resolution reads. Shared with the tab strip, which asks the
 * same question of the same maps — see `describeEntity`.
 */
export type RecentSources = EntitySources

export interface ResolveOptions {
  /** Keep only this project's entries — what a project surface wants. */
  projectId?: string
  /**
   * Drop entries that cannot be attributed to an existing project. Home needs
   * this: opening one has to move the surface to a project, and "somewhere"
   * is not a project.
   */
  attributedOnly?: boolean
  limit?: number
}

export function resolveRecents(
  recents: RecentEntry[],
  src: RecentSources,
  opts: ResolveOptions = {},
): ResolvedRecent[] {
  const out: ResolvedRecent[] = []
  for (const entry of recents) {
    const hit = describeEntity(entry.kind, entry.id, src)
    if (!hit) continue // deleted, or from a vault this browser does not hold
    const projectId = hit.projectId ?? null
    const project = projectId ? (src.projects[projectId] ?? null) : null
    if (opts.projectId && projectId !== opts.projectId) continue
    if (opts.attributedOnly && !project) continue
    out.push({
      kind: entry.kind,
      id: entry.id,
      at: entry.at,
      title: hit.title,
      projectId,
      projectName: project?.name ?? null,
    })
    if (opts.limit && out.length >= opts.limit) break
  }
  return out
}

/**
 * Open a resolved recent, from any surface.
 *
 * The order is the whole point: `setActiveProject` clears all six entity
 * slots, so the project has to move FIRST — the reverse order opens the
 * entity and then wipes it. Boards need the section too, because
 * `setActiveBoard` only swaps the board and would leave Home rendering.
 */
export function openRecent(r: ResolvedRecent): void {
  if (r.projectId && r.projectId !== useStore.getState().activeProjectId) {
    useStore.getState().setActiveProject(r.projectId)
  }
  const s = useStore.getState()
  switch (r.kind) {
    case 'note':
      return s.openNote(r.id)
    case 'doc':
      return s.openDoc(r.id)
    case 'sheet':
      return s.openSheet(r.id)
    case 'present':
      return s.openPresent(r.id)
    case 'code':
      return s.openCode(r.id)
    case 'asset':
      return s.openAsset(r.id)
    case 'board':
      s.setActiveBoard(r.id)
      s.setViewMode('board')
      return
  }
}
