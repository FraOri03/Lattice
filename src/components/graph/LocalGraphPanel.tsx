import { useMemo } from 'react'
import type { LatticeGraphData, LatticeGraphNode } from '@/lib/graph/graphTypes'
import { buildAdjacency, neighborhood } from '@/lib/graph/GraphIndex'
import { graphNodeColor } from './graphVisuals'
import { GraphNodeIcon } from './graphVisuals'

/**
 * Compact local-neighbourhood mini-graph around one entity. Reusable as a
 * sidebar panel in other modes (optional in v1). Renders a small radial SVG
 * of the focus node plus its depth-1 neighbours; clicking a neighbour
 * re-focuses it.
 */
export function LocalGraphPanel({
  data,
  focusId,
  onSelect,
  onOpen,
}: {
  data: LatticeGraphData
  focusId: string
  onSelect: (id: string) => void
  onOpen: (node: LatticeGraphNode) => void
}) {
  const focus = data.nodes.find((n) => n.id === focusId)
  const neighbors = useMemo(() => {
    const adj = buildAdjacency(data.nodes, data.edges)
    const ids = neighborhood(adj, [focusId], 1, 'both')
    ids.delete(focusId)
    const byId = new Map(data.nodes.map((n) => [n.id, n]))
    return [...ids].map((id) => byId.get(id)).filter((n): n is LatticeGraphNode => !!n)
  }, [data, focusId])

  if (!focus) return null
  const R = 70
  const cx = 90
  const cy = 90

  return (
    <div className="rounded-xl border border-bord bg-panel p-2">
      <svg width="180" height="180" role="img" aria-label={`Local graph around ${focus.label}`}>
        {neighbors.map((n, i) => {
          const a = (i / Math.max(1, neighbors.length)) * Math.PI * 2
          const x = cx + Math.cos(a) * R
          const y = cy + Math.sin(a) * R
          return (
            <g key={n.id}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--bord)" strokeWidth="1" />
              <circle
                cx={x}
                cy={y}
                r="6"
                fill={graphNodeColor(n.colorToken)}
                className="cursor-pointer"
                onClick={() => onSelect(n.id)}
              >
                <title>{n.label}</title>
              </circle>
            </g>
          )
        })}
        <circle cx={cx} cy={cy} r="9" fill={graphNodeColor(focus.colorToken)} stroke="var(--accent)" strokeWidth="2" />
      </svg>
      <button
        className="mt-1 flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11.5px] text-ink hover:bg-panel2"
        onClick={() => onOpen(focus)}
      >
        <GraphNodeIcon icon={focus.icon} size={12} />
        <span className="min-w-0 flex-1 truncate">{focus.label}</span>
        <span className="text-[9.5px] text-muted">{neighbors.length} linked</span>
      </button>
    </div>
  )
}
