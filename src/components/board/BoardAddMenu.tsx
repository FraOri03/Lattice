import { useEffect, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { CardType } from '@/types/model'
import { useStore } from '@/store/useStore'
import { toast } from '@/components/ui/Toaster'
import { promptDialog } from '@/components/ui/ConfirmDialog'
import {
  IcCode,
  IcCube,
  IcDoc,
  IcGlobe,
  IcImage,
  IcLink,
  IcNote,
  IcPlus,
  IcPresentation,
  IcSection,
  IcTable,
  IcVideo,
} from '@/components/Icons'

/**
 * Keyboard-first "Add card" menu (A11Y-1). Every insert is reachable with
 * the keyboard: the trigger is a normal focusable button, the popover is a
 * roving `role="menu"` (Up/Down/Home/End, Enter/Space to activate, Escape
 * to close). It is also opened by the board's `A` shortcut. New cards are
 * placed at the viewport centre and handed back to the caller so it can
 * move focus onto them.
 */

interface AddItem {
  key: string
  label: string
  icon: React.ReactNode
  /** returns the new card id (for focusing), or null when nothing was added */
  run: () => string | null | Promise<string | null>
}

export function BoardAddMenu({
  open,
  onOpenChange,
  onInserted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInserted: (id: string, label: string) => void
}) {
  const { screenToFlowPosition } = useReactFlow()
  const addCard = useStore((s) => s.addCard)
  const addSection = useStore((s) => s.addSection)
  const addWebEmbedCard = useStore((s) => s.addWebEmbedCard)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([])

  const centerPos = () => {
    const p = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    })
    return { x: p.x - 150, y: p.y - 100 }
  }
  const insert = (type: CardType) => addCard(type, centerPos())

  const items: AddItem[] = [
    { key: 'section', label: 'Section', icon: <IcSection size={14} />, run: () => addSection(centerPos()) },
    { key: 'note', label: 'Note', icon: <IcNote size={14} />, run: () => insert('note') },
    {
      key: 'richdoc',
      label: 'Document',
      icon: <IcDoc size={14} />,
      run: () => {
        const docId = useStore.getState().createDoc()
        return addCard('richdoc', centerPos(), { docId, mode: 'compact', color: 'blue' })
      },
    },
    {
      key: 'sheet',
      label: 'Spreadsheet',
      icon: <IcTable size={14} />,
      run: () => {
        const sheetId = useStore.getState().createSheetDoc()
        return addCard('sheet', centerPos(), { sheetId, mode: 'compact', color: 'green' })
      },
    },
    {
      key: 'code',
      label: 'Code file',
      icon: <IcCode size={14} />,
      run: () => {
        const codeId = useStore.getState().createCode()
        return addCard('code', centerPos(), { codeId, mode: 'compact', color: 'purple' })
      },
    },
    {
      key: 'presentation',
      label: 'Presentation',
      icon: <IcPresentation size={14} />,
      run: () => {
        const presentId = useStore.getState().createPresentDoc()
        return addCard('presentation', centerPos(), {
          presentId,
          mode: 'compact',
          color: 'orange',
        })
      },
    },
    { key: 'image', label: 'Image', icon: <IcImage size={14} />, run: () => insert('image') },
    { key: 'video', label: 'Video', icon: <IcVideo size={14} />, run: () => insert('video') },
    { key: 'link', label: 'Link', icon: <IcLink size={14} />, run: () => insert('link') },
    { key: 'embed3d', label: '3D embed', icon: <IcCube size={14} />, run: () => insert('embed3d') },
    {
      key: 'webembed',
      label: 'Web embed',
      icon: <IcGlobe size={14} />,
      run: async () => {
        const url = await promptDialog({
          title: 'Embed a webpage',
          body: 'Only http(s) URLs are allowed. Sites that refuse framing fall back to a link preview.',
          label: 'URL',
          placeholder: 'https://…',
          confirmLabel: 'Embed',
        })
        if (!url) return null
        const res = addWebEmbedCard(url, centerPos())
        if (!res.cardId) toast.error('Could not embed that URL', res.reason)
        return res.cardId
      },
    },
  ]

  // Move focus onto the first item when the menu opens.
  useEffect(() => {
    if (open) requestAnimationFrame(() => itemsRef.current[0]?.focus())
  }, [open])

  const close = (focusTrigger = true) => {
    onOpenChange(false)
    if (focusTrigger) requestAnimationFrame(() => buttonRef.current?.focus())
  }

  const activate = async (item: AddItem) => {
    onOpenChange(false)
    const id = await item.run()
    if (id) onInserted(id, item.label.toLowerCase())
  }

  const onItemKeyDown = (e: React.KeyboardEvent, index: number) => {
    const last = items.length - 1
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      itemsRef.current[index === last ? 0 : index + 1]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      itemsRef.current[index === 0 ? last : index - 1]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      itemsRef.current[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      itemsRef.current[last]?.focus()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  // Close on outside click.
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, onOpenChange])

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        className="btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add card to board"
        title="Add card (A)"
        onClick={() => onOpenChange(!open)}
      >
        <IcPlus size={13} /> Add card
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Add card"
          className="absolute bottom-11 left-0 z-50 max-h-[60vh] w-48 overflow-y-auto rounded-xl border border-bord bg-panel p-1 shadow-xl"
        >
          {items.map((item, i) => (
            <button
              key={item.key}
              ref={(el) => {
                itemsRef.current[i] = el
              }}
              role="menuitem"
              tabIndex={-1}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-muted hover:bg-panel2 hover:text-ink focus:bg-panel2 focus:text-ink focus:outline-none"
              onClick={() => void activate(item)}
              onKeyDown={(e) => onItemKeyDown(e, i)}
            >
              <span className="flex-none text-muted">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
