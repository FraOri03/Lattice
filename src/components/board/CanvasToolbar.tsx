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
import { useI18n } from '@/lib/i18n'
import {
  ToolbarAction,
  ToolbarGroup,
  ToolbarRoot,
  ToolbarSeparator,
  ToolbarSplitButton,
  ToolbarToggle,
  type ToolbarMenuItem,
} from '@/components/ui/toolbar'
import { announceCardInserted, OPEN_CREATE_MENU_EVENT } from './boardToolEvents'

/**
 * Figma-style board toolbar: the real, existing tools grouped by operating
 * category. Categories that this product does not have (drawing/pen, shapes,
 * frames, groups, a dev/inspect mode) are intentionally NOT invented here — a
 * menu only ever offers tools that actually work. Each family is a compact
 * split menu (see ToolMenu) so the bar stays short.
 */
export function CanvasToolbar() {
  const t = useI18n()
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

  /** Every menu item's tooltip is "Add <thing>", localised in one place. */
  const item = (
    id: string,
    label: string,
    icon: React.ReactNode,
    run: () => void,
  ): ToolbarMenuItem => ({
    id,
    label,
    description: t.toolbar.board.addTool(label),
    icon,
    run,
  })

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
  const createItems: ToolbarMenuItem[] = [
    item('note', t.toolbar.board.note, <IcNote size={16} />, () => insert('note', 'note')),
    item('richdoc', t.toolbar.board.document, <IcDoc size={16} />, () => {
      const docId = useStore.getState().createDoc()
      inserted(
        addCard('richdoc', centerPos(), { docId, mode: 'compact', color: 'blue' }),
        'document',
      )
    }),
    item('sheet', t.toolbar.board.spreadsheet, <IcTable size={16} />, () => {
      const sheetId = useStore.getState().createSheetDoc()
      inserted(
        addCard('sheet', centerPos(), { sheetId, mode: 'compact', color: 'green' }),
        'spreadsheet',
      )
    }),
    item('presentation', t.toolbar.board.presentation, <IcPresentation size={16} />, () => {
      const presentId = useStore.getState().createPresentDoc()
      inserted(
        addCard('presentation', centerPos(), { presentId, mode: 'compact', color: 'orange' }),
        'presentation',
      )
    }),
    item('code', t.toolbar.board.code, <IcCode size={16} />, () => {
      const codeId = useStore.getState().createCode()
      inserted(
        addCard('code', centerPos(), { codeId, mode: 'compact', color: 'purple' }),
        'code',
      )
    }),
  ]

  // Media — image / video / 3D / photo / link cards
  const mediaItems: ToolbarMenuItem[] = [
    item('image', t.toolbar.board.image, <IcImage size={16} />, () =>
      imageInput.current?.click(),
    ),
    item('video', t.toolbar.board.video, <IcVideo size={16} />, () =>
      insert('video', 'video'),
    ),
    item('embed3d', t.toolbar.board.threeD, <IcCube size={16} />, () =>
      insert('embed3d', '3D embed'),
    ),
    item('photo', t.toolbar.board.photo, <IcCamera size={16} />, () =>
      insert('photo', 'photo'),
    ),
    item('link', t.toolbar.board.link, <IcLink size={16} />, () => insert('link', 'link')),
  ]

  // More — the less-frequent external actions
  const moreItems: ToolbarMenuItem[] = [
    item('web', t.toolbar.board.webEmbed, <IcGlobe size={16} />, promptWebEmbed),
    item('import', t.toolbar.board.import, <ActionIcon.Import size={16} />, () =>
      importInput.current?.click(),
    ),
  ]

  return (
    <ToolbarRoot
      label={t.toolbar.board.label}
      content="icon-label"
      // w-max: the pill sizes to its tools. React Flow's centred panel is
      // shrink-to-fit and would otherwise cap the bar below its content — with
      // longer labels (Italian) the last split painted outside the background.
      className="w-max gap-1 rounded-xl border border-bord bg-panel p-1 shadow-lg"
    >
      {/* Structure */}
      <ToolbarGroup label={t.toolbar.groups.create}>
        <ToolbarAction
          icon={<IcSection size={16} />}
          label={t.toolbar.board.section}
          description={t.toolbar.board.sectionTip}
          onRun={() => inserted(addSection(centerPos()), 'section')}
        />

        <ToolbarSeparator />

        {/* Creation — also the target of the board's `A` shortcut */}
        <ToolbarSplitButton
          menuLabel={t.toolbar.board.openCardTools}
          items={createItems}
          defaultItemId="note"
          openOnEvent={OPEN_CREATE_MENU_EVENT}
        />
        <ToolbarSplitButton
          menuLabel={t.toolbar.board.openMediaTools}
          items={mediaItems}
          defaultItemId="image"
        />
      </ToolbarGroup>

      {/* Annotation */}
      {mayComment && (
        <>
          <ToolbarSeparator />
          <ToolbarGroup label={t.toolbar.groups.annotate}>
            <ToolbarToggle
              icon={<IcMessage size={16} />}
              label={t.toolbar.board.comment}
              description={t.toolbar.board.commentTip}
              shortcut="C"
              pressed={commentMode}
              onRun={() => setCommentMode(!commentMode)}
            />
          </ToolbarGroup>
        </>
      )}

      <ToolbarSeparator />

      {/* More */}
      <ToolbarGroup label={t.toolbar.groups.integrate}>
        <ToolbarSplitButton
          menuLabel={t.toolbar.board.openImportTools}
          items={moreItems}
          defaultItemId="web"
        />
      </ToolbarGroup>

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
    </ToolbarRoot>
  )
}
