import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { useWorkspaceLayoutStore } from '@/store/workspaceLayoutStore'
import { activeTab, EMPTY_SESSION } from '@/lib/tabs/tabSession'
import {
  navKey,
  parseNav,
  resolveNav,
  serializeNav,
  type NavSnapshot,
  type NavState,
  type ResolvedNavigation,
} from './navUrl'

/**
 * useUrlHistory — binds the app's navigable state to the browser History API
 * (issue #10). Mounted once inside the workspace.
 *
 *   store change (surface/project/mode/board/entity) ──▶ history.pushState
 *   Back / Forward (popstate)                        ──▶ store.applyNav
 *   direct load / refresh                            ──▶ restore from the URL
 *
 * Surfaces (Phase 11.0): the bare root URL is the dashboard at Home, `?p=…` is
 * a project. An unknown project id lands on the dashboard rather than guessing
 * a project. The settings screen (14.1) rides over either surface as `s=…`,
 * so it is navigation too: opening it pushes an entry and Back closes it. The
 * dashboard's six destinations (13.1, built in 15.1) ride as `d=…`, so Back and
 * Forward walk them and a refresh on Trash stays on Trash.
 *
 * Loop-safety: an `applying` flag suppresses pushes while we are restoring
 * from the URL, and a `navKey` dedup means only genuine navigation (not the
 * stream of transient store writes from typing, dragging or selecting) ever
 * touches history. The `#invite=` hash flow is untouched — this only owns
 * the search string and always preserves the current hash.
 */

/**
 * The nav state implied by the current store — i.e. what the URL must say.
 * Exported because it *is* the serialisation half of the URL contract, and a
 * contract that only runs inside a mounted hook cannot be asserted.
 */
export function currentNav(): ResolvedNavigation {
  const s = useStore.getState()
  const settings = s.settingsSection ?? undefined
  if (s.navSurface === 'dashboard') {
    const nav: ResolvedNavigation = { surface: 'dashboard', destination: s.dashboardDestination }
    return settings ? { ...nav, settings } : nav
  }
  // The URL's entity is the ACTIVE TAB, read from the session rather than
  // from the six `active*Id` slots. Those are a projection of this same
  // fact (11.3.2), and the priority order this used to walk them in --
  // doc before code before sheet -- was an arbitrary tie-break for a tie
  // that can no longer happen.
  const entity: NavState['entity'] =
    activeTab(s.tabSessions[s.activeProjectId] ?? EMPTY_SESSION) ?? undefined
  return {
    surface: 'project',
    projectId: s.activeProjectId,
    mode: s.viewMode,
    split: useWorkspaceLayoutStore.getState().split || undefined,
    boardId: s.activeBoardId,
    entity,
    settings,
  }
}

function snapshot(): NavSnapshot {
  const s = useStore.getState()
  const maps = {
    note: s.notes,
    doc: s.docs,
    code: s.codeDocs,
    sheet: s.sheetDocs,
    present: s.presentDocs,
    asset: s.assets,
  } as const
  return {
    hasProject: (id) => !!s.projects[id],
    boardBelongsTo: (bid, pid) => s.boards[bid]?.projectId === pid,
    firstBoardOf: (pid) => s.boardOrder.find((b) => s.boards[b]?.projectId === pid),
    entityExists: (kind, id, pid) => {
      const rec = (maps[kind] as Record<string, { projectId?: string }>)[id]
      // legacy entities may lack a projectId — accept them for the active one
      return !!rec && (rec.projectId === pid || rec.projectId === undefined)
    },
  }
}

function urlFor(nav: ResolvedNavigation): string {
  return location.pathname + serializeNav(nav) + location.hash
}

export function useUrlHistory() {
  const applyingRef = useRef(false)
  const lastKeyRef = useRef<string | null>(null)

  const restoreFromUrl = (replace: boolean) => {
    // the resolver answers for both surfaces: no/unknown `p` ⇒ dashboard,
    // a valid `p` ⇒ that project. Either way the store follows the URL.
    const nav = resolveNav(parseNav(location.search), snapshot())
    applyingRef.current = true
    useStore.getState().applyNav(nav)
    applyingRef.current = false
    lastKeyRef.current = navKey(nav)
    const method = replace ? 'replaceState' : 'pushState'
    history[method](history.state, '', urlFor(nav))
  }

  // 1) initial load / refresh / direct link → restore (replace, no new entry)
  useEffect(() => {
    restoreFromUrl(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2) genuine navigation → push a history entry (deduped by navKey).
  // Both the section/entity store and the layout (split) store can change the
  // navigable identity, so both are watched.
  useEffect(() => {
    const onChange = () => {
      if (applyingRef.current) return
      const nav = currentNav()
      const key = navKey(nav)
      if (key === lastKeyRef.current) return
      lastKeyRef.current = key
      history.pushState(history.state, '', urlFor(nav))
    }
    const unsubStore = useStore.subscribe(onChange)
    const unsubLayout = useWorkspaceLayoutStore.subscribe(onChange)
    return () => {
      unsubStore()
      unsubLayout()
    }
  }, [])

  // 3) Back / Forward → apply the URL's state to the store
  useEffect(() => {
    const onPop = () => {
      const nav = resolveNav(parseNav(location.search), snapshot())
      applyingRef.current = true
      useStore.getState().applyNav(nav)
      applyingRef.current = false
      lastKeyRef.current = navKey(nav)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
}
