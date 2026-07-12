import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import {
  navKey,
  parseNav,
  resolveNav,
  serializeNav,
  type NavSnapshot,
  type NavState,
} from './navUrl'

/**
 * useUrlHistory — binds the app's navigable state to the browser History API
 * (issue #10). Mounted once inside the workspace.
 *
 *   store change (project/mode/board/entity) ──▶ history.pushState
 *   Back / Forward (popstate)                ──▶ store.applyNav
 *   direct load / refresh                    ──▶ restore from the URL
 *
 * Loop-safety: an `applying` flag suppresses pushes while we are restoring
 * from the URL, and a `navKey` dedup means only genuine navigation (not the
 * stream of transient store writes from typing, dragging or selecting) ever
 * touches history. The `#invite=` hash flow is untouched — this only owns
 * the search string and always preserves the current hash.
 */

/** The nav state implied by the current store. */
function currentNav(): NavState {
  const s = useStore.getState()
  let entity: NavState['entity']
  if (s.activeDocId) entity = { kind: 'doc', id: s.activeDocId }
  else if (s.activeCodeId) entity = { kind: 'code', id: s.activeCodeId }
  else if (s.activeSheetId) entity = { kind: 'sheet', id: s.activeSheetId }
  else if (s.activePresentId) entity = { kind: 'present', id: s.activePresentId }
  else if (s.activeNoteId) entity = { kind: 'note', id: s.activeNoteId }
  else if (s.activeAssetId) entity = { kind: 'asset', id: s.activeAssetId }
  return {
    projectId: s.activeProjectId,
    mode: s.viewMode,
    boardId: s.activeBoardId,
    entity,
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
    fallbackProjectId: s.activeProjectId,
    boardBelongsTo: (bid, pid) => s.boards[bid]?.projectId === pid,
    firstBoardOf: (pid) => s.boardOrder.find((b) => s.boards[b]?.projectId === pid),
    entityExists: (kind, id, pid) => {
      const rec = (maps[kind] as Record<string, { projectId?: string }>)[id]
      // legacy entities may lack a projectId — accept them for the active one
      return !!rec && (rec.projectId === pid || rec.projectId === undefined)
    },
  }
}

function urlFor(nav: NavState): string {
  return location.pathname + serializeNav(nav) + location.hash
}

export function useUrlHistory() {
  const applyingRef = useRef(false)
  const lastKeyRef = useRef<string | null>(null)

  const restoreFromUrl = (replace: boolean) => {
    const raw = parseNav(location.search)
    const hasParams = !!(raw.projectId || raw.mode || raw.entityId || raw.boardId)
    const nav = hasParams ? resolveNav(raw, snapshot()) : currentNav()
    if (hasParams) {
      applyingRef.current = true
      useStore.getState().applyNav(nav)
      applyingRef.current = false
    }
    lastKeyRef.current = navKey(nav)
    const method = replace ? 'replaceState' : 'pushState'
    history[method](history.state, '', urlFor(nav))
  }

  // 1) initial load / refresh / direct link → restore (replace, no new entry)
  useEffect(() => {
    restoreFromUrl(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 2) genuine navigation → push a history entry (deduped by navKey)
  useEffect(() => {
    return useStore.subscribe(() => {
      if (applyingRef.current) return
      const nav = currentNav()
      const key = navKey(nav)
      if (key === lastKeyRef.current) return
      lastKeyRef.current = key
      history.pushState(history.state, '', urlFor(nav))
    })
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
