import { useCallback, useEffect, useMemo } from 'react'
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
import { toast } from '@/components/ui/Toaster'
import { promptDialog } from '@/components/ui/ConfirmDialog'
import { IcBoard, IcNote, IcSection, IcUpload } from '@/components/Icons'
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
import { SectionNode } from './SectionNode'
import { WebEmbedCardNode } from './WebEmbedCardNode'
import { CanvasToolbar } from './CanvasToolbar'

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
  section: SectionNode,
  webembed: WebEmbedCardNode,
}

const defaultEdgeOptions = {
  type: 'default',
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
}

function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  if (!el) return false
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  )
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
                <IcUpload size={13} /> Import files
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
  const setCommentMode = useCollabStore((s) => s.setCommentMode)
  const setPanel = useCollabStore((s) => s.setPanel)
  const setFocusedThread = useCollabStore((s) => s.setFocusedThread)
  const readOnly = useReadOnly()
  const { screenToFlowPosition } = useReactFlow()
  const peers = usePeers()

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
    if (!peerDraggedIds.size) return board?.nodes ?? []
    return (board?.nodes ?? []).map((n) =>
      peerDraggedIds.has(n.id) ? { ...n, draggable: false } : n,
    )
  }, [board?.nodes, peerDraggedIds])

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

  /** Comment mode: click the canvas to pin a comment at that spot. */
  const onPaneClick = useCallback(
    async (e: React.MouseEvent) => {
      if (!commentMode) return
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const body = await promptDialog({
        title: 'Comment on this spot',
        label: 'Comment',
        placeholder: 'What about this area? (@name mentions)',
        confirmLabel: 'Add comment',
      })
      setCommentMode(false)
      if (!body?.trim()) return
      const projectId = useStore.getState().activeProjectId
      const thread = commentService.add(projectId, 'board', board.id, body, {
        boardId: board.id,
        x: pos.x,
        y: pos.y,
      })
      if (thread) {
        setPanel('comments')
        setFocusedThread(thread.id)
      }
    },
    [commentMode, screenToFlowPosition, board.id, setCommentMode, setPanel, setFocusedThread],
  )

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
      className={`relative h-full min-w-0 flex-1 ${commentMode ? 'cursor-crosshair' : ''}`}
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
      <ReactFlow
        nodes={renderNodes}
        edges={board.edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onSelectionChange={onSelectionChange}
        onPaneClick={(e) => void onPaneClick(e)}
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
        deleteKeyCode={readOnly ? null : ['Delete', 'Backspace']}
        selectionKeyCode="Shift"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
        <MiniMap
          pannable
          zoomable
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
        <BoardPresenceLayer boardId={board.id} />
        <CommentPins boardId={board.id} />
      </ReactFlow>
      {board.nodes.length === 0 && <EmptyBoardState readOnly={readOnly} />}
      {commentMode && (
        <div className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-[11px] font-medium text-accent">
          Click anywhere on the canvas to pin a comment — Esc to cancel
        </div>
      )}
    </div>
  )
}

export function BoardCanvas() {
  const setCommentMode = useCollabStore((s) => s.setCommentMode)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCommentMode(false)
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
