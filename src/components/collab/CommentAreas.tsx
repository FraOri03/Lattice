import { useRef, useState } from 'react'
import { ViewportPortal, useReactFlow } from '@xyflow/react'
import { useStore } from '@/store/useStore'
import { useCollabStore } from '@/lib/collab/collabStore'
import { commentService } from '@/lib/collab/CommentService'
import type { CommentThread } from '@/types/collab'

/**
 * CommentAreas — translucent rectangular comment regions on the board
 * (Phase 8). Geometry is stored in FLOW coordinates on the thread, so
 * areas pan/zoom with the canvas and sync like any other comment.
 *
 *  - open areas render as a tinted rectangle + numbered pin; clicking
 *    either opens the thread in the comments panel
 *  - the author (and owner/admin) can drag the rectangle to move it and
 *    drag the corner handle to resize; geometry commits on release
 *  - resolving minimizes the area to just its pin; reopening restores it
 */

export interface AreaDraft {
  x: number
  y: number
  width: number
  height: number
}

/** The event Canvas listens to for "zoom to this area". */
export const FOCUS_AREA_EVENT = 'lattice:focus-area'

export function focusAreaOnBoard(thread: CommentThread): void {
  if (!thread.area) return
  window.dispatchEvent(
    new CustomEvent(FOCUS_AREA_EVENT, { detail: { threadId: thread.id } }),
  )
}

function AreaRect({
  thread,
  ordinal,
  focused,
}: {
  thread: CommentThread
  ordinal: number
  focused: boolean
}) {
  const projectId = useStore((s) => s.activeProjectId)
  const setPanel = useCollabStore((s) => s.setPanel)
  const setFocusedThread = useCollabStore((s) => s.setFocusedThread)
  const { screenToFlowPosition } = useReactFlow()
  const [ghost, setGhost] = useState<AreaDraft | null>(null)
  const gesture = useRef<{
    kind: 'move' | 'resize'
    startFlow: { x: number; y: number }
    orig: AreaDraft
  } | null>(null)

  const area = thread.area!
  const canEdit = commentService.canEditArea(projectId, thread)
  const rect = ghost ?? area
  const resolved = thread.resolved

  const openThread = () => {
    setPanel('comments')
    setFocusedThread(thread.id)
  }

  const beginGesture = (kind: 'move' | 'resize') => (e: React.PointerEvent) => {
    if (!canEdit) return
    e.stopPropagation()
    e.preventDefault()
    const startFlow = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    gesture.current = {
      kind,
      startFlow,
      orig: { x: area.x, y: area.y, width: area.width, height: area.height },
    }
    const onMove = (ev: PointerEvent) => {
      const g = gesture.current
      if (!g) return
      const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
      const dx = p.x - g.startFlow.x
      const dy = p.y - g.startFlow.y
      setGhost(
        g.kind === 'move'
          ? { ...g.orig, x: g.orig.x + dx, y: g.orig.y + dy }
          : {
              ...g.orig,
              width: Math.max(24, g.orig.width + dx),
              height: Math.max(24, g.orig.height + dy),
            },
      )
    }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const g = gesture.current
      gesture.current = null
      if (!g) return
      const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
      const dx = p.x - g.startFlow.x
      const dy = p.y - g.startFlow.y
      setGhost(null)
      const moved = Math.abs(dx) > 2 || Math.abs(dy) > 2
      if (!moved) {
        if (g.kind === 'move') openThread()
        return
      }
      commentService.updateAreaGeometry(
        projectId,
        thread.id,
        g.kind === 'move'
          ? { x: g.orig.x + dx, y: g.orig.y + dy }
          : {
              width: Math.max(24, g.orig.width + dx),
              height: Math.max(24, g.orig.height + dy),
            },
      )
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const label = `Area comment ${ordinal} by ${thread.authorName}${resolved ? ' (resolved)' : ''}`

  if (resolved) {
    // minimized: only the numbered pin at the area's corner
    return (
      <button
        className={`comment-pin is-resolved ${focused ? 'is-focused' : ''}`}
        style={{
          transform: `translate(${area.x - 11}px, ${area.y - 11}px)`,
          background: 'var(--muted)',
        }}
        title={`${label} — ${thread.body.slice(0, 80)}`}
        aria-label={label}
        onClick={openThread}
      >
        {ordinal}
      </button>
    )
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        className={`comment-area ${focused ? 'is-focused' : ''} ${canEdit ? 'is-editable' : ''}`}
        style={{
          transform: `translate(${rect.x}px, ${rect.y}px)`,
          width: rect.width,
          height: rect.height,
          borderColor: area.color,
          background: `${area.color}1f`,
        }}
        title={`${thread.authorName}: ${thread.body.slice(0, 80)}`}
        onPointerDown={beginGesture('move')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openThread()
          }
        }}
      >
        {canEdit && (
          <span
            className="comment-area-resize"
            style={{ borderColor: area.color }}
            onPointerDown={beginGesture('resize')}
            aria-hidden
          />
        )}
      </div>
      <button
        className={`comment-pin ${focused ? 'is-focused' : ''}`}
        style={{
          transform: `translate(${rect.x - 11}px, ${rect.y - 11}px)`,
          background: area.color,
        }}
        title={`${label} — ${thread.body.slice(0, 80)}`}
        aria-label={label}
        onClick={openThread}
      >
        {ordinal}
      </button>
    </>
  )
}

export function CommentAreas({ boardId }: { boardId: string }) {
  const projectId = useStore((s) => s.activeProjectId)
  const comments = useCollabStore((s) => s.comments[projectId])
  const commentFilter = useCollabStore((s) => s.commentFilter)
  const focusedThreadId = useCollabStore((s) => s.focusedThreadId)

  if (!comments?.length) return null
  const areas = comments
    .filter((t) => t.targetType === 'area' && t.area?.boardId === boardId)
    .filter((t) => {
      if (commentFilter === 'open' && t.resolved) return false
      if (commentFilter === 'resolved' && !t.resolved) return false
      return true
    })
    // stable numbering: oldest area = 1
    .sort((a, b) => a.createdAt - b.createdAt)

  if (!areas.length) return null
  return (
    <ViewportPortal>
      {areas.map((t, i) => (
        <AreaRect
          key={t.id}
          thread={t}
          ordinal={i + 1}
          focused={focusedThreadId === t.id}
        />
      ))}
    </ViewportPortal>
  )
}
