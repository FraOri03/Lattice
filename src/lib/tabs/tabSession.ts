import type { NavEntityKind } from '@/lib/nav/navUrl'

/**
 * Project tab sessions — the model, with no store in sight.
 *
 * The store used to hold six independent slots (`activeNoteId`, `activeDocId`,
 * `activeCodeId`, `activeSheetId`, `activePresentId`, `activeAssetId`) that
 * nothing reconciled, while the URL carried exactly one open entity. They
 * agreed only because every `open*` helper cleared the other five by hand —
 * six chances to forget, one of which had already been taken.
 *
 * A session replaces that agreement-by-convention with a single fact: the
 * open entities, and which one is active. Since 11.3.5 the slots are not
 * stored at all; what is open is read from here through
 * [`openEntity`](./openEntity.ts). See docs/architecture/app-shell.md.
 *
 * Everything here is pure: no React, no store import, no side effects.
 */

export interface EntityTab {
  kind: NavEntityKind
  id: string
}

export interface TabSession {
  tabs: EntityTab[]
  /** `kind:id` of the active tab, or null when the session is empty. */
  activeKey: string | null
}

/** Stable identity of a tab. Entity ids are unique per kind, not across kinds. */
export function tabKey(tab: EntityTab): string {
  return `${tab.kind}:${tab.id}`
}

export const EMPTY_SESSION: TabSession = { tabs: [], activeKey: null }

export function activeTab(session: TabSession): EntityTab | null {
  if (!session.activeKey) return null
  return session.tabs.find((t) => tabKey(t) === session.activeKey) ?? null
}

/** Open (or re-focus) a tab. Opening what is already open never duplicates it. */
export function openTab(session: TabSession, tab: EntityTab): TabSession {
  const key = tabKey(tab)
  const known = session.tabs.some((t) => tabKey(t) === key)
  return {
    tabs: known ? session.tabs : [...session.tabs, tab],
    activeKey: key,
  }
}

/** Focus an already-open tab. Focusing an unknown tab is a no-op, not an open. */
export function activateTab(session: TabSession, tab: EntityTab): TabSession {
  const key = tabKey(tab)
  if (!session.tabs.some((t) => tabKey(t) === key)) return session
  return { ...session, activeKey: key }
}

/**
 * Close a tab. When the closed tab was active, focus moves to the one that
 * takes its place — the tab now at that index, or the last one if it was the
 * end of the strip. This is the rule the code tab strip already used; the
 * alternative (focus nothing) leaves the section empty for no reason.
 */
export function closeTab(session: TabSession, tab: EntityTab): TabSession {
  const key = tabKey(tab)
  const index = session.tabs.findIndex((t) => tabKey(t) === key)
  if (index === -1) return session
  const tabs = session.tabs.filter((t) => tabKey(t) !== key)
  if (session.activeKey !== key) return { ...session, tabs }
  const next = tabs[Math.min(index, tabs.length - 1)]
  return { tabs, activeKey: next ? tabKey(next) : null }
}

/**
 * The tab `delta` places from the active one, wrapping at both ends. Used by
 * the next/previous shortcuts: wrapping is what makes "next" answer from the
 * last tab instead of doing nothing, which reads as a broken key.
 */
export function cycleTab(session: TabSession, delta: number): EntityTab | null {
  if (!session.tabs.length) return null
  const current = session.tabs.findIndex((t) => tabKey(t) === session.activeKey)
  if (current === -1) return session.tabs[delta > 0 ? 0 : session.tabs.length - 1]
  const size = session.tabs.length
  return session.tabs[(((current + delta) % size) + size) % size]
}

/**
 * Drop tabs whose entity is gone — deleted here, or never present in this
 * browser. Called after a deletion, and when a session is restored from
 * storage against a vault that has moved on.
 */
export function pruneTabs(
  session: TabSession,
  exists: (tab: EntityTab) => boolean,
): TabSession {
  const tabs = session.tabs.filter(exists)
  if (tabs.length === session.tabs.length) return session
  const stillThere = session.activeKey && tabs.some((t) => tabKey(t) === session.activeKey)
  return {
    tabs,
    activeKey: stillThere ? session.activeKey : (tabs.length ? tabKey(tabs[tabs.length - 1]) : null),
  }
}

/**
 * The six entity slots as storage still holds them in payloads written
 * before 11.3. Nothing in the running app has this shape any more — only
 * `migrate` reads it, to fold what was open into a session.
 */
export interface EntitySlots {
  activeNoteId: string | null
  activeDocId: string | null
  activeCodeId: string | null
  activeSheetId: string | null
  activePresentId: string | null
  activeAssetId: string | null
}

const SLOT_OF: Record<NavEntityKind, keyof EntitySlots> = {
  note: 'activeNoteId',
  doc: 'activeDocId',
  code: 'activeCodeId',
  sheet: 'activeSheetId',
  present: 'activePresentId',
  asset: 'activeAssetId',
}

/** Reads the pre-11.3 shape: which entity that state had open, if any. */
export function tabFromSlots(slots: EntitySlots): EntityTab | null {
  for (const kind of Object.keys(SLOT_OF) as NavEntityKind[]) {
    const id = slots[SLOT_OF[kind]]
    if (id) return { kind, id }
  }
  return null
}
