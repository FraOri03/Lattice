import type { ViewMode } from '@/types/model'

/**
 * navUrl — the small centralized abstraction for serializing, validating and
 * restoring the app's navigable state to/from the URL (issue #10).
 *
 * Navigable identity = project · mode · board · the single open entity. It is
 * deliberately coarse: transient things (card selection, drag positions,
 * scroll, panel toggles) are NOT part of it, so Back/Forward move between
 * meaningful places instead of every micro-interaction. Everything here is
 * pure so parse/serialize/validate can be unit-tested without a DOM.
 */

export type NavEntityKind = 'note' | 'doc' | 'code' | 'sheet' | 'present' | 'asset'

export interface NavState {
  projectId: string
  mode: ViewMode
  /**
   * Whether the split (second pane) layout is open. This is the LAYOUT, not a
   * section. For URL back-compatibility it is still serialized as the legacy
   * `m=split` token, so links shared before the IA refactor keep resolving.
   */
  split?: boolean
  boardId?: string
  entity?: { kind: NavEntityKind; id: string }
}

/** Legacy/compat URL token for the split layout (pre-IA-refactor deep links). */
const SPLIT_TOKEN = 'split'

const MODES: readonly ViewMode[] = [
  'board',
  'graph',
  'doc',
  'sheet',
  'presentation',
  'code',
]

/** Section an entity kind opens into — used to rebuild a `m=split` deep link. */
const ENTITY_MODE: Record<NavEntityKind, ViewMode> = {
  note: 'doc',
  doc: 'doc',
  code: 'code',
  sheet: 'sheet',
  present: 'presentation',
  asset: 'doc',
}
const ENTITY_KINDS: readonly NavEntityKind[] = [
  'note',
  'doc',
  'code',
  'sheet',
  'present',
  'asset',
]

export function isViewMode(x: string | undefined | null): x is ViewMode {
  return !!x && (MODES as readonly string[]).includes(x)
}
export function isEntityKind(x: string | undefined | null): x is NavEntityKind {
  return !!x && (ENTITY_KINDS as readonly string[]).includes(x)
}

/** Raw, unvalidated params straight off the URL. */
export interface RawNav {
  projectId?: string
  mode?: string
  boardId?: string
  entityKind?: string
  entityId?: string
}

/** Parse a URL search string ("?p=…&m=…") into raw parts. */
export function parseNav(search: string): RawNav {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const raw: RawNav = {}
  const p = q.get('p')
  if (p) raw.projectId = p
  const m = q.get('m')
  if (m) raw.mode = m
  const b = q.get('b')
  if (b) raw.boardId = b
  const e = q.get('e')
  if (e) {
    // "<kind>.<id>" — entity ids never contain a dot, and '.' survives
    // URLSearchParams unescaped (keeps the URL readable)
    const sep = e.indexOf('.')
    if (sep > 0) {
      raw.entityKind = e.slice(0, sep)
      raw.entityId = e.slice(sep + 1)
    }
  }
  return raw
}

/** Serialize nav state to a search string ("?p=…"), or "" when empty. */
export function serializeNav(nav: NavState | null): string {
  if (!nav?.projectId) return ''
  const q = new URLSearchParams()
  q.set('p', nav.projectId)
  // split is a layout, serialized as the legacy `m=split` token so pre-refactor
  // links keep resolving; otherwise the section is the mode
  q.set('m', nav.split ? SPLIT_TOKEN : nav.mode)
  if (nav.boardId) q.set('b', nav.boardId)
  if (nav.entity) q.set('e', `${nav.entity.kind}.${nav.entity.id}`)
  return `?${q.toString()}`
}

/** Canonical identity string for dedup — two states are the "same place"
 *  iff their keys match (used to avoid pushing duplicate history entries). */
export function navKey(nav: NavState | null): string {
  if (!nav) return ''
  return [
    nav.projectId,
    nav.split ? SPLIT_TOKEN : nav.mode,
    nav.boardId ?? '',
    nav.entity ? `${nav.entity.kind}:${nav.entity.id}` : '',
  ].join('|')
}

/**
 * Read side of validation: the store exposes just enough to check existence
 * and ownership without navUrl importing the store (keeps it pure/testable).
 */
export interface NavSnapshot {
  hasProject: (id: string) => boolean
  /** where to land when the requested project is missing/invalid */
  fallbackProjectId: string
  boardBelongsTo: (boardId: string, projectId: string) => boolean
  firstBoardOf: (projectId: string) => string | undefined
  entityExists: (kind: NavEntityKind, id: string, projectId: string) => boolean
}

/**
 * Turn raw URL params into a valid NavState, degrading unknown ids safely:
 * a bad project falls back to the current one, a bad mode to `board`, a board
 * that doesn't belong to the project to that project's first board, and a
 * missing entity is simply dropped (its mode still opens, just empty).
 */
export function resolveNav(raw: RawNav, snap: NavSnapshot): NavState {
  const projectId =
    raw.projectId && snap.hasProject(raw.projectId)
      ? raw.projectId
      : snap.fallbackProjectId
  const boardId =
    raw.boardId && snap.boardBelongsTo(raw.boardId, projectId)
      ? raw.boardId
      : snap.firstBoardOf(projectId)
  let entity: NavState['entity']
  if (
    isEntityKind(raw.entityKind) &&
    raw.entityId &&
    snap.entityExists(raw.entityKind, raw.entityId, projectId)
  ) {
    entity = { kind: raw.entityKind, id: raw.entityId }
  }
  // `m=split` is the layout, not a section: turn it into the split flag and
  // derive the underlying section from the open entity (or the Board).
  const split = raw.mode === SPLIT_TOKEN
  const mode: ViewMode = split
    ? entity
      ? ENTITY_MODE[entity.kind]
      : 'board'
    : isViewMode(raw.mode)
      ? raw.mode
      : 'board'
  return { projectId, mode, split: split || undefined, boardId, entity }
}
