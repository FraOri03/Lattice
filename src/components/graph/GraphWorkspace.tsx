import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store/useStore'
import { toast } from '@/components/ui/Toaster'
import { navigateToNode } from '@/lib/graph/GraphNavigationService'
import { componentIds } from '@/lib/graph/GraphIndex'
import { defaultGraphSettings } from '@/lib/graph/GraphSettingsService'
import type { LatticeGraphData, LatticeGraphNode } from '@/lib/graph/graphTypes'
import { useGraphController } from './useGraphController'
import { GraphCanvas, type GraphCameraApi } from './GraphCanvas'
import { GraphToolbar } from './GraphToolbar'
import { GraphInspector } from './GraphInspector'
import { GraphEdgeInspector } from './GraphEdgeInspector'
import { GraphFilters } from './GraphFilters'
import { GraphSearch } from './GraphSearch'
import { GraphLegend } from './GraphLegend'
import { GraphMinimap } from './GraphMinimap'
import { GraphNodeTooltip } from './GraphNodeTooltip'
import { GraphEmptyState, type EmptyReason } from './GraphEmptyState'
import { GraphErrorState } from './GraphErrorState'
import { GraphListView } from './GraphListView'
import { IcEye, IcFilter, IcGraph, IcInfo, IcKeyboard } from '@/components/Icons'

/**
 * Graph mode — the full-screen relationship browser. This is NOT another
 * editable board: it is an automatically generated view of the project's
 * real relationships, from which the user navigates into native workspaces.
 *
 * The layout stays static and precomputed — no continuous physics, no intro
 * animation. 19B adds one movement, the camera flight when you pick a search
 * result or focus a node, and that one checks `prefers-reduced-motion` for
 * itself: the guarantee is maintained now rather than inherent.
 */
export default function GraphWorkspace() {
  const projectId = useStore((s) => s.activeProjectId)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [hovered, setHovered] = useState<{ id: string; screen: { x: number; y: number } } | null>(null)
  const [searchMatchIds, setSearchMatchIds] = useState<Set<string> | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const [listView, setListView] = useState(false)
  const [cameraApi, setCameraApi] = useState<GraphCameraApi | null>(null)
  /**
   * 19B frame E: above 1440 the inspector is a docked column; below it, it
   * floats, because taking 316px out of the canvas re-lays-out every node just
   * because you clicked one.
   */
  const [wide, setWide] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1440)
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 1440)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const panelClass = wide
    ? 'flex h-full w-[19.75rem] flex-none flex-col border-l border-bord bg-panel'
    : 'side-panel-drawer absolute top-2 right-2 bottom-2 z-10 flex w-[18.75rem] flex-col rounded-xl border border-bord bg-panel shadow-xl'

  const controller = useGraphController(projectId, focusId, hiddenIds)
  const { status, error, fullData, view, positions, settings, layoutPending } = controller

  // reset transient selection when switching project
  useEffect(() => {
    setSelectedId(null)
    setSelectedEdgeId(null)
    setFocusId(null)
    setHiddenIds(new Set())
  }, [projectId])

  const nodeById = useMemo(() => new Map(view.nodes.map((n) => [n.id, n])), [view.nodes])
  // which cluster each node sits in, so a search result can say where it is
  const clusterOf = useMemo(() => componentIds(view.nodes, view.edges), [view.nodes, view.edges])
  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null
  const selectedEdge = selectedEdgeId
    ? view.edges.find((e) => e.id === selectedEdgeId) ?? null
    : null
  const hoveredNode = hovered ? nodeById.get(hovered.id) ?? null : null

  const viewData: LatticeGraphData = useMemo(
    () =>
      fullData
        ? { ...fullData, nodes: view.nodes, edges: view.edges, statistics: view.statistics }
        : {
            schemaVersion: 1,
            projectId,
            nodes: [],
            edges: [],
            generatedAt: '',
            revision: '',
            statistics: view.statistics,
          },
    [fullData, view, projectId],
  )

  const openNode = useCallback((node: LatticeGraphNode, opts: { split: boolean }) => {
    const result = navigateToNode(node, opts)
    if (result.kind === 'focus-local') {
      setFocusId(node.id)
      setSelectedId(node.id)
      controller.updateSettings({ scope: 'local' })
      toast.info('Local graph', `Focused on ${node.label}.`)
    } else if (result.kind === 'external') {
      window.open(result.url, '_blank', 'noopener,noreferrer')
    } else if (result.kind === 'none') {
      toast.info('Nothing to open', result.reason)
    }
    // 'opened' switches viewMode in the store, unmounting this workspace
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const focusLocal = useCallback((node: LatticeGraphNode) => {
    setFocusId(node.id)
    setSelectedId(node.id)
    controller.updateSettings({ scope: 'local' })
    cameraApi?.centerOn(node.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraApi])

  const copyLink = useCallback((node: LatticeGraphNode) => {
    const wikilinkKinds = ['note', 'document', 'spreadsheet', 'code']
    const text = wikilinkKinds.includes(node.kind) ? `[[${node.label}]]` : node.label
    void navigator.clipboard?.writeText(text).then(
      () => toast.success('Copied', `${text} copied to clipboard.`),
      () => toast.warning('Copy failed', 'Clipboard is unavailable.'),
    )
  }, [])

  const pickSearchResult = useCallback(
    (node: LatticeGraphNode) => {
      setSelectedId(node.id)
      cameraApi?.centerOn(node.id)
    },
    [cameraApi],
  )

  const resetFilters = useCallback(() => {
    controller.updateSettings({ ...defaultGraphSettings(), pinnedPositions: settings.pinnedPositions })
    setHiddenIds(new Set())
    setFocusId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.pinnedPositions])

  /**
   * Select a node and everything one hop from it (19B). Reading a graph is
   * mostly asking "what is around this?", and answering it by clicking each
   * neighbour in turn loses the shape of the answer.
   */
  const selectNeighbourhood = useCallback(
    (node: LatticeGraphNode) => {
      setSelectedId(node.id)
      setSelectedEdgeId(null)
      const around = new Set<string>([node.id])
      for (const e of view.edges) {
        if (e.source === node.id) around.add(e.target)
        if (e.target === node.id) around.add(e.source)
      }
      setSearchMatchIds(around.size > 1 ? around : null)
      toast.info('Neighbourhood', `${around.size - 1} directly connected.`)
    },
    [view.edges],
  )

  const hideNode = useCallback((id: string) => {
    setHiddenIds((prev) => new Set(prev).add(id))
    setSelectedId((cur) => (cur === id ? null : cur))
  }, [])

  const emptyReason: EmptyReason | null =
    status === 'ready' && view.nodes.length === 0
      ? (fullData?.statistics.nodeCount ?? 0) === 0
        ? 'no-entities'
        : 'all-filtered'
      : null

  const loading = status === 'loading' || (status === 'ready' && view.nodes.length > 0 && Object.keys(positions).length === 0)

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-bg" aria-label="Graph workspace">
      {/* internal toolbar strip */}
      <div className="flex flex-none items-center gap-2 border-b border-bord bg-panel px-3 py-1.5">
        <button
          className={`btn ${filtersOpen ? '!border-accent !text-accent' : ''}`}
          aria-pressed={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <IcFilter size={13} /> Filters
        </button>
        <GraphSearch
          nodes={view.nodes}
          clusterOf={clusterOf}
          onMatches={setSearchMatchIds}
          onPick={pickSearchResult}
        />

        <div className="flex-1" />
        {view.needsFocus && (
          <span className="hidden items-center gap-1.5 text-[11px] text-muted md:flex">
            <IcInfo size={12} /> Select a node → “Focus local graph”
          </span>
        )}
        <button
          className={`btn ${listView ? '!border-accent !text-accent' : ''}`}
          aria-pressed={listView}
          title="Accessible list view"
          onClick={() => setListView((v) => !v)}
        >
          <IcKeyboard size={13} /> <span className="hidden lg:inline">List</span>
        </button>
        <button
          className={`btn ${legendOpen ? '!border-accent !text-accent' : ''}`}
          aria-pressed={legendOpen}
          onClick={() => setLegendOpen((v) => !v)}
        >
          <IcEye size={13} /> <span className="hidden lg:inline">Legend</span>
        </button>
      </div>

      {/* 19B frame C: one 30px bar carries the whole local-graph context —
          the way back, the root, the depth and how much you are looking at */}
      {settings.scope === 'local' && focusId && (
        <div className="flex h-[30px] flex-none items-center gap-2 border-b border-bord bg-panel2 px-3 text-[11px]">
          <button
            className="flex items-center gap-1 text-accent hover:underline"
            onClick={() => {
              setFocusId(null)
              controller.updateSettings({ scope: 'project' })
            }}
          >
            ← Project graph
          </button>
          <span className="text-muted">/</span>
          <span className="min-w-0 flex-1 truncate font-semibold text-ink">
            {nodeById.get(focusId)?.label ?? fullData?.nodes.find((n) => n.id === focusId)?.label ?? 'Local'}
          </span>
          <span className="flex items-center gap-1">
            <span className="text-muted">Depth</span>
            <button
              className="icon-btn h-5 w-5"
              aria-label="Decrease depth"
              disabled={settings.depth <= 1}
              onClick={() => controller.updateSettings({ depth: settings.depth - 1 })}
            >
              −
            </button>
            <span className="w-3 text-center tabular-nums">{settings.depth}</span>
            <button
              className="icon-btn h-5 w-5"
              aria-label="Increase depth"
              disabled={settings.depth >= 5}
              onClick={() => controller.updateSettings({ depth: settings.depth + 1 })}
            >
              +
            </button>
          </span>
          <span className="tabular-nums text-muted">
            {view.statistics.nodeCount} of {fullData?.statistics.nodeCount ?? view.statistics.nodeCount} nodes
          </span>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        {filtersOpen && (
          <GraphFilters
            settings={settings}
            update={controller.updateSettings}
            onClose={() => setFiltersOpen(false)}
          />
        )}

        <div className="relative min-w-0 flex-1">
          {status === 'error' ? (
            <GraphErrorState
              message={error ?? 'Unknown error.'}
              onRetry={controller.rebuild}
              onOpenList={() => setListView(true)}
            />
          ) : listView ? (
            <GraphListView
              data={viewData}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onOpen={(n) => openNode(n, { split: false })}
            />
          ) : loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg text-muted">
              <IcGraph size={30} className="animate-pulse" />
              <p className="text-[12px]">Building project graph…</p>
              <p className="text-[10.5px]">
                {view.statistics.nodeCount > 0
                  ? `${view.statistics.nodeCount} nodes · ${view.statistics.edgeCount} links`
                  : 'Indexing relationships'}
              </p>
            </div>
          ) : emptyReason ? (
            <GraphEmptyState reason={emptyReason} onResetFilters={resetFilters} />
          ) : (
            <>
              <GraphCanvas
                nodes={view.nodes}
                edges={view.edges}
                positions={positions}
                settings={settings}
                selectedId={selectedId}
                focusId={focusId}
                hoveredId={hovered?.id ?? null}
                searchMatchIds={searchMatchIds}
                selectedEdgeId={selectedEdgeId}
                onSelect={(id) => {
                  setSelectedId(id)
                  if (id) setSelectedEdgeId(null)
                }}
                onSelectEdge={setSelectedEdgeId}
                onOpen={openNode}
                onHover={(id, screen) => setHovered(id && screen ? { id, screen } : null)}
                onPinNode={controller.pinNode}
                onKeyboardFocus={(node) => setSelectedId(node?.id ?? null)}
                apiRef={setCameraApi}
              />
              <GraphToolbar api={cameraApi} statistics={view.statistics} layoutPending={layoutPending} />
              {view.nodes.length > 40 && <GraphMinimap nodes={view.nodes} positions={positions} />}
              {legendOpen && <GraphLegend nodes={view.nodes} onClose={() => setLegendOpen(false)} />}
              {hoveredNode && hovered && (
                <GraphNodeTooltip
                  node={hoveredNode}
                  degree={hoveredNode.degree ?? 0}
                  screen={hovered.screen}
                />
              )}
              {/* 19B frame D: the old positions stay on screen while the new
                  layout is computed, and the canvas says so rather than
                  blanking and re-appearing somewhere else */}
              {layoutPending && (
                <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                  <div className="rounded-full border border-bord bg-panel/95 px-3 py-1 text-[11px] text-muted shadow">
                    Recalculating layout — positions update when it settles
                  </div>
                </div>
              )}

              {view.needsFocus && !layoutPending && (
                <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                  <div className="rounded-full border border-bord bg-panel/95 px-3 py-1 text-[11px] text-muted shadow">
                    Local graph — select a node and choose “Focus local graph”
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {selectedEdge && !listView && status !== 'error' && (
          <aside className={panelClass} aria-label="Graph inspector">
            <GraphEdgeInspector
              edge={selectedEdge}
              source={nodeById.get(selectedEdge.source) ?? null}
              target={nodeById.get(selectedEdge.target) ?? null}
              onSelectNode={(id) => {
                setSelectedEdgeId(null)
                setSelectedId(id)
              }}
              onClose={() => setSelectedEdgeId(null)}
            />
          </aside>
        )}

        {selectedNode && !selectedEdge && !listView && status !== 'error' && (
          <GraphInspector
            node={selectedNode}
            data={fullData ?? viewData}
            onOpen={openNode}
            onFocusLocal={focusLocal}
            onHide={hideNode}
            onSelectNode={(id) => setSelectedId(id)}
            onClose={() => setSelectedId(null)}
            onCopyLink={copyLink}
            className={panelClass}
            pinned={!!settings.pinnedPositions[selectedNode.id]}
            onTogglePin={() => {
              const pos = positions[selectedNode.id]
              if (settings.pinnedPositions[selectedNode.id]) controller.unpinNode(selectedNode.id)
              else if (pos) controller.pinNode(selectedNode.id, pos)
            }}
            onSelectNeighbourhood={() => selectNeighbourhood(selectedNode)}
          />
        )}
      </div>
    </section>
  )
}
