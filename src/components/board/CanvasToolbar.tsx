import { useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { CardType } from '@/types/model'
import { useStore } from '@/store/useStore'
import { cardSpecFor, importFiles, reportErrors } from '@/lib/import/ImportService'
import { useCollabStore } from '@/lib/collab/collabStore'
import { useCan } from '@/lib/collab/useCollab'
import { toast } from '@/components/ui/Toaster'
import { promptDialog } from '@/components/ui/ConfirmDialog'
import {
  IcCamera,
  IcCode,
  IcCube,
  IcDoc,
  IcGlobe,
  IcImage,
  IcLink,
  IcMessage,
  IcNote,
  IcPresentation,
  IcSection,
  IcTable,
  IcVideo,
} from '@/components/Icons'
import { ActionIcon } from '@/components/ActionIcons'
import { ToolbarDivider } from '@/components/ui/ToolbarDivider'
import { ToolMenu, type ToolMenuItem } from './ToolMenu'
import { announceCardInserted, OPEN_CREATE_MENU_EVENT } from './boardToolEvents'

/**
 * Figma-style board toolbar: the real, existing tools grouped by operating
 * category. Categories that this product does not have (drawing/pen, shapes,
 * frames, groups, a dev/inspect mode) are intentionally NOT invented here — a
 * menu only ever offers tools that actually work. Each family is a compact
 * split menu (see ToolMenu) so the bar stays short.
 */
export function CanvasToolbar() {
  const { screenToFlowPosition } = useReactFlow()
  const addCard = useStore((s) => s.addCard)
  const addSection = useStore((s) => s.addSection)
  const addWebEmbedCard = useStore((s) => s.addWebEmbedCard)
  const commentMode = useCollabStore((s) => s.commentMode)
  const setCommentMode = useCollabStore((s) => s.setCommentMode)
  const mayComment = useCan('comments.add')
  const imageInput = useRef<HTMLInputElement>(null)
  const importInput = useRef<HTMLInputElement>(null)

  const centerPos = () => {
    const p = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    })
    // slight jitter so repeated inserts don't stack perfectly
    return { x: p.x - 150 + Math.random() * 40, y: p.y - 100 + Math.random() * 40 }
  }

  /** Insert and hand the new card to the canvas so it can focus + announce it. */
  const inserted = (id: string, label: string) => {
    if (id) announceCardInserted(id, label)
    return id
  }

  const insert = (type: CardType, label: string) =>
    inserted(addCard(type, centerPos()), label)

  /** All file pickers route through the universal ImportService. */
  const importAndPlace = async (list: FileList | null) => {
    const outcomes = await importFiles(Array.from(list ?? []))
    reportErrors(outcomes)
    for (const outcome of outcomes) {
      const spec = cardSpecFor(outcome)
      if (spec) addCard(spec.type, centerPos(), spec.data, spec.size)
    }
  }

  const promptWebEmbed = () => {
    void promptDialog({
      title: 'Embed a webpage',
      body: 'Only http(s) URLs are allowed. Sites that refuse framing fall back to a link preview.',
      label: 'URL',
      placeholder: 'https://…',
      confirmLabel: 'Embed',
    }).then((url) => {
      if (!url) return
      const res = addWebEmbedCard(url, centerPos())
      if (!res.cardId) toast.error('Could not embed that URL', res.reason)
      else inserted(res.cardId, 'web embed')
    })
  }

  // Creation — document entities that can really be created from the board
  const createItems: ToolMenuItem[] = [
    { key: 'note', label: 'Note', icon: <IcNote size={16} />, onRun: () => insert('note', 'note') },
    {
      key: 'richdoc',
      label: 'Document',
      icon: <IcDoc size={16} />,
      onRun: () => {
        const docId = useStore.getState().createDoc()
        inserted(
          addCard('richdoc', centerPos(), { docId, mode: 'compact', color: 'blue' }),
          'document',
        )
      },
    },
    {
      key: 'sheet',
      label: 'Spreadsheet',
      icon: <IcTable size={16} />,
      onRun: () => {
        const sheetId = useStore.getState().createSheetDoc()
        inserted(
          addCard('sheet', centerPos(), { sheetId, mode: 'compact', color: 'green' }),
          'spreadsheet',
        )
      },
    },
    {
      key: 'presentation',
      label: 'Presentation',
      icon: <IcPresentation size={16} />,
      onRun: () => {
        const presentId = useStore.getState().createPresentDoc()
        inserted(
          addCard('presentation', centerPos(), { presentId, mode: 'compact', color: 'orange' }),
          'presentation',
        )
      },
    },
    {
      key: 'code',
      label: 'Code',
      icon: <IcCode size={16} />,
      onRun: () => {
        const codeId = useStore.getState().createCode()
        inserted(
          addCard('code', centerPos(), { codeId, mode: 'compact', color: 'purple' }),
          'code',
        )
      },
    },
  ]

  // Media — image / video / 3D / photo / link cards
  const mediaItems: ToolMenuItem[] = [
    { key: 'image', label: 'Image', icon: <IcImage size={16} />, onRun: () => imageInput.current?.click() },
    { key: 'video', label: 'Video', icon: <IcVideo size={16} />, onRun: () => insert('video', 'video') },
    { key: 'embed3d', label: '3D', icon: <IcCube size={16} />, onRun: () => insert('embed3d', '3D embed') },
    { key: 'photo', label: 'Photo', icon: <IcCamera size={16} />, onRun: () => insert('photo', 'photo') },
    { key: 'link', label: 'Link', icon: <IcLink size={16} />, onRun: () => insert('link', 'link') },
  ]

  // More — the less-frequent external actions
  const moreItems: ToolMenuItem[] = [
    { key: 'web', label: 'Web embed', icon: <IcGlobe size={16} />, onRun: promptWebEmbed },
    {
      key: 'import',
      label: 'Import',
      icon: <ActionIcon.Import size={16} />,
      onRun: () => importInput.current?.click(),
    },
  ]

  return (
    <div
      className="flex items-center gap-1 rounded-xl border border-bord bg-panel p-1 shadow-lg"
      role="toolbar"
      aria-label="Board tools"
    >
      {/* Structure */}
      <button
        type="button"
        className="flex cursor-pointer flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-muted hover:bg-panel2 hover:text-ink"
        onClick={() => inserted(addSection(centerPos()), 'section')}
        aria-label="Add section"
        title="Add section — a labelled group on the board"
      >
        <IcSection size={16} />
        <span className="text-[10px] font-medium">Section</span>
      </button>

      <ToolbarDivider />

      {/* Creation — also the target of the board's `A` shortcut */}
      <ToolMenu
        groupLabel="Create a card"
        items={createItems}
        defaultKey="note"
        openOnEvent={OPEN_CREATE_MENU_EVENT}
      />
      <ToolMenu groupLabel="Add media" items={mediaItems} defaultKey="image" />

      {/* Annotation */}
      {mayComment && (
        <>
          <ToolbarDivider />
          <button
            type="button"
            className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 ${
              commentMode
                ? 'bg-accent/15 text-accent'
                : 'text-muted hover:bg-panel2 hover:text-ink'
            }`}
            onClick={() => setCommentMode(!commentMode)}
            aria-label="Comment tool — click to pin, drag to mark an area"
            aria-pressed={commentMode}
            title="Comment (C) — click to pin, drag to comment on an area"
          >
            <IcMessage size={16} />
            <span className="text-[10px] font-medium">Comment</span>
          </button>
        </>
      )}

      <ToolbarDivider />

      {/* More */}
      <ToolMenu groupLabel="More — import & embed" items={moreItems} defaultKey="web" />

      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void importAndPlace(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={importInput}
        data-import-input
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void importAndPlace(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
