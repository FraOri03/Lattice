import { useStore } from '@/store/useStore'
import { activeTab, EMPTY_SESSION, type EntityTab, type TabSession } from './tabSession'

/**
 * Reading what is open (Phase 11.3.5).
 *
 * The six `active*Id` fields are gone. They were a projection of the active
 * tab kept in the store's state, which meant the second source of truth was
 * only ever one `set({ activeDocId })` away — and the projection had to be
 * recomputed and re-stored on every change. These read it instead.
 *
 * The pure form is for services and `getState()` callers; the hooks are for
 * components, and subscribe narrowly enough that a component watching for
 * "the open note" is not re-rendered by a spreadsheet opening.
 */

interface SessionState {
  tabSessions: Record<string, TabSession>
  activeProjectId: string
}

/** The entity the active project has focused, if any. */
export function openEntityOf(s: SessionState): EntityTab | null {
  return activeTab(s.tabSessions[s.activeProjectId] ?? EMPTY_SESSION)
}

/** The open entity's id, but only when it is of `kind` — else null. */
export function openIdOf(s: SessionState, kind: EntityTab['kind']): string | null {
  const tab = openEntityOf(s)
  return tab?.kind === kind ? tab.id : null
}

export type TabShortcut = 'next' | 'previous' | 'close'

/**
 * Which tab command a keystroke means, if any (Phase 11.3.3).
 *
 * Cmd/Ctrl+W belongs to the browser and cannot be had, so every binding here
 * takes Alt as well. PageUp/PageDown and W are deliberate: brackets would
 * need AltGr on an Italian layout, and Ctrl+Alt+Arrow still rotates the
 * screen under some Windows graphics drivers.
 *
 * Pure so the mapping can be asserted without a keyboard: browser automation
 * does not reliably deliver PageUp/PageDown.
 */
export function tabShortcutFor(e: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}): TabShortcut | null {
  if (!(e.ctrlKey || e.metaKey) || !e.altKey) return null
  if (e.key === 'PageDown') return 'next'
  if (e.key === 'PageUp') return 'previous'
  if (e.key === 'w' || e.key === 'W') return 'close'
  return null
}

export function useOpenEntity(): EntityTab | null {
  return useStore((s) => openEntityOf(s))
}

export function useOpenId(kind: EntityTab['kind']): string | null {
  return useStore((s) => openIdOf(s, kind))
}
