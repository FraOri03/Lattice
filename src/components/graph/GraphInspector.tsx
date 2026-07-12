import { useMemo } from 'react'
import type { LatticeGraphData, LatticeGraphNode } from '@/lib/graph/graphTypes'
import {
  groupedNeighbors,
  incomingEdges,
  outgoingEdges,
  relationshipOrigin,
} from '@/lib/graph/GraphQueryService'
import { RELATIONSHIP_LABEL } from './graphLabels'
import { GraphNodeIcon } from './graphVisuals'
import { IcExternal, IcEye, IcGraph, IcSplit, IcTag, IcX, IcCopy } from '@/components/Icons'

interface GraphInspectorProps {
  node: LatticeGraphNode
  data: LatticeGraphData
  onOpen: (node: LatticeGraphNode, opts: { split: boolean }) => void
  onFocusLocal: (node: LatticeGraphNode) => void
  onHide: (id: string) => void
  onSelectNode: (id: string) => void
  onClose: () => void
  onCopyLink: (node: LatticeGraphNode) => void
}

/**
 * Context-aware right panel. Explains a node and — crucially — WHY each of
 * its relationships exists (origin + kind), grouped by direction. Selection
 * is an inspection state: opening happens only through explicit actions.
 */
export function GraphInspector({
  node,
  data,
  onOpen,
  onFocusLocal,
  onHide,
  onSelectNode,
  onClose,
  onCopyLink,
}: GraphInspectorProps) {
  const groups = useMemo(() => groupedNeighbors(data, node.id), [data, node.id])
  const incoming = useMemo(() => incomingEdges(data, node.id).length, [data, node.id])
  const outgoing = useMemo(() => outgoingEdges(data, node.id).length, [data, node.id])

  return (
    <aside
      className="flex h-full w-72 flex-none flex-col border-l border-bord bg-panel"
      aria-label="Graph inspector"
    >
      <div className="flex items-start gap-2 border-b border-bord p-3">
        <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-lg border border-bord bg-panel2">
          <GraphNodeIcon icon={node.icon} size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-ink" title={node.label}>
            {node.label}
          </div>
          <div className="text-[11px] text-muted">{node.subtitle ?? node.kind}</div>
        </div>
        <button className="icon-btn" aria-label="Close inspector" onClick={onClose}>
          <IcX size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {/* counts */}
        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[
            ['Links', incoming + outgoing],
            ['Incoming', incoming],
            ['Outgoing', outgoing],
          ].map(([label, val]) => (
            <div key={label} className="rounded-lg border border-bord bg-panel2 py-1.5">
              <div className="text-[15px] font-bold text-ink">{val}</div>
              <div className="text-[9.5px] tracking-wide text-muted uppercase">{label}</div>
            </div>
          ))}
        </div>

        {node.tags && node.tags.length > 0 && (
          <>
            <div className="insp-h">Tags</div>
            <div className="flex flex-wrap gap-1">
              {node.tags.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-1 rounded bg-panel2 px-1.5 py-0.5 text-[10px] text-muted"
                >
                  <IcTag size={9} /> {t}
                </span>
              ))}
            </div>
          </>
        )}

        {/* actions */}
        <div className="insp-h">Actions</div>
        <div className="flex flex-col gap-1.5">
          <button className="btn justify-start" onClick={() => onOpen(node, { split: false })}>
            <IcExternal size={13} /> Open in workspace
          </button>
          <button className="btn justify-start" onClick={() => onOpen(node, { split: true })}>
            <IcSplit size={13} /> Open beside graph
          </button>
          <button className="btn justify-start" onClick={() => onFocusLocal(node)}>
            <IcGraph size={13} /> Focus local graph
          </button>
          <div className="flex gap-1.5">
            <button className="btn flex-1 justify-start" onClick={() => onCopyLink(node)}>
              <IcCopy size={13} /> Copy link
            </button>
            <button className="btn flex-1 justify-start" onClick={() => onHide(node.id)}>
              <IcEye size={13} /> Hide
            </button>
          </div>
        </div>

        {/* linked entities grouped by relationship, with origin */}
        <div className="insp-h">Relationships</div>
        {groups.length === 0 && (
          <p className="text-[11px] text-muted">
            No visible relationships. This entity is an orphan in the current filters.
          </p>
        )}
        {groups.map((group) => (
          <div key={`${group.direction}:${group.kind}`} className="mb-2.5">
            <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-muted">
              <span className="rounded bg-panel2 px-1.5 py-0.5">
                {group.direction === 'incoming' ? '← in' : 'out →'}
              </span>
              <span>{RELATIONSHIP_LABEL[group.kind] ?? group.kind}</span>
              <span className="text-muted/70">· {group.entries.length}</span>
            </div>
            {group.entries.slice(0, 12).map(({ edge, node: other }) => (
              <button
                key={edge.id}
                className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11.5px] text-muted hover:bg-panel2 hover:text-ink"
                onClick={() => onSelectNode(other.id)}
                title={`${relationshipOrigin(edge)}${edge.label ? ` — “${edge.label}”` : ''}`}
              >
                <GraphNodeIcon icon={other.icon} size={12} />
                <span className="min-w-0 flex-1 truncate">{other.label}</span>
              </button>
            ))}
            {group.entries.length > 12 && (
              <div className="px-1.5 text-[10px] text-muted">
                +{group.entries.length - 12} more
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  )
}
