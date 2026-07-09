import { useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { CardType } from '@/types/model'
import { useStore } from '@/store/useStore'
import { cardSpecFor, importFiles, reportErrors } from '@/lib/import/ImportService'
import {
  IcCode,
  IcCube,
  IcDoc,
  IcGlobe,
  IcImage,
  IcLink,
  IcNote,
  IcSection,
  IcTable,
  IcUpload,
  IcVideo,
} from '@/components/Icons'

/** Floating Figma-style toolbar for inserting cards at the viewport center. */
export function CanvasToolbar() {
  const { screenToFlowPosition } = useReactFlow()
  const addCard = useStore((s) => s.addCard)
  const addSection = useStore((s) => s.addSection)
  const addWebEmbedCard = useStore((s) => s.addWebEmbedCard)
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

  const items: {
    key: string
    label: string
    icon: React.ReactNode
    onClick: () => void
  }[] = [
    {
      key: 'section',
      label: 'Section',
      icon: <IcSection size={16} />,
      onClick: () => addSection(centerPos()),
    },
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
      key: 'code',
      label: 'Code',
      icon: <IcCode size={16} />,
      onClick: () => {
        const codeId = useStore.getState().createCode()
        addCard('code', centerPos(), { codeId, mode: 'compact', color: 'purple' })
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
      key: 'image',
      label: 'Image',
      icon: <IcImage size={16} />,
      onClick: () => imageInput.current?.click(),
    },
    { key: 'video', label: 'Video', icon: <IcVideo size={16} />, onClick: () => insert('video') },
    {
      key: 'web',
      label: 'Web',
      icon: <IcGlobe size={16} />,
      onClick: () => {
        const url = prompt('Webpage URL to embed', 'https://')
        if (!url) return
        const res = addWebEmbedCard(url, centerPos())
        if (!res.cardId) alert(res.reason)
      },
    },
    { key: 'link', label: 'Link', icon: <IcLink size={16} />, onClick: () => insert('link') },
    { key: 'embed3d', label: '3D', icon: <IcCube size={16} />, onClick: () => insert('embed3d') },
    {
      key: 'import',
      label: 'Import',
      icon: <IcUpload size={16} />,
      onClick: () => importInput.current?.click(),
    },
  ]

  return (
    <div className="flex items-center gap-1 rounded-xl border border-bord bg-panel p-1 shadow-lg">
      {items.map((item) => (
        <button
          key={item.key}
          className="flex cursor-pointer flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-muted hover:bg-panel2 hover:text-ink"
          onClick={item.onClick}
          title={
            item.key === 'import'
              ? 'Import any file — PDF, Office, media, 3D…'
              : `Add ${item.label.toLowerCase()} card`
          }
        >
          {item.icon}
          <span className="text-[10px] font-medium">{item.label}</span>
        </button>
      ))}
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
