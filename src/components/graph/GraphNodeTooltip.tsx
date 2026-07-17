import type { LatticeGraphNode } from '@/lib/graph/graphTypes'
import { GraphNodeIcon } from './graphVisuals'

/** Lightweight hover card: title, kind, tags, relationship count, modified. */
export function GraphNodeTooltip({
  node,
  degree,
  screen,
}: {
  node: LatticeGraphNode
  degree: number
  screen: { x: number; y: number }
}) {
  const modified = node.updatedAt ? new Date(node.updatedAt).toLocaleDateString() : null
  // keep the card on-screen near the cursor
  const style: React.CSSProperties = {
    left: Math.min(screen.x + 14, window.innerWidth - 240),
    top: Math.min(screen.y + 14, window.innerHeight - 120),
  }
  return (
    <div
      className="pointer-events-none fixed z-50 w-56 rounded-lg border border-bord bg-panel p-2.5 shadow-xl"
      style={style}
      role="tooltip"
    >
      <div className="flex items-center gap-1.5">
        <GraphNodeIcon icon={node.icon} size={13} />
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink">
          {node.label}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10.5px] text-muted">
        <span>{node.subtitle ?? node.kind}</span>
        <span aria-hidden>·</span>
        <span>
          {degree} link{degree === 1 ? '' : 's'}
        </span>
      </div>
      {node.tags && node.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {node.tags.slice(0, 4).map((t) => (
            <span key={t} className="rounded bg-panel2 px-1.5 py-0.5 text-[9.5px] text-muted">
              #{t}
            </span>
          ))}
        </div>
      )}
      {modified && <div className="mt-1.5 text-[10px] text-muted">Modified {modified}</div>}
    </div>
  )
}
