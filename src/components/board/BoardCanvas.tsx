import { useCallback, useEffect } from 'react'
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
  const { screenToFlowPosition } = useReactFlow()

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

  // paste a URL anywhere on the board → web embed card
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return
      const text = e.clipboardData?.getData('text') ?? ''
      if (!looksLikeUrl(text)) return
      e.preventDefault()
      const base = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      })
      const res = addWebEmbedCard(text, {
        x: base.x - CARD_DEFAULTS.webembed.w / 2,
        y: base.y - CARD_DEFAULTS.webembed.h / 2,
      })
      if (!res.cardId) alert(res.reason)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addWebEmbedCard, screenToFlowPosition])

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
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
          if (!res.cardId) alert(res.reason)
        }
      }
    },
    [addCard, addWebEmbedCard, screenToFlowPosition],
  )

  return (
    <div
      className="relative h-full min-w-0 flex-1"
      onDrop={(e) => void onDrop(e)}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
    >
      <ReactFlow
        nodes={board.nodes}
        edges={board.edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        colorMode={theme}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        minZoom={0.1}
        maxZoom={4}
        connectionMode={ConnectionMode.Loose}
        defaultEdgeOptions={defaultEdgeOptions}
        deleteKeyCode={['Delete', 'Backspace']}
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
        <Panel position="bottom-center">
          <CanvasToolbar />
        </Panel>
      </ReactFlow>
    </div>
  )
}

export function BoardCanvas() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  )
}
