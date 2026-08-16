import { useEffect, useMemo, useRef, useState } from 'react'
import type { LatticeGraphNode } from '@/lib/graph/graphTypes'
import { searchNodes } from '@/lib/graph/GraphQueryService'
import { GraphNodeIcon } from './graphVisuals'
import { IcSearch, IcX } from '@/components/Icons'

interface GraphSearchProps {
  /** node id → connected-component index, for the result subtitle (19B) */
  clusterOf?: ReadonlyMap<string, number>
  nodes: LatticeGraphNode[]
  onMatches: (ids: Set<string> | null) => void
  onPick: (node: LatticeGraphNode) => void
}

/**
 * Node search. Highlights matches (via onMatches), dims the rest, Enter
 * focuses the first result, Escape clears, selecting a result centres it.
 */
/** The matched run of the label, marked rather than merely present. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const at = text.toLowerCase().indexOf(query.trim().toLowerCase())
  if (at < 0 || !query.trim()) return <>{text}</>
  const end = at + query.trim().length
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[2px] bg-accent-soft text-ink">{text.slice(at, end)}</mark>
      {text.slice(end)}
    </>
  )
}

export function GraphSearch({ nodes, clusterOf, onMatches, onPick }: GraphSearchProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => searchNodes(nodes, query, 20), [nodes, query])

  useEffect(() => {
    onMatches(query.trim() ? new Set(matches.map((m) => m.node.id)) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, matches])

  // clear highlight when unmounted
  useEffect(() => () => onMatches(null), [onMatches])

  return (
    <div className="relative w-56">
      <div className="flex items-center gap-1.5 rounded-lg border border-bord bg-panel2 px-2">
        <IcSearch size={13} className="text-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches[0]) {
              onPick(matches[0].node)
              setOpen(false)
            } else if (e.key === 'Escape') {
              setQuery('')
              setOpen(false)
            }
          }}
          placeholder="Search nodes…"
          aria-label="Search graph nodes"
          className="h-8 min-w-0 flex-1 bg-transparent text-[12px] outline-none"
        />
        {query && (
          <button className="icon-btn !h-6 !w-6" aria-label="Clear search" onClick={() => setQuery('')}>
            <IcX size={12} />
          </button>
        )}
      </div>
      {open && query.trim() && (
        <div className="absolute top-9 left-0 z-30 max-h-64 w-full overflow-y-auto rounded-lg border border-bord bg-panel p-1 shadow-xl">
          {matches.length === 0 && (
            <div className="px-2 py-3 text-center text-[11px] text-muted">No matches</div>
          )}
          {matches.map((m) => (
            <button
              key={m.node.id}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] text-muted hover:bg-panel2 hover:text-ink"
              onClick={() => {
                onPick(m.node)
                setOpen(false)
              }}
            >
              <GraphNodeIcon icon={m.node.icon} size={12} />
              <span className="min-w-0 flex-1">
                {/* 19B: show the substring that matched, so a result explains
                    itself instead of leaving you to find the word */}
                <span className="block truncate">
                  <Highlighted text={m.node.label} query={query} />
                </span>
                <span className="block truncate text-[9.5px] text-muted">
                  {m.node.kind}
                  {clusterOf?.get(m.node.id) !== undefined && ` · cluster ${clusterOf.get(m.node.id)! + 1}`}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
