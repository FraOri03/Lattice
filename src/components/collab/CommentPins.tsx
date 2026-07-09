import { ViewportPortal } from '@xyflow/react'
import { useStore } from '@/store/useStore'
import { useCollabStore } from '@/lib/collab/collabStore'
import { colorForUser } from '@/lib/collab/CollaborationProvider'
import { absolutePositionOf } from '@/lib/board/sections'
import type { CommentThread } from '@/types/collab'

/**
 * CommentPins — anchored comment markers on the board canvas. Free pins
 * sit at their stored flow position; card/section pins ride along with
 * their card. Clicking a pin opens the thread in the comments panel.
 */

function pinPosition(
  thread: CommentThread,
  nodes: ReturnType<typeof useStore.getState>['boards'][string]['nodes'],
): { x: number; y: number } | null {
  if (thread.targetType === 'board') {
    if (thread.anchor?.x === undefined || thread.anchor?.y === undefined) return null
    return { x: thread.anchor.x, y: thread.anchor.y }
  }
  const node = nodes.find((n) => n.id === thread.targetId)
  if (!node || node.hidden) return null
  const abs = absolutePositionOf(node, nodes)
  const w = node.width ?? node.measured?.width ?? 0
  return { x: abs.x + w - 10, y: abs.y - 10 }
}

export function CommentPins({ boardId }: { boardId: string }) {
  const projectId = useStore((s) => s.activeProjectId)
  const nodes = useStore((s) => s.boards[boardId]?.nodes)
  const comments = useCollabStore((s) => s.comments[projectId])
  const commentFilter = useCollabStore((s) => s.commentFilter)
  const setPanel = useCollabStore((s) => s.setPanel)
  const setFocusedThread = useCollabStore((s) => s.setFocusedThread)
  const focusedThreadId = useCollabStore((s) => s.focusedThreadId)

  if (!nodes || !comments?.length) return null

  const pins = comments
    .filter((t) => {
      if (commentFilter === 'open' && t.resolved) return false
      if (commentFilter === 'resolved' && !t.resolved) return false
      const onThisBoard =
        (t.targetType === 'board' && t.targetId === boardId) ||
        ((t.targetType === 'card' ||
          t.targetType === 'section' ||
          t.targetType === 'webembed') &&
          t.anchor?.boardId === boardId)
      return onThisBoard
    })
    .map((t) => ({ thread: t, pos: pinPosition(t, nodes) }))
    .filter((p): p is { thread: CommentThread; pos: { x: number; y: number } } => !!p.pos)

  if (!pins.length) return null

  return (
    <ViewportPortal>
      {pins.map(({ thread, pos }) => (
        <button
          key={thread.id}
          className={`comment-pin ${thread.resolved ? 'is-resolved' : ''} ${
            focusedThreadId === thread.id ? 'is-focused' : ''
          }`}
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px)`,
            background: thread.resolved ? 'var(--muted)' : colorForUser(thread.authorId),
          }}
          title={`${thread.authorName}: ${thread.body.slice(0, 80)}${
            thread.replies.length ? ` · ${thread.replies.length} repl${thread.replies.length > 1 ? 'ies' : 'y'}` : ''
          }`}
          aria-label={`Comment by ${thread.authorName}`}
          onClick={() => {
            setPanel('comments')
            setFocusedThread(thread.id)
          }}
        >
          {thread.replies.length + 1}
        </button>
      ))}
    </ViewportPortal>
  )
}
