import type { ViewMode } from './model.js'

/**
 * Workspace information-architecture model (call-and-toolbar IA refactor).
 *
 * Three concepts that the old single `ViewMode` enum used to conflate are
 * now separated:
 *
 *  - WorkspaceSection — WHAT you are working on (board, document, …). This is
 *    a real, distinct workspace surface. Notes and assets are edited inside
 *    the Document section (there is no separate `note` surface in the app),
 *    so they are intentionally not listed as their own sections.
 *  - ContentView — HOW the active content is shown: the native `editor`, or
 *    the alternative `graph` relationship browser.
 *  - WorkspaceLayout — the pane geometry: a `single` pane, or a `split` with
 *    a primary and a secondary pane. Split is a layout toggle, never a
 *    section.
 *
 * The store still keeps the legacy `ViewMode` as its engine (persisted value,
 * URL token, hundreds of call sites). This module is the bridge: the UI reads
 * these separated concepts while the engine stays back-compatible. `split` is
 * no longer a `ViewMode` — it lives in the workspace layout store; `graph`
 * remains a `ViewMode` (the primary pane can show the graph) but is presented
 * as a ContentView, never as a section.
 */

export type WorkspaceSection =
  | 'board'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'code'
  | 'photo'

export type ContentView = 'editor' | 'graph'

export interface PaneState {
  section: WorkspaceSection
  entityId?: string
  view: ContentView
}

export type SplitDirection = 'horizontal' | 'vertical'

export type WorkspaceLayout =
  | { type: 'single'; primary: PaneState }
  | {
      type: 'split'
      direction: SplitDirection
      primary: PaneState
      secondary: PaneState
      ratio: number
    }

/** ViewMode values that map 1:1 to a real section (everything except graph). */
export type SectionViewMode = Exclude<ViewMode, 'graph'>

const SECTION_TO_MODE: Record<WorkspaceSection, SectionViewMode> = {
  board: 'board',
  document: 'doc',
  spreadsheet: 'sheet',
  presentation: 'presentation',
  code: 'code',
  photo: 'photo',
}

const MODE_TO_SECTION: Record<SectionViewMode, WorkspaceSection> = {
  board: 'board',
  doc: 'document',
  sheet: 'spreadsheet',
  presentation: 'presentation',
  code: 'code',
  photo: 'photo',
}

/** The section's underlying (legacy) ViewMode value. */
export function sectionToViewMode(section: WorkspaceSection): SectionViewMode {
  return SECTION_TO_MODE[section]
}

/**
 * The section a ViewMode belongs to. `graph` is a view, not a section, so it
 * has no section of its own — callers pass the section it overlays.
 */
export function viewModeToSection(mode: ViewMode): WorkspaceSection | null {
  if (mode === 'graph') return null
  return MODE_TO_SECTION[mode]
}

export interface SectionMeta {
  section: WorkspaceSection
  /** legacy ViewMode value the section switches to */
  mode: SectionViewMode
  label: string
}

/**
 * The sections the SectionSwitcher offers, in order. Single source of truth so
 * tests can assert ordering — and the absence of Split/Graph — without a DOM.
 * Split is a layout toggle and Graph is a view; neither is a section, so
 * neither appears here.
 */
export const SECTION_METAS: SectionMeta[] = [
  { section: 'board', mode: 'board', label: 'Board' },
  { section: 'document', mode: 'doc', label: 'Document' },
  { section: 'spreadsheet', mode: 'sheet', label: 'Sheet' },
  { section: 'presentation', mode: 'presentation', label: 'Presentation' },
  { section: 'code', mode: 'code', label: 'Code' },
  { section: 'photo', mode: 'photo', label: 'Photo' },
]

/**
 * Environments that are on the roadmap and have no engine yet: the AI suite
 * (phase 21 — RunPod serverless + in-house ComfyUI) and the Creative suite
 * (phases 23–26, on the phase-22 Creative Core).
 *
 * They are in the switcher, disabled, on purpose. The alternative — adding
 * them the day each one ships — is how a toolbar gets re-laid-out six times
 * and how the bar's width budget becomes a surprise six times. Here the space
 * they will occupy is spent now, and every tooltip says which phase builds it
 * rather than pretending the tab is one click from working.
 */
export type PlannedSurface =
  | 'comfyui'
  | 'aiDashboard'
  | 'trace'
  | 'forge'
  | 'folio'
  | 'flux'

export interface PlannedMeta {
  id: PlannedSurface
  /** the roadmap phase that builds it — quoted in the tooltip */
  phase: number
}

/**
 * One tab of the section switcher. Split and Graph are deliberately NOT here:
 * a layout and a content view are not sections (see the header of this file),
 * and both carry behaviour no list can express — SectionTabs codes them.
 */
export type SwitcherItem =
  | { kind: 'section'; section: WorkspaceSection }
  | { kind: 'planned'; planned: PlannedMeta }

const asSection = (section: WorkspaceSection): SwitcherItem => ({ kind: 'section', section })
const asPlanned = (id: PlannedSurface, phase: number): SwitcherItem => ({
  kind: 'planned',
  planned: { id, phase },
})

/**
 * The switcher's clusters after [Split] and [Board · Graph], in bar order.
 * Single source of truth so the grouping — and the fact that Photo sits inside
 * the creative cluster rather than beside the editors — is assertable without
 * a DOM.
 *
 * Photo is the odd member: a real, working section between placeholders. It is
 * a set-and-lighting planner, not a document, and it is the surface Forge and
 * Flux will eventually sit next to; grouping it with Sheet and Code only ever
 * described where it was built, not what it is.
 */
export const SWITCHER_CLUSTERS: SwitcherItem[][] = [
  // documents — the four editors that produce a file you read
  [
    asSection('document'),
    asSection('spreadsheet'),
    asSection('presentation'),
    asSection('code'),
  ],
  // AI — phase 21
  [asPlanned('comfyui', 21), asPlanned('aiDashboard', 21)],
  // creative — phases 23–26, with Photo already live in the middle of them
  [
    asPlanned('trace', 23),
    asPlanned('forge', 24),
    asSection('photo'),
    asPlanned('folio', 25),
    asPlanned('flux', 26),
  ],
]

/** The meta for a section, by name. */
export function sectionMeta(section: WorkspaceSection): SectionMeta {
  const meta = SECTION_METAS.find((m) => m.section === section)
  if (!meta) throw new Error(`unknown workspace section: ${section}`)
  return meta
}
