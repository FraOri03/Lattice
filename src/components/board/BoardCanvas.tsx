import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type OnNodeDrag,
  type OnSelectionChangeFunc,
} from '@xyflow/react'
import { useStore, CARD_DEFAULTS } from '@/store/useStore'
import {
  ASSET_DRAG_MIME,
  CODE_DRAG_MIME,
  DOC_DRAG_MIME,
  NOTE_DRAG_MIME,
  PRESENT_DRAG_MIME,
  SHEET_DRAG_MIME,
} from '@/lib/dnd'
import { KIND_CARD_SIZE } from '@/lib/assets/detect'
import { KIND_DEFAULT_COLOR } from '@/components/assetKinds'
import { cardSpecFor, importFiles, reportErrors } from '@/lib/import/ImportService'
import { toVideoEmbed } from '@/lib/media'
import { looksLikeUrl } from '@/lib/web/WebEmbedService'
import { centerOf, sectionAtPoint } from '@/lib/board/sections'
import { CARD_COLORS, type BoardNode } from '@/types/model'
import { presenceService } from '@/lib/collab/PresenceService'
import { commentService } from '@/lib/collab/CommentService'
import { useCollabStore } from '@/lib/collab/collabStore'
import { usePeers, useReadOnly } from '@/lib/collab/useCollab'
import { BoardPresenceLayer } from '@/components/collab/BoardPresenceLayer'
import { CommentPins } from '@/components/collab/CommentPins'
import { CommentAreas, FOCUS_AREA_EVENT } from '@/components/collab/CommentAreas'
import { toast } from '@/components/ui/Toaster'
import { promptDialog } from '@/components/ui/ConfirmDialog'
import { IcBoard, IcNote, IcSection } from '@/components/Icons'
import { ActionIcon } from '@/components/ActionIcons'
import {
  FileCardNode,
  ImageCardNode,
  LinkCardNode,
  NoteCardNode,
  ThreeDCardNode,
  VideoCardNode,
} from './cards'
import { AssetCardNode } from './AssetCardNode'
import { RichDocCardNode } from './RichDocCardNode'
import { CodeCardNode } from './CodeCardNode'
import { SheetCardNode } from './SheetCardNode'
import { PresentationCardNode } from './PresentationCardNode'
import { SectionNode } from './SectionNode'
import { WebEmbedCardNode } from './WebEmbedCardNode'
import { PhotoCardNode } from './PhotoCardNode'
import { CanvasToolbar } from './CanvasToolbar'
import { BoardAddMenu } from './BoardAddMenu'
import { useBoardKeyboard } from './useBoardKeyboard'
import { cardAccessibleName, isEditableTarget } from '@/lib/board/keyboardNav'
import { announce } from '@/lib/a11y/announcer'

const nodeTypes = {
  note: NoteCardNode,
  image: ImageCardNode,
  video: VideoCardNode,
  link: LinkCardNode,
  file: FileCardNode,
  embed3d: ThreeDCardNode,
  asset: AssetCardNode,
  richdoc: RichDocCardNode,
  code: CodeCardNode,
  sheet: SheetCardNode,
  presentation: PresentationCardNode,
  section: SectionNode,
  webembed: WebEmbedCardNode,
  photo: PhotoCardNode,
}

const defaultEdgeOptions = {
  type: 'default',
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
}

/** First-run guidance when a board is empty (previously: a blank dot grid). */
function EmptyBoardState({ readOnly }: { readOnly: boolean }) {
  const addSection = useStore((s) => s.addSection)
  const addCard = useStore((s) => s.addCard)
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-bord bg-panel text-muted">
          <IcBoard size={26} />
        </span>
        <p className="text-[14px] font-semibold">This board is empty</p>
        {readOnly ? (
          <p className="text-[12px] leading-relaxed text-muted">
            Nothing here yet. Your role is read-only — an editor can add the first cards.
          </p>
        ) : (
          <>
            <p className="text-[12px] leading-relaxed text-muted">
              Add cards with the toolbar below, drag files from your desktop, drag
              notes/docs from the sidebar, or paste a URL to embed a website.
            </p>
            <div className="pointer-events-auto flex gap-2">
              <button className="btn" onClick={() => addCard('note', { x: 0, y: 0 })}>
                <IcNote size={13} /> First note
              </button>
              <button className="btn" onClick={() => addSection({ x: -320, y: -210 })}>
                <IcSection size={13} /> Add section
              </button>
              <button
                className="btn"
                onClick={() =>
                  (document.querySelector('[data-import-input]') as HTMLInputElement)?.click()
                }
              >
                <ActionIcon.Import size={13} /> Import files
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Canvas() {
  const board = useStore((s) => s.boards[s.activeBoardId])
  const theme = useStore((s) => s.theme)
  const onNodesChange = useStore((s) => s.onNodesChange)
  const onEdgesChange = useStore((s) => s.onEdgesChange)
  const onConnect = useStore((s) => s.onConnect)
  const addCard = useStore((s) => s.addCard)
  const addWebEmbedCard = useStore((s) => s.addWebEmbedCard)
  const attachCardToSection = useStore((s) => s.attachCardToSection)
  const detachCardFromSection = useStore((s) => s.detachCardFromSection)
  const commentMode = useCollabStore((s) => s.commentMode)
  const setFocusedThread = useCollabStore((s) => s.setFocusedThread)
  const readOnly = useReadOnly()
  const { screenToFlowPosition, fitBounds } = useReactFlow()
  const peers = usePeers()

  // Keyboard operability (A11Y-1): the container owns arrow-move / open /
  // delete / link / add; React Flow keeps nodes Tab-focusable but its own
  // key handling is off (disableKeyboardA11y) so nothing double-fires.
  const containerRef = useRef<HTMLDivElement>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const { onKeyDown, linkSourceId, focusCard } = useBoardKeyboard({
    containerRef,
    readOnly,
    onOpenAddMenu: () => setAddMenuOpen(true),
  })

  // one authoritative drag at a time: a node a peer is actively dragging
  // cannot be grabbed here until they release it
  const peerDraggedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const p of peers) {
      if (p.dragging?.boardId !== board?.id) continue
      for (const id of Object.keys(p.dragging.nodes)) ids.add(id)
    }
    return ids
  }, [peers, board?.id])

  const renderNodes = useMemo(() => {
    return (board?.nodes ?? []).map((n) => ({
      ...n,
      // one authoritative drag at a time (a peer is dragging this node)
      draggable: peerDraggedIds.has(n.id) ? false : n.draggable,
      // accessible name for screen readers (rich title announced on focus)
      ariaLabel: cardAccessibleName(n),
      // highlight the source card while a keyboard link is being drawn
      className: n.id === linkSourceId ? 'is-link-source' : undefined,
    }))
  }, [board?.nodes, peerDraggedIds, linkSourceId])

  /** Cards dropped on a section join it; dragged out, they leave it. */
  const onNodeDragStop = useCallback<OnNodeDrag<BoardNode>>(
    (_e, _node, dragged) => {
      const nodes = useStore.getState().boards[useStore.getState().activeBoardId].nodes
      for (const n of dragged) {
        if (n.type === 'section') continue
        const current = nodes.find((x) => x.id === n.id)
        if (!current) continue
        const hit = sectionAtPoint(nodes, centerOf(current, nodes))
        if (hit && hit.id !== current.parentId) attachCardToSection(current.id, hit.id)
        else if (!hit && current.parentId) detachCardFromSection(current.id)
      }
    },
    [attachCardToSection, detachCardFromSection],
  )

  /** Live selection outlines for peers. */
  const onSelectionChange = useCallback<OnSelectionChangeFunc>(({ nodes }) => {
    presenceService.setSelection(nodes.map((n) => n.id))
  }, [])

  // paste a URL anywhere on the board → web embed card
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return
      const text = e.clipboardData?.getData('text') ?? ''
      if (!looksLikeUrl(text)) return
      e.preventDefault()
      if (readOnly) {
        toast.warning('Read-only project', 'Your role cannot add cards to this board.')
        return
      }
      const base = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      })
      const res = addWebEmbedCard(text, {
        x: base.x - CARD_DEFAULTS.webembed.w / 2,
        y: base.y - CARD_DEFAULTS.webembed.h / 2,
      })
      if (!res.cardId) toast.error('Could not embed that URL', res.reason)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addWebEmbedCard, screenToFlowPosition, readOnly])

  // "zoom to area" requests from the comments panel
  useEffect(() => {
    const onFocusArea = (e: Event) => {
      const threadId = (e as CustomEvent<{ threadId: string }>).detail?.threadId
      if (!threadId) return
      const projectId = useStore.getState().activeProjectId
      const thread = useCollabStore
        .getState()
        .comments[projectId]?.find((t) => t.id === threadId)
      const area = thread?.area
      if (!area || area.boardId !== board.id) return
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      void fitBounds(
        { x: area.x, y: area.y, width: area.width, height: area.height },
        { padding: 0.6, duration: reduceMotion ? 0 : 350 },
      )
      setFocusedThread(threadId)
    }
    window.addEventListener(FOCUS_AREA_EVENT, onFocusArea)
    return () => window.removeEventListener(FOCUS_AREA_EVENT, onFocusArea)
  }, [board.id, fitBounds, setFocusedThread])

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      if (readOnly) {
        toast.warning('Read-only project', 'Your role cannot add cards to this board.')
        return
      }
      const base = screenToFlowPosition({ x: e.clientX, y: e.clientY })

      const noteId = e.dataTransfer.getData(NOTE_DRAG_MIME)
      if (noteId) {
        addCard('note', base, { noteId })
        return
      }

      const assetId = e.dataTransfer.getData(ASSET_DRAG_MIME)
      if (assetId) {
        const asset = useStore.getState().assets[assetId]
        if (asset) {
          addCard(
            'asset',
            base,
            { assetId, color: KIND_DEFAULT_COLOR[asset.kind] },
            KIND_CARD_SIZE[asset.kind],
          )
        }
        return
      }

      const docId = e.dataTransfer.getData(DOC_DRAG_MIME)
      if (docId) {
        if (useStore.getState().docs[docId]) {
          addCard(
            'richdoc',
            base,
            { docId, mode: 'compact', color: 'blue' },
            { w: CARD_DEFAULTS.richdoc.w, h: CARD_DEFAULTS.richdoc.h },
          )
        }
        return
      }

      const codeId = e.dataTransfer.getData(CODE_DRAG_MIME)
      if (codeId) {
        if (useStore.getState().codeDocs[codeId]) {
          addCard(
            'code',
            base,
            { codeId, mode: 'compact', color: 'purple' },
            { w: CARD_DEFAULTS.code.w, h: CARD_DEFAULTS.code.h },
          )
        }
        return
      }

      const sheetId = e.dataTransfer.getData(SHEET_DRAG_MIME)
      if (sheetId) {
        if (useStore.getState().sheetDocs[sheetId]) {
          addCard(
            'sheet',
            base,
            { sheetId, mode: 'compact', color: 'green' },
            { w: CARD_DEFAULTS.sheet.w, h: CARD_DEFAULTS.sheet.h },
          )
        }
        return
      }

      const presentId = e.dataTransfer.getData(PRESENT_DRAG_MIME)
      if (presentId) {
        if (useStore.getState().presentDocs[presentId]) {
          addCard(
            'presentation',
            base,
            { presentId, mode: 'compact', color: 'orange' },
            { w: CARD_DEFAULTS.presentation.w, h: CARD_DEFAULTS.presentation.h },
          )
        }
        return
      }

      const files = Array.from(e.dataTransfer.files)
      if (files.length) {
        const outcomes = await importFiles(files)
        reportErrors(outcomes)
        let offset = 0
        for (const outcome of outcomes) {
          const spec = cardSpecFor(outcome)
          if (!spec) continue
          addCard(
            spec.type,
            { x: base.x + offset, y: base.y + offset },
            spec.data,
            spec.size,
          )
          offset += 32
        }
        return
      }

      const uri =
        e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
      if (uri && /^https?:\/\//.test(uri.trim())) {
        const url = uri.trim().split('\n')[0]
        if (toVideoEmbed(url)) addCard('video', base, { url })
        else if (/\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(url))
          addCard('image', base, { src: url })
        else {
          const res = addWebEmbedCard(url, base)
          if (!res.cardId) toast.error('Could not embed that URL', res.reason)
        }
      }
    },
    [addCard, addWebEmbedCard, screenToFlowPosition, readOnly],
  )

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Board canvas"
      aria-describedby="board-kbd-help"
      tabIndex={-1}
      className={`relative h-full min-w-0 flex-1 outline-none ${commentMode ? 'cursor-crosshair' : ''}`}
      onKeyDown={onKeyDown}
      onDrop={(e) => void onDrop(e)}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = readOnly ? 'none' : 'copy'
      }}
      onPointerMove={(e) => {
        const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
        presenceService.setCursor(board.id, p.x, p.y)
      }}
      onPointerLeave={() => presenceService.clearCursor()}
    >
      <p id="board-kbd-help" className="sr-only">
        Interactive board canvas. Press Tab to move between cards. With a card
        focused, use the arrow keys to move it (hold Shift for larger steps,
        Alt for precise steps), Enter to open it, L to start a connection to
        another card, and Delete or Backspace to remove it. Press A to add a
        card. Press Escape to cancel.
      </p>
      <ReactFlow
        nodes={renderNodes}
        edges={board.edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onSelectionChange={onSelectionChange}
        colorMode={theme}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        minZoom={0.1}
        maxZoom={4}
        connectionMode={ConnectionMode.Loose}
        defaultEdgeOptions={defaultEdgeOptions}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        edgesReconnectable={!readOnly}
        // keyboard delete + arrow-move are owned by useBoardKeyboard (guarded
        // against editor focus, with live announcements); React Flow's own
        // key handling is disabled so nothing double-fires. Nodes stay
        // Tab-focusable (nodesFocusable defaults true).
        deleteKeyCode={null}
        disableKeyboardA11y
        selectionKeyCode="Shift"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
        <MiniMap
          pannable
          zoomable
          ariaLabel="Board minimap — spatial overview of cards and sections"
          nodeColor={(n) =>
            n.type === 'section'
              ? (CARD_COLORS[(n as BoardNode).data.section?.color ?? 'gray'] ?? '#888') + '66'
              : 'var(--bord)'
          }
        />
        <Controls />
        {!readOnly && (
          <Panel position="bottom-center">
            <CanvasToolbar />
          </Panel>
        )}
        {!readOnly && (
          <Panel position="bottom-left">
            <BoardAddMenu
              open={addMenuOpen}
              onOpenChange={setAddMenuOpen}
              onInserted={(id, label) => {
                // move focus onto the freshly inserted card
                requestAnimationFrame(() => focusCard(id))
                announce(`Added ${label} card`)
              }}
            />
          </Panel>
        )}
        <BoardPresenceLayer boardId={board.id} />
        <CommentPins boardId={board.id} />
        <CommentAreas boardId={board.id} />
      </ReactFlow>
      {board.nodes.length === 0 && <EmptyBoardState readOnly={readOnly} />}
      {linkSourceId && (
        <div className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-[11px] font-medium text-accent">
          Linking — Tab to another card, press Enter to connect · Esc to cancel
        </div>
      )}
      {commentMode && <CommentDrawOverlay boardId={board.id} />}
      {commentMode && (
        <div className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-[11px] font-medium text-accent">
          Click to pin a comment · drag to comment on an area · Esc to cancel
        </div>
      )}
    </div>
  )
}

/**
 * Comment drawing overlay (Phase 8). While comment mode is active it
 * captures the pointer: a plain click drops a point pin, click-and-drag
 * draws a translucent rectangle that becomes an area comment on release.
 * Escape (handled by BoardCanvas) cancels; cancelling the composer
 * removes the temporary rectangle.
 */
function CommentDrawOverlay({ boardId }: { boardId: string }) {
  const { screenToFlowPosition } = useReactFlow()
  const setCommentMode = useCollabStore((s) => s.setCommentMode)
  const setPanel = useCollabStore((s) => s.setPanel)
  const setFocusedThread = useCollabStore((s) => s.setFocusedThread)
  const containerRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<{
    sx: number
    sy: number
    cx: number
    cy: number
  } | null>(null)
  const busy = useRef(false)

  const finish = async (sx: number, sy: number, cx: number, cy: number) => {
    if (busy.current) return
    busy.current = true
    try {
      const projectId = useStore.getState().activeProjectId
      const isClick = Math.hypot(cx - sx, cy - sy) < 6
      const body = await promptDialog({
        title: isClick ? 'Comment on this spot' : 'Comment on this area',
        label: 'Comment',
        placeholder: 'What about this? (@name mentions)',
        confirmLabel: 'Add comment',
      })
      setDraft(null)
      setCommentMode(false)
      if (!body?.trim()) return // cancel removes the temporary area
      let thread = null
      if (isClick) {
        const pos = screenToFlowPosition({ x: sx, y: sy })
        thread = commentService.add(projectId, 'board', boardId, body, {
          boardId,
          x: pos.x,
          y: pos.y,
        })
      } else {
        const a = screenToFlowPosition({
          x: Math.min(sx, cx),
          y: Math.min(sy, cy),
        })
        const b = screenToFlowPosition({
          x: Math.max(sx, cx),
          y: Math.max(sy, cy),
        })
        thread = commentService.addArea(
          projectId,
          boardId,
          { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y },
          body,
        )
      }
      if (thread) {
        setPanel('comments')
        setFocusedThread(thread.id)
      }
    } finally {
      busy.current = false
    }
  }

  const bounds = containerRef.current?.getBoundingClientRect()
  const rect =
    draft && bounds
      ? {
          left: Math.min(draft.sx, draft.cx) - bounds.left,
          top: Math.min(draft.sy, draft.cy) - bounds.top,
          width: Math.abs(draft.cx - draft.sx),
          height: Math.abs(draft.cy - draft.sy),
        }
      : null

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10 cursor-crosshair"
      role="application"
      aria-label="Comment drawing layer — click to pin, drag to mark an area"
      onPointerDown={(e) => {
        if (busy.current) return
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // capture is an optimization; drawing works without it
        }
        setDraft({ sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY })
      }}
      onPointerMove={(e) => {
        if (!draft || busy.current) return
        setDraft({ ...draft, cx: e.clientX, cy: e.clientY })
      }}
      onPointerUp={(e) => {
        if (!draft || busy.current) return
        void finish(draft.sx, draft.sy, e.clientX, e.clientY)
      }}
    >
      {rect && rect.width + rect.height > 4 && (
        <div
          className="comment-area-draft"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          }}
          aria-hidden
        />
      )}
    </div>
  )
}

export function BoardCanvas() {
  const setCommentMode = useCollabStore((s) => s.setCommentMode)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCommentMode(false)
      // C activates the comment tool (click = pin, drag = area)
      if (
        (e.key === 'c' || e.key === 'C') &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !isEditableTarget(e.target)
      ) {
        setCommentMode(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setCommentMode])
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  )
}
