import type { GraphStatistics } from '@/lib/graph/graphTypes'
import type { GraphCameraApi } from './GraphCanvas'
import { IcMaximize, IcPlus, IcRefresh } from '@/components/Icons'

/** Bottom floating controls: zoom, fit, reset, plus a live stats readout. */
export function GraphToolbar({
  api,
  statistics,
  layoutPending,
}: {
  api: GraphCameraApi | null
  statistics: GraphStatistics
  layoutPending: boolean
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center gap-2">
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-bord bg-panel/95 p-1 shadow-xl backdrop-blur">
        <button className="icon-btn" aria-label="Zoom out" title="Zoom out" onClick={() => api?.zoomBy(1 / 1.25)}>
          <span className="text-[15px] leading-none">−</span>
        </button>
        <button className="icon-btn" aria-label="Zoom in" title="Zoom in" onClick={() => api?.zoomBy(1.25)}>
          <IcPlus size={13} />
        </button>
        <button className="icon-btn" aria-label="Fit graph to view" title="Fit graph (F)" onClick={() => api?.fit()}>
          <IcMaximize size={14} />
        </button>
        <button className="icon-btn" aria-label="Reset view" title="Reset view" onClick={() => api?.reset()}>
          <IcRefresh size={14} />
        </button>
      </div>
      <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-bord bg-panel/95 px-3 py-1.5 text-[10.5px] text-muted shadow-xl backdrop-blur">
        {layoutPending && <IcRefresh size={11} className="animate-spin" />}
        <span>
          <b className="text-ink">{statistics.nodeCount}</b> nodes
        </span>
        <span aria-hidden>·</span>
        <span>
          <b className="text-ink">{statistics.edgeCount}</b> links
        </span>
        <span aria-hidden>·</span>
        <span>
          <b className="text-ink">{statistics.orphanCount}</b> orphans
        </span>
        {typeof statistics.clusterCount === 'number' && (
          <>
            <span aria-hidden>·</span>
            <span>
              <b className="text-ink">{statistics.clusterCount}</b> clusters
            </span>
          </>
        )}
      </div>
    </div>
  )
}
