import type { LatticeGraphEdge, LatticeGraphNode } from '@/lib/graph/graphTypes'
import { relationshipOrigin } from '@/lib/graph/GraphQueryService'
import { RELATIONSHIP_LABEL } from './graphLabels'
import { GraphNodeIcon, edgeStyle } from './graphVisuals'
import { IcX } from '@/components/Icons'

/**
 * The relationship panel (19B).
 *
 * Until now an edge could only be reached through the node at one of its ends,
 * and its origin lived in a `title` attribute — invisible to keyboard, to
 * touch and to a screen reader. An edge is a first-class thing in a
 * relationship browser: it can be selected, and it says why it exists.
 */
export function GraphEdgeInspector({
  edge,
  source,
  target,
  onSelectNode,
  onClose,
}: {
  edge: LatticeGraphEdge
  source: LatticeGraphNode | null
  target: LatticeGraphNode | null
  onSelectNode: (id: string) => void
  onClose: () => void
}) {
  const dash = edgeStyle(edge.kind).dash

  return (
    <>
      <div className="flex items-start gap-2 border-b border-bord p-3">
        <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-lg border border-bord bg-panel2">
          {/* the edge's own dash pattern, so the legend and the canvas agree */}
          <svg width="16" height="8" aria-hidden>
            <line
              x1="0"
              y1="4"
              x2="16"
              y2="4"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeDasharray={dash.join(' ')}
            />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-ink">
            {RELATIONSHIP_LABEL[edge.kind] ?? edge.kind}
          </div>
          <div className="text-[11px] text-muted">Relationship</div>
        </div>
        <button className="icon-btn" aria-label="Close inspector" onClick={onClose}>
          <IcX size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="insp-h">Why this exists</div>
        <p className="text-[11.5px] leading-relaxed text-ink">{relationshipOrigin(edge)}</p>
        {edge.label && <p className="mt-1 text-[11px] text-muted">“{edge.label}”</p>}

        <div className="insp-h">Between</div>
        <div className="flex flex-col gap-0.5">
          {[
            { node: source, role: edge.directed ? 'from' : 'end' },
            { node: target, role: edge.directed ? 'to' : 'end' },
          ].map(({ node, role }, i) =>
            node ? (
              <button
                key={node.id + i}
                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11.5px] text-muted hover:bg-panel2 hover:text-ink"
                onClick={() => onSelectNode(node.id)}
              >
                <span className="w-8 flex-none text-[9.5px] tracking-wide uppercase">{role}</span>
                <GraphNodeIcon icon={node.icon} size={12} />
                <span className="min-w-0 flex-1 truncate">{node.label}</span>
              </button>
            ) : null,
          )}
        </div>

        <div className="insp-h">Origin</div>
        <dl className="flex flex-col gap-1 text-[11px]">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted">System</dt>
            <dd className="font-semibold">{edge.sourceSystem}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-muted">Direction</dt>
            <dd className="font-semibold">{edge.directed ? 'Directed' : 'Undirected'}</dd>
          </div>
          {edge.weight !== undefined && (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted">Weight</dt>
              <dd className="font-semibold tabular-nums">{edge.weight}</dd>
            </div>
          )}
        </dl>

        <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
          Relationships are derived, never drawn by hand. This one exists
          because the entity at one end really refers to the other.
        </p>
      </div>
    </>
  )
}
