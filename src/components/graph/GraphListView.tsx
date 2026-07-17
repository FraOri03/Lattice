import { useMemo, useState } from 'react'
import type { LatticeGraphData, LatticeGraphNode } from '@/lib/graph/graphTypes'
import { groupedNeighbors } from '@/lib/graph/GraphQueryService'
import { RELATIONSHIP_LABEL } from './graphLabels'
import { GraphNodeIcon } from './graphVisuals'
import { IcExternal, IcSearch } from '@/components/Icons'

/**
 * Accessible, keyboard-first alternative to the canvas. Renders the graph as
 * a searchable node list plus a relationship tree for the selected node, so
 * the same exploration is possible with a screen reader or without a mouse.
 */
export function GraphListView({
  data,
  selectedId,
  onSelect,
  onOpen,
}: {
  data: LatticeGraphData
  selectedId: string | null
  onSelect: (id: string) => void
  onOpen: (node: LatticeGraphNode) => void
}) {
  const [query, setQuery] = useState('')
  const nodes = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = [...data.nodes].sort((a, b) => a.label.localeCompare(b.label))
    return q ? list.filter((n) => n.label.toLowerCase().includes(q)) : list
  }, [data.nodes, query])

  const selected = selectedId ? data.nodes.find((n) => n.id === selectedId) : undefined
  const groups = useMemo(
    () => (selected ? groupedNeighbors(data, selected.id) : []),
    [data, selected],
  )

  return (
    <div className="flex h-full min-h-0 bg-bg">
      <div className="flex w-72 flex-none flex-col border-r border-bord">
        <div className="flex items-center gap-1.5 border-b border-bord px-2">
          <IcSearch size={13} className="text-muted" />
          <input
            className="h-9 min-w-0 flex-1 bg-transparent text-[12px] outline-none"
            placeholder="Filter nodes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter graph nodes"
          />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-1" aria-label="Graph nodes">
          {nodes.map((n) => (
            <li key={n.id}>
              <button
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] ${
                  n.id === selectedId ? 'bg-panel2 text-ink' : 'text-muted hover:bg-panel2/60'
                }`}
                aria-current={n.id === selectedId}
                onClick={() => onSelect(n.id)}
              >
                <GraphNodeIcon icon={n.icon} size={12} />
                <span className="min-w-0 flex-1 truncate">{n.label}</span>
                <span className="text-[9.5px] text-muted">{n.degree ?? 0}</span>
              </button>
            </li>
          ))}
          {nodes.length === 0 && (
            <li className="px-2 py-4 text-center text-[11px] text-muted">No nodes</li>
          )}
        </ul>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        {!selected ? (
          <p className="text-[12px] text-muted">Select a node to see its relationships.</p>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <GraphNodeIcon icon={selected.icon} size={16} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-ink">{selected.label}</div>
                <div className="text-[11px] text-muted">{selected.subtitle ?? selected.kind}</div>
              </div>
              <button className="btn" onClick={() => onOpen(selected)}>
                <IcExternal size={13} /> Open
              </button>
            </div>
            {groups.length === 0 && (
              <p className="text-[12px] text-muted">No relationships in the current view.</p>
            )}
            {groups.map((group) => (
              <section key={`${group.direction}:${group.kind}`} className="mb-3">
                <h3 className="mb-1 text-[11px] font-semibold text-ink">
                  {group.direction === 'incoming' ? 'Incoming' : 'Outgoing'} ·{' '}
                  {RELATIONSHIP_LABEL[group.kind] ?? group.kind}
                </h3>
                <ul className="border-l border-bord pl-3">
                  {group.entries.map(({ edge, node }) => (
                    <li key={edge.id} className="py-0.5">
                      <button
                        className="flex items-center gap-1.5 text-left text-[12px] text-muted hover:text-ink"
                        onClick={() => onSelect(node.id)}
                      >
                        <GraphNodeIcon icon={node.icon} size={11} />
                        {node.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
