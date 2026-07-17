import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { snapshotFromState } from '@/lib/graph/graphSource'
import { graphWorker } from '@/lib/graph/GraphWorkerClient'
import { layoutGraph } from '@/lib/graph/GraphLayoutService'
import { applyFilters, type FilteredGraph } from '@/lib/graph/GraphFilterService'
import { decodeGraphSettings } from '@/lib/graph/GraphSettingsService'
import { computeDegrees, countComponents } from '@/lib/graph/GraphIndex'
import type { GraphViewSettings, LatticeGraphData } from '@/lib/graph/graphTypes'
import type { LayoutPositions } from '@/lib/graph/forceLayout'

export type GraphStatus = 'loading' | 'ready' | 'error'

export interface GraphController {
  status: GraphStatus
  error: string | null
  /** the full, unfiltered project graph (drives the inspector's real counts) */
  fullData: LatticeGraphData | null
  /** the currently visible subgraph after filters, scope and hides */
  view: FilteredGraph
  positions: LayoutPositions
  layoutPending: boolean
  settings: GraphViewSettings
  projectName: string
  updateSettings: (patch: Partial<GraphViewSettings>) => void
  pinNode: (id: string, pos: { x: number; y: number }) => void
  unpinNode: (id: string) => void
  clearPins: () => void
  rebuild: () => void
}

const EMPTY_VIEW: FilteredGraph = {
  nodes: [],
  edges: [],
  needsFocus: false,
  statistics: { nodeCount: 0, edgeCount: 0, orphanCount: 0, clusterCount: 0 },
}

/**
 * The Graph View brain: wires the store to the worker-built graph, the
 * main-thread filters, and the worker-computed layout — recomputing each
 * stage only when its inputs actually change.
 */
export function useGraphController(
  projectId: string,
  focusId: string | null,
  hiddenIds: Set<string>,
): GraphController {
  // narrow store subscriptions keep references stable across unrelated edits
  const notes = useStore((s) => s.notes)
  const docs = useStore((s) => s.docs)
  const codeDocs = useStore((s) => s.codeDocs)
  const sheetDocs = useStore((s) => s.sheetDocs)
  const presentDocs = useStore((s) => s.presentDocs)
  const assets = useStore((s) => s.assets)
  const boards = useStore((s) => s.boards)
  const projects = useStore((s) => s.projects)
  const rawSettings = useStore((s) => s.graphSettings[projectId])
  const setGraphSettings = useStore((s) => s.setGraphSettings)

  const settings = useMemo(() => decodeGraphSettings(rawSettings), [rawSettings])
  const projectName = projects[projectId]?.name ?? 'Project'

  const snapshot = useMemo(
    () =>
      snapshotFromState(
        { activeProjectId: projectId, projects, notes, docs, codeDocs, sheetDocs, presentDocs, assets, boards },
        projectId,
      ),
    [projectId, projects, notes, docs, codeDocs, sheetDocs, presentDocs, assets, boards],
  )

  const [fullData, setFullData] = useState<LatticeGraphData | null>(null)
  const [status, setStatus] = useState<GraphStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [rebuildNonce, setRebuildNonce] = useState(0)

  // reset to loading when switching projects
  useEffect(() => {
    setFullData(null)
    setStatus('loading')
    setError(null)
  }, [projectId])

  // build (worker) — debounced so a burst of edits collapses into one build
  useEffect(() => {
    let cancelled = false
    const handle = setTimeout(() => {
      graphWorker
        .buildGraph(snapshot, { showCardInstances: settings.showCardInstances })
        .then((data) => {
          if (cancelled) return
          setError(null)
          setStatus('ready')
          // skip a needless relayout when nothing structural changed
          setFullData((prev) => (prev && prev.revision === data.revision ? prev : data))
        })
        .catch((e) => {
          if (cancelled) return
          setError(e instanceof Error ? e.message : 'Failed to build the project graph.')
          setStatus('error')
        })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [snapshot, settings.showCardInstances, rebuildNonce])

  // filter (main thread, cheap) + apply session hides
  const view = useMemo<FilteredGraph>(() => {
    if (!fullData) return EMPTY_VIEW
    const filtered = applyFilters({ data: fullData, settings, focusId })
    if (hiddenIds.size === 0) return filtered
    const nodes = filtered.nodes.filter((n) => !hiddenIds.has(n.id))
    const surviving = new Set(nodes.map((n) => n.id))
    const edges = filtered.edges.filter((e) => surviving.has(e.source) && surviving.has(e.target))
    const degree = computeDegrees(nodes, edges)
    return {
      nodes,
      edges,
      needsFocus: filtered.needsFocus,
      statistics: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        orphanCount: nodes.filter((n) => (degree.get(n.id) ?? 0) === 0).length,
        clusterCount: countComponents(nodes, edges),
      },
    }
  }, [fullData, settings, focusId, hiddenIds])

  // layout (worker) — recompute only on structural / layout-parameter changes
  const [positions, setPositions] = useState<LayoutPositions>({})
  const [layoutPending, setLayoutPending] = useState(false)
  const layoutToken = useRef(0)

  const layoutKey = useMemo(
    () =>
      [
        fullData?.revision ?? '',
        settings.scope,
        settings.depth,
        settings.layout,
        settings.linkDistance,
        settings.showOrphans,
        settings.showTags,
        settings.showProject,
        settings.showComments,
        settings.showVersions,
        focusId ?? '',
        view.nodes.length,
        view.edges.length,
        hiddenIds.size,
        settings.visibleNodeKinds.slice().sort().join(','),
        settings.visibleRelationshipKinds.slice().sort().join(','),
        JSON.stringify(settings.pinnedPositions),
      ].join('|'),
    [fullData?.revision, settings, focusId, view.nodes.length, view.edges.length, hiddenIds.size],
  )

  useEffect(() => {
    if (!view.nodes.length) {
      setPositions({})
      setLayoutPending(false)
      return
    }
    const token = ++layoutToken.current
    setLayoutPending(true)
    let cancelled = false
    layoutGraph({
      nodes: view.nodes,
      edges: view.edges,
      settings: {
        layout: settings.layout,
        linkDistance: settings.linkDistance,
        pinnedPositions: settings.pinnedPositions,
      },
      focusId,
      seed: projectId,
    })
      .then((pos) => {
        if (cancelled || token !== layoutToken.current) return
        setPositions(pos)
        setLayoutPending(false)
      })
      .catch(() => {
        if (cancelled || token !== layoutToken.current) return
        setLayoutPending(false)
      })
    return () => {
      cancelled = true
    }
    // layoutKey captures every input that should trigger a relayout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey])

  const updateSettings = (patch: Partial<GraphViewSettings>) =>
    setGraphSettings(projectId, patch)

  return {
    status,
    error,
    fullData,
    view,
    positions,
    layoutPending,
    settings,
    projectName,
    updateSettings,
    pinNode: (id, pos) =>
      updateSettings({ pinnedPositions: { ...settings.pinnedPositions, [id]: pos } }),
    unpinNode: (id) => {
      const next = { ...settings.pinnedPositions }
      delete next[id]
      updateSettings({ pinnedPositions: next })
    },
    clearPins: () => updateSettings({ pinnedPositions: {} }),
    rebuild: () => setRebuildNonce((n) => n + 1),
  }
}
