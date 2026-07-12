import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store/useStore'
import { toast } from '@/components/ui/Toaster'
import { navigateToNode } from '@/lib/graph/GraphNavigationService'
import { defaultGraphSettings } from '@/lib/graph/GraphSettingsService'
import type { LatticeGraphData, LatticeGraphNode } from '@/lib/graph/graphTypes'
import { useGraphController } from './useGraphController'
import { GraphCanvas, type GraphCameraApi } from './GraphCanvas'
import { GraphToolbar } from './GraphToolbar'
import { GraphInspector } from './GraphInspector'
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
 * The canvas uses a static, precomputed layout with no continuous or intro
 * animation, so reduced-motion is inherently respected (nothing animates).
 */
export default function GraphWorkspace() {
  const projectId = useStore((s) => s.activeProjectId)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [hovered, setHovered] = useState<{ id: string; screen: { x: number; y: number } } | null>(null)
  const [searchMatchIds, setSearchMatchIds] = useState<Set<string> | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const [listView, setListView] = useState(false)
  const [cameraApi, setCameraApi] = useState<GraphCameraApi | null>(null)

  const controller = useGraphController(projectId, focusId, hiddenIds)
  const { status, error, fullData, view, positions, settings, layoutPending } = controller

  // reset transient selection when switching project
  useEffect(() => {
    setSelectedId(null)
    setFocusId(null)
    setHiddenIds(new Set())
  }, [projectId])

  const nodeById = useMemo(() => new Map(view.nodes.map((n) => [n.id, n])), [view.nodes])
  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null
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
        <GraphSearch nodes={view.nodes} onMatches={setSearchMatchIds} onPick={pickSearchResult} />
        {settings.scope === 'local' && focusId && (
          <button
            className="btn !border-accent !text-accent"
            onClick={() => {
              setFocusId(null)
              controller.updateSettings({ scope: 'project' })
            }}
          >
            <IcGraph size={13} /> Exit local graph
          </button>
        )}
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

      <div className="flex min-h-0 flex-1">
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
                onSelect={setSelectedId}
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
              {view.needsFocus && (
                <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                  <div className="rounded-full border border-bord bg-panel/95 px-3 py-1 text-[11px] text-muted shadow">
                    Local graph — select a node and choose “Focus local graph”
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {selectedNode && !listView && status !== 'error' && (
          <GraphInspector
            node={selectedNode}
            data={fullData ?? viewData}
            onOpen={openNode}
            onFocusLocal={focusLocal}
            onHide={hideNode}
            onSelectNode={(id) => setSelectedId(id)}
            onClose={() => setSelectedId(null)}
            onCopyLink={copyLink}
          />
        )}
      </div>
    </section>
  )
}
