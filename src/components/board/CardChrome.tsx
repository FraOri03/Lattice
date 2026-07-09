import type { ReactNode } from 'react'
import { Handle, NodeResizer, Position, useNodeId } from '@xyflow/react'
import { CARD_COLORS, type CardData } from '@/types/model'
import { useOpenCommentCount, useReadOnly } from '@/lib/collab/useCollab'
import { useCollabStore } from '@/lib/collab/collabStore'
import { useStore } from '@/store/useStore'
import { IcMessage } from '@/components/Icons'

/** Unresolved-comment badge in a card header; click opens the thread. */
function CommentBadge() {
  const nodeId = useNodeId()
  const count = useOpenCommentCount(nodeId ?? undefined)
  if (!nodeId || !count) return null
  return (
    <button
      className="card-comments nodrag cursor-pointer"
      title={`${count} open comment${count > 1 ? 's' : ''} — click to view`}
      aria-label={`${count} open comments`}
      onClick={(e) => {
        e.stopPropagation()
        const collab = useCollabStore.getState()
        const projectId = useStore.getState().activeProjectId
        const thread = (collab.comments[projectId] ?? []).find(
          (t) => t.targetId === nodeId && !t.resolved,
        )
        collab.setPanel('comments')
        collab.setFocusedThread(thread?.id ?? null)
      }}
    >
      <IcMessage size={9} />
      {count}
    </button>
  )
}

/**
 * Shared frame for every board card: colored dot + title header (the drag
 * handle), connection handles left/right, a resizer when selected, and a
 * comment badge when the card has open threads.
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
  const readOnly = useReadOnly()
  return (
    <>
      <NodeResizer
        isVisible={!!selected && !readOnly}
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
          <CommentBadge />
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
