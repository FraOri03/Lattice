import { useEffect, useRef } from 'react'
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
  ToolbarOverflow,
  ToolbarRoot,
  ToolbarSeparator,
  ToolbarSplitButton,
  ToolbarToggle,
  useToolbarOverflow,
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
  const pillRef = useRef<HTMLDivElement>(null)
  /**
   * The room the bar actually has is the canvas pane's, not its own: the pill
   * is `w-max` inside a shrink-to-fit React Flow panel, so measuring it
   * against itself would find that everything always fits. The pane is not a
   * React child of this component, so it is reached the only way it can be.
   */
  const paneRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    paneRef.current = pillRef.current?.closest<HTMLElement>('.react-flow') ?? null
  }, [])

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

  /**
   * Every menu item's tooltip is "Add <thing>", localised in one place —
   * except where the tooltip has to do real work: Note and Document are
   * both text, so each says what it is FOR instead of restating its name.
   */
  const item = (
    id: string,
    label: string,
    icon: React.ReactNode,
    run: () => void,
    description = t.toolbar.board.addTool(label),
  ): ToolbarMenuItem => ({
    id,
    label,
    description,
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
    item(
      'note',
      t.toolbar.board.note,
      <IcNote size={16} />,
      () => insert('note', 'note'),
      t.textEntities.notePurpose,
    ),
    item(
      'richdoc',
      t.toolbar.board.document,
      <IcDoc size={16} />,
      () => {
        const docId = useStore.getState().createDoc()
        inserted(
          addCard('richdoc', centerPos(), { docId, mode: 'compact', color: 'blue' }),
          'document',
        )
      },
      t.textEntities.documentPurpose,
    ),
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

  // Media — image / video / 3D / photo / link cards, then the two ways of
  // bringing outside content onto the board. Web embed and Import used to be
  // a family of their own; they are here because what they produce is media,
  // and a menu of two was a group the user had to learn separately.
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
    item('web', t.toolbar.board.webEmbed, <IcGlobe size={16} />, promptWebEmbed),
    item('import', t.toolbar.board.import, <ActionIcon.Import size={16} />, () =>
      importInput.current?.click(),
    ),
  ]

  /**
   * The bar in fold order: what leaves first is last in this list (12.4).
   *
   * Deliberate, and this is the reasoning. **Media folds first** — it is the
   * secondary of the two families, and everything in it can also arrive by
   * dropping a file on the canvas. **Create folds next** — it is the primary
   * "add something", and it is also reachable from the `A` shortcut, so losing
   * its button is not losing the tool. **Section stays longest** because it is
   * the cheapest control on the bar (one icon, no menu) and structure is what
   * a crowded board needs most.
   *
   * Comment is not in this list at all: it is a mode, not an insertion, and it
   * is the one thing on this bar that works at every tier. A toggle you have
   * to open a menu to reach is a toggle you stop using.
   *
   * What a folded split button becomes: **its items, flattened into the
   * menu**. The alternative — one menu entry that runs the last-used tool —
   * keeps the split's convenience and loses the other six tools, which is the
   * wrong half to keep. "Repeat the last tool" only means anything on a
   * control you can hit without opening anything, and once it is in a menu
   * that is already gone.
   */
  const foldable: { key: string; control: React.ReactNode; items: ToolbarMenuItem[] }[] = [
    {
      key: 'section',
      control: (
        <ToolbarAction
          icon={<IcSection size={16} />}
          label={t.toolbar.board.section}
          description={t.toolbar.board.sectionTip}
          onRun={() => inserted(addSection(centerPos()), 'section')}
        />
      ),
      items: [
        item(
          'section',
          t.toolbar.board.section,
          <IcSection size={16} />,
          () => inserted(addSection(centerPos()), 'section'),
          t.toolbar.board.sectionTip,
        ),
      ],
    },
    {
      key: 'create',
      control: (
        // also the target of the board's `A` shortcut
        <ToolbarSplitButton
          menuLabel={t.toolbar.board.openCardTools}
          items={createItems}
          defaultItemId="note"
          openOnEvent={OPEN_CREATE_MENU_EVENT}
        />
      ),
      items: createItems,
    },
    {
      key: 'media',
      control: (
        <ToolbarSplitButton
          menuLabel={t.toolbar.board.openMediaTools}
          items={mediaItems}
          defaultItemId="image"
        />
      ),
      items: mediaItems,
    },
  ]

  const visible = useToolbarOverflow(pillRef, foldable.length, 40, paneRef)
  const folded = foldable.slice(visible)

  return (
    <div ref={pillRef}>
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
          {foldable.slice(0, visible).map((tool, i) => (
            <span key={tool.key} className="flex flex-none items-center" data-toolbar-item>
              {/* the separator that used to sit after Section belongs to the
                  seam between it and the families, so it goes when Section
                  does rather than leaving a rule against the pill's edge */}
              {i === 1 && <ToolbarSeparator />}
              {tool.control}
            </span>
          ))}
          {folded.length > 0 && (
            <ToolbarOverflow
              label={t.toolbar.board.moreTools}
              items={folded.flatMap((tool) => tool.items)}
            />
          )}
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
    </div>
  )
}
