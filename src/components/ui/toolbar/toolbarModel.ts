import type { ReactNode } from 'react'
import type { Catalog } from '@/lib/i18n'
import type { Capability } from '@/lib/collab/permissions'

/**
 * The action registry (Phase 11.1.2c) — what a mode's toolbar offers,
 * described as data instead of JSX.
 *
 * Why data: dividers can be derived from group boundaries instead of being
 * placed by hand, overflow can fold the tail into a menu without every caller
 * re-implementing it, and a test can assert "the board offers exactly these
 * actions" without rendering React Flow.
 *
 * A mode lists only what it can really do. The audit rule stands: no entry
 * exists here for a tool the product has not built.
 */

/** The three semantic levels every mode's toolbar is ordered by. */
export type ToolbarGroupId = 'select' | 'create' | 'annotate' | 'integrate'

export const TOOLBAR_GROUP_ORDER: readonly ToolbarGroupId[] = [
  'select',
  'create',
  'annotate',
  'integrate',
]

/** Labels come from the catalog, never as literals, so i18n cannot be skipped. */
export type ToolbarLabel = (t: Catalog) => string

interface ToolbarEntryBase {
  /** stable, testable, never shown to the user */
  id: string
  group: ToolbarGroupId
  label: ToolbarLabel
  /** longer tooltip; falls back to the label */
  description?: ToolbarLabel
  icon: ReactNode
  /** e.g. "V" or "Ctrl+Z" — appended to the tooltip, registered elsewhere */
  shortcut?: string
  /** role capability required; the entry is dropped when the role lacks it */
  capability?: Capability
  disabled?: boolean
  /** why it is disabled — shown instead of the tooltip, never invented */
  disabledReason?: ToolbarLabel
}

export interface ToolbarActionEntry extends ToolbarEntryBase {
  kind: 'action'
  run: () => void
}

export interface ToolbarToggleEntry extends ToolbarEntryBase {
  kind: 'toggle'
  pressed: boolean
  run: () => void
}

export interface ToolbarSplitEntry extends ToolbarEntryBase {
  kind: 'split'
  /** the alternatives behind the chevron; the primary repeats the last used */
  items: ToolbarSplitItem[]
  defaultItemId?: string
  /** window event that also opens the menu (the board's `A` shortcut) */
  openOnEvent?: string
}

export interface ToolbarSplitItem {
  id: string
  label: ToolbarLabel
  icon: ReactNode
  shortcut?: string
  run: () => void
}

export type ToolbarEntry = ToolbarActionEntry | ToolbarToggleEntry | ToolbarSplitEntry

/** Drop what the current role cannot use, then order by group. */
export function visibleEntries(
  entries: ToolbarEntry[],
  can: (capability: Capability) => boolean,
): ToolbarEntry[] {
  return entries
    .filter((e) => !e.capability || can(e.capability))
    .sort(
      (a, b) =>
        TOOLBAR_GROUP_ORDER.indexOf(a.group) - TOOLBAR_GROUP_ORDER.indexOf(b.group),
    )
}

/** Split a flat list into its groups, in order, dropping the empty ones. */
export function groupEntries(
  entries: ToolbarEntry[],
): { group: ToolbarGroupId; entries: ToolbarEntry[] }[] {
  return TOOLBAR_GROUP_ORDER.map((group) => ({
    group,
    entries: entries.filter((e) => e.group === group),
  })).filter((g) => g.entries.length > 0)
}
