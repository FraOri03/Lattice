import { useMemo } from 'react'
import type { LatticeGraphNode } from '@/lib/graph/graphTypes'
import { kindMeta } from '@/lib/graph/graphKindMeta'
import { GraphNodeIcon, graphNodeColor } from './graphVisuals'
import { ENTITY_LABEL } from './graphLabels'
import { IcX } from '@/components/Icons'

const EDGE_LEGEND: { label: string; dash: string }[] = [
  { label: 'Reference / link', dash: '' },
  { label: 'Containment', dash: '1 3' },
  { label: 'Source / import', dash: '6 4' },
  { label: 'Embed / display', dash: '2 3' },
  { label: 'Tag', dash: '4 3' },
  { label: 'External source', dash: '8 3' },
]

/** Explains the visual language: which node kinds are present and what each
 * line style means. Uses icon + colour redundancy (never colour-only). */
export function GraphLegend({
  nodes,
  onClose,
}: {
  nodes: LatticeGraphNode[]
  onClose: () => void
}) {
  const presentKinds = useMemo(() => {
    const set = new Set(nodes.map((n) => n.kind))
    return [...set]
  }, [nodes])

  return (
    <div className="absolute top-2 right-2 z-30 w-52 rounded-xl border border-bord bg-panel/95 p-3 shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex-1 text-[11px] font-semibold">Legend</span>
        <button className="icon-btn !h-6 !w-6" aria-label="Close legend" onClick={onClose}>
          <IcX size={12} />
        </button>
      </div>
      <div className="mb-1 text-[9.5px] font-semibold tracking-wider text-muted uppercase">
        Entities
      </div>
      <div className="flex flex-col gap-1">
        {presentKinds.map((kind) => (
          <div key={kind} className="flex items-center gap-1.5 text-[11px] text-muted">
            <span
              className="h-2.5 w-2.5 flex-none rounded-full"
              style={{ background: graphNodeColor(kindMeta(kind).color) }}
              aria-hidden
            />
            <GraphNodeIcon icon={kindMeta(kind).icon} size={11} />
            <span>{ENTITY_LABEL[kind] ?? kind}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 mb-1 text-[9.5px] font-semibold tracking-wider text-muted uppercase">
        Relationships
      </div>
      <div className="flex flex-col gap-1">
        {EDGE_LEGEND.map((e) => (
          <div key={e.label} className="flex items-center gap-2 text-[11px] text-muted">
            <svg width="26" height="6" aria-hidden>
              <line
                x1="0"
                y1="3"
                x2="26"
                y2="3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray={e.dash}
              />
            </svg>
            <span>{e.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
