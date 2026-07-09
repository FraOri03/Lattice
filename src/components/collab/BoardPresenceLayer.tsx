import { ViewportPortal } from '@xyflow/react'
import { useStore } from '@/store/useStore'
import { useBoardPeers, usePeers } from '@/lib/collab/useCollab'
import { absolutePositionOf } from '@/lib/board/sections'
import type { PresencePeer } from '@/types/collab'

/**
 * BoardPresenceLayer — live peer cursors and selection outlines, rendered
 * in flow coordinates through React Flow's ViewportPortal so they pan and
 * zoom with the canvas.
 */

function PeerCursor({ peer }: { peer: PresencePeer }) {
  if (!peer.cursor) return null
  return (
    <div
      className="peer-cursor"
      style={{ transform: `translate(${peer.cursor.x}px, ${peer.cursor.y}px)` }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill={peer.color}>
        <path d="M5 2l14 8.5-6.4 1.6L9 19z" stroke="white" strokeWidth="1.2" />
      </svg>
      <span className="peer-cursor-name" style={{ background: peer.color }}>
        {peer.name}
      </span>
    </div>
  )
}

function PeerSelections({ boardId }: { boardId: string }) {
  const peers = usePeers()
  const nodes = useStore((s) => s.boards[boardId]?.nodes)
  if (!nodes) return null

  const rects: { key: string; x: number; y: number; w: number; h: number; peer: PresencePeer }[] = []
  for (const peer of peers) {
    if (!peer.selection?.length || peer.location.boardId !== boardId) continue
    for (const id of peer.selection) {
      const node = nodes.find((n) => n.id === id)
      if (!node || node.hidden) continue
      const abs = absolutePositionOf(node, nodes)
      const w = node.width ?? node.measured?.width ?? 0
      const h = node.height ?? node.measured?.height ?? 0
      if (!w || !h) continue
      rects.push({ key: `${peer.sessionId}:${id}`, x: abs.x, y: abs.y, w, h, peer })
    }
  }
  if (!rects.length) return null

  return (
    <>
      {rects.map((r) => (
        <div
          key={r.key}
          className="peer-selection"
          style={{
            transform: `translate(${r.x}px, ${r.y}px)`,
            width: r.w,
            height: r.h,
            borderColor: r.peer.color,
          }}
        >
          <span className="peer-selection-name" style={{ background: r.peer.color }}>
            {r.peer.name}
          </span>
        </div>
      ))}
    </>
  )
}

export function BoardPresenceLayer({ boardId }: { boardId: string }) {
  const cursorPeers = useBoardPeers(boardId)
  return (
    <ViewportPortal>
      <PeerSelections boardId={boardId} />
      {cursorPeers.map((p) => (
        <PeerCursor key={p.sessionId} peer={p} />
      ))}
    </ViewportPortal>
  )
}
