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

/** Floating Figma-style toolbar for inserting cards at the viewport center. */
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

  const insert = (type: CardType) => addCard(type, centerPos())

  /** All file pickers route through the universal ImportService. */
  const importAndPlace = async (list: FileList | null) => {
    const outcomes = await importFiles(Array.from(list ?? []))
    reportErrors(outcomes)
    for (const outcome of outcomes) {
      const spec = cardSpecFor(outcome)
      if (spec) addCard(spec.type, centerPos(), spec.data, spec.size)
    }
  }

  interface ToolItem {
    key: string
    label: string
    icon: React.ReactNode
    onClick: () => void
    active?: boolean
  }

  // tools grouped by purpose: structure · creation · annotation · external
  const groups: ToolItem[][] = [
    [
      {
        key: 'section',
        label: 'Section',
        icon: <IcSection size={16} />,
        onClick: () => addSection(centerPos()),
      },
    ],
    [
      { key: 'note', label: 'Note', icon: <IcNote size={16} />, onClick: () => insert('note') },
      {
        key: 'richdoc',
        label: 'Doc',
        icon: <IcDoc size={16} />,
        onClick: () => {
          const docId = useStore.getState().createDoc()
          addCard('richdoc', centerPos(), { docId, mode: 'compact', color: 'blue' })
        },
      },
      {
        key: 'sheet',
        label: 'Sheet',
        icon: <IcTable size={16} />,
        onClick: () => {
          const sheetId = useStore.getState().createSheetDoc()
          addCard('sheet', centerPos(), { sheetId, mode: 'compact', color: 'green' })
        },
      },
      {
        key: 'code',
        label: 'Code',
        icon: <IcCode size={16} />,
        onClick: () => {
          const codeId = useStore.getState().createCode()
          addCard('code', centerPos(), { codeId, mode: 'compact', color: 'purple' })
        },
      },
      {
        key: 'presentation',
        label: 'Deck',
        icon: <IcPresentation size={16} />,
        onClick: () => {
          const presentId = useStore.getState().createPresentDoc()
          addCard('presentation', centerPos(), {
            presentId,
            mode: 'compact',
            color: 'orange',
          })
        },
      },
      {
        key: 'image',
        label: 'Image',
        icon: <IcImage size={16} />,
        onClick: () => imageInput.current?.click(),
      },
      { key: 'video', label: 'Video', icon: <IcVideo size={16} />, onClick: () => insert('video') },
      { key: 'link', label: 'Link', icon: <IcLink size={16} />, onClick: () => insert('link') },
      { key: 'embed3d', label: '3D', icon: <IcCube size={16} />, onClick: () => insert('embed3d') },
      {
        key: 'photo',
        label: 'Photo',
        icon: <IcCamera size={16} />,
        onClick: () => insert('photo'),
      },
    ],
    mayComment
      ? [
          {
            key: 'comment',
            label: 'Comment',
            icon: <IcMessage size={16} />,
            onClick: () => setCommentMode(!commentMode),
            active: commentMode,
          },
        ]
      : [],
    [
      {
        key: 'web',
        label: 'Web',
        icon: <IcGlobe size={16} />,
        onClick: () => {
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
          })
        },
      },
      {
        key: 'import',
        label: 'Import',
        icon: <ActionIcon.Import size={16} />,
        onClick: () => importInput.current?.click(),
      },
    ],
  ]
  const visibleGroups = groups.filter((g) => g.length > 0)

  return (
    <div className="flex items-center gap-1 rounded-xl border border-bord bg-panel p-1 shadow-lg">
      {visibleGroups.flatMap((group, gi) => [
        ...(gi > 0 ? [<ToolbarDivider key={`div-${gi}`} />] : []),
        ...group.map((item) => (
        <button
          key={item.key}
          className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 ${
            item.active
              ? 'bg-accent/15 text-accent'
              : 'text-muted hover:bg-panel2 hover:text-ink'
          }`}
          onClick={item.onClick}
          aria-label={
            item.key === 'comment'
              ? 'Comment tool — click to pin, drag to mark an area'
              : `Add ${item.label.toLowerCase()} card`
          }
          aria-pressed={item.key === 'comment' ? !!item.active : undefined}
          title={
            item.key === 'import'
              ? 'Import any file — PDF, Office, media, 3D…'
              : item.key === 'comment'
                ? 'Comment (C) — click to pin, drag to comment on an area'
                : `Add ${item.label.toLowerCase()} card`
          }
        >
          {item.icon}
          <span className="text-[10px] font-medium">{item.label}</span>
        </button>
        )),
      ])}
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
