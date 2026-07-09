import type { ReactNode } from 'react'
import { Handle, NodeResizer, Position } from '@xyflow/react'
import { CARD_COLORS, type CardData } from '@/types/model'

/**
 * Shared frame for every board card: colored dot + title header (the drag
 * handle), connection handles left/right, and a resizer when selected.
 */
export function CardChrome({
  data,
  selected,
  icon,
  title,
  minWidth = 180,
  minHeight = 80,
  actions,
  children,
}: {
  data: CardData
  selected?: boolean
  icon: ReactNode
  title: string
  minWidth?: number
  minHeight?: number
  /** optional header buttons, right-aligned (not part of the drag handle) */
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <NodeResizer
        isVisible={!!selected}
        minWidth={minWidth}
        minHeight={minHeight}
        lineStyle={{ borderColor: 'var(--accent)' }}
        handleStyle={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: 'var(--panel)',
          border: '1.5px solid var(--accent)',
        }}
      />
      <Handle type="target" position={Position.Left} className="card-handle" />
      <div className="card">
        <div className="drag-handle card-header">
          <span
            className="card-dot"
            style={{ background: CARD_COLORS[data.color] ?? CARD_COLORS.gray }}
          />
          {icon}
          <span className="card-title">{title}</span>
          {actions && (
            <span className="nodrag flex flex-none items-center gap-0.5">{actions}</span>
          )}
        </div>
        <div className="card-body">{children}</div>
      </div>
      <Handle type="source" position={Position.Right} className="card-handle" />
    </>
  )
}
