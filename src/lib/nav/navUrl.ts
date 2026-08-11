import type { ViewMode } from '@/types/model'
import { isSettingsSection, type SettingsSection } from '@/lib/settings/sections'
import {
  destinationToken,
  resolveDestination,
  type Destination,
} from '@/lib/dashboard/destinations'

/**
 * navUrl — the small centralized abstraction for serializing, validating and
 * restoring the app's navigable state to/from the URL (issue #10).
 *
 * The app has exactly TWO navigable surfaces (Phase 11.0):
 *
 *   dashboard — no project is open; `d=<destination>` says which one
 *   project   — a project is open: project · mode · board · one entity
 *
 * The dashboard's six destinations (Phase 13.1) ride as `d=…`, with Home as
 * the ABSENCE of the token so the bare root URL keeps meaning Home and every
 * link written before phase 15 keeps resolving. `p` wins over `d`: a URL
 * carrying a valid project is the project surface, and a stray `d` alongside
 * it is dropped exactly as `m=doc` without `p` is dropped.
 *
 * Settings (Phase 14.1) is neither: it is a screen that opens OVER whichever
 * surface you were on, so it rides alongside as `s=<section>` instead of
 * becoming a third surface. That is what lets closing it put you back exactly
 * where you were — the rest of the URL never went anywhere.
 *
 * Navigable identity inside a project is deliberately coarse: transient things
 * (card selection, drag positions, scroll, panel toggles) are NOT part of it,
 * so Back/Forward move between meaningful places instead of every
 * micro-interaction. Everything here is pure so parse/serialize/validate can be
 * unit-tested without a DOM.
 */

export type NavEntityKind = 'note' | 'doc' | 'code' | 'sheet' | 'present' | 'asset'

/** Which shell surface is showing. */
export type NavSurface = 'dashboard' | 'project'

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

/**
 * The validated answer to "where are we?": either the dashboard (no project
 * open) or a project with its full navigable identity — plus, on either one,
 * the settings section showing over it.
 */
export type ResolvedNavigation = { settings?: SettingsSection } & (
  | { surface: 'dashboard'; destination: Destination }
  | ({ surface: 'project' } & NavState)
)

/** The dashboard surface at Home — a shared constant so identity checks stay
 *  cheap. Any other destination is built by `resolveNav`. */
export const DASHBOARD_NAV: ResolvedNavigation = { surface: 'dashboard', destination: 'home' }

/** Legacy/compat URL token for the split layout (pre-IA-refactor deep links). */
const SPLIT_TOKEN = 'split'

const MODES: readonly ViewMode[] = [
  'board',
  'graph',
  'doc',
  'sheet',
  'presentation',
  'code',
  'photo',
]

/**
 * Section an entity kind opens into — used to rebuild a `m=split` deep link,
 * and by the store to land on the right section when a tab session is
 * restored. One map, so the two can never disagree about where a note opens.
 */
export const ENTITY_MODE: Record<NavEntityKind, ViewMode> = {
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
  settings?: string
  destination?: string
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
  const s = q.get('s')
  if (s) raw.settings = s
  const d = q.get('d')
  if (d) raw.destination = d
  return raw
}

/**
 * Serialize nav state to a search string ("?p=…"). The dashboard at Home is
 * the param-less root URL, so it serializes to "".
 */
export function serializeNav(nav: ResolvedNavigation | null): string {
  if (!nav) return ''
  const q = new URLSearchParams()
  if (nav.surface === 'dashboard') {
    // Home is the absence of the token, so only the other five are written —
    // `destinationToken` is what makes `?d=home` unrepresentable
    const d = destinationToken(nav.destination)
    if (d) q.set('d', d)
  }
  if (nav.surface === 'project' && nav.projectId) {
    q.set('p', nav.projectId)
    // split is a layout, serialized as the legacy `m=split` token so
    // pre-refactor links keep resolving; otherwise the section is the mode
    q.set('m', nav.split ? SPLIT_TOKEN : nav.mode)
    if (nav.boardId) q.set('b', nav.boardId)
    if (nav.entity) q.set('e', `${nav.entity.kind}.${nav.entity.id}`)
  }
  // settings rides over either surface, so it survives a dashboard URL that is
  // otherwise empty — `?s=appearance` is a real, shareable address
  if (nav.settings) q.set('s', nav.settings)
  const query = q.toString()
  return query ? `?${query}` : ''
}

/** Canonical identity string for dedup — two states are the "same place"
 *  iff their keys match (used to avoid pushing duplicate history entries). */
export function navKey(nav: ResolvedNavigation | null): string {
  if (!nav) return ''
  // opening and closing settings are navigation — Back has to undo them — so
  // the section is part of the identity on both surfaces
  const settings = nav.settings ? `settings:${nav.settings}` : ''
  if (nav.surface === 'dashboard') {
    // moving between destinations IS navigation, so the destination is part of
    // the identity — Home stays the bare `dashboard` key, which keeps every
    // pre-phase-15 history entry comparing equal to itself
    return ['dashboard', destinationToken(nav.destination) ?? '', settings]
      .filter(Boolean)
      .join('|')
  }
  return [
    nav.projectId,
    nav.split ? SPLIT_TOKEN : nav.mode,
    nav.boardId ?? '',
    nav.entity ? `${nav.entity.kind}:${nav.entity.id}` : '',
    settings,
  ].join('|')
}

/**
 * Read side of validation: the store exposes just enough to check existence
 * and ownership without navUrl importing the store (keeps it pure/testable).
 */
export interface NavSnapshot {
  hasProject: (id: string) => boolean
  boardBelongsTo: (boardId: string, projectId: string) => boolean
  firstBoardOf: (projectId: string) => string | undefined
  entityExists: (kind: NavEntityKind, id: string, projectId: string) => boolean
}

/**
 * Turn raw URL params into a validated surface, degrading unknown ids safely:
 *
 *   no project param / unknown project → the dashboard (there is no "guess a
 *     project" fallback: landing in someone else's or a deleted project would
 *     be a worse answer than Home)
 *   unknown destination                → Home (never a guess)
 *   a valid project alongside `d`      → the project; `d` is dropped
 *   bad mode                           → `board`
 *   board outside the project          → that project's first board
 *   missing entity                     → dropped (its mode still opens, empty)
 *   unknown settings section           → dropped (settings simply stays shut)
 */
export function resolveNav(raw: RawNav, snap: NavSnapshot): ResolvedNavigation {
  // settings is validated on its own: it rides over whichever surface the rest
  // of the params resolve to, and an unknown section is simply dropped rather
  // than opening the screen somewhere arbitrary
  const settings = isSettingsSection(raw.settings) ? raw.settings : undefined
  if (!raw.projectId || !snap.hasProject(raw.projectId)) {
    // the dashboard is where `d` means anything; an unknown value degrades to
    // Home rather than leaving the surface addressed by a token nobody owns
    const destination = resolveDestination(raw.destination)
    if (destination === 'home' && !settings) return DASHBOARD_NAV
    return settings
      ? { surface: 'dashboard', destination, settings }
      : { surface: 'dashboard', destination }
  }
  const projectId = raw.projectId
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
  return {
    surface: 'project',
    projectId,
    mode,
    split: split || undefined,
    boardId,
    entity,
    settings,
  }
}
