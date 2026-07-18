import { useEffect, useRef, useState } from 'react'
import { IcChevronDown } from '@/components/Icons'

export interface ToolMenuItem {
  key: string
  label: string
  icon: React.ReactNode
  onRun: () => void
  shortcut?: string
}

/**
 * A Figma-style split control for the board toolbar: the main button repeats
 * the last-used tool in its family, and the chevron opens an accessible menu of
 * the alternatives. Single shared implementation — the toolbar groups reuse it
 * instead of each shipping their own popover. Keyboard-first: the menu is a
 * roving `role="menu"` (arrows, Home/End, Escape returns focus to the trigger).
 */
export function ToolMenu({
  items,
  groupLabel,
  defaultKey,
}: {
  items: ToolMenuItem[]
  groupLabel: string
  defaultKey?: string
}) {
  const [activeKey, setActiveKey] = useState(defaultKey ?? items[0]?.key)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const chevronRef = useRef<HTMLButtonElement>(null)
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([])
  const active = items.find((i) => i.key === activeKey) ?? items[0]

  useEffect(() => {
    if (open) requestAnimationFrame(() => itemsRef.current[0]?.focus())
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  if (!active) return null

  const close = (focusTrigger = true) => {
    setOpen(false)
    if (focusTrigger) requestAnimationFrame(() => chevronRef.current?.focus())
  }

  const run = (item: ToolMenuItem) => {
    setActiveKey(item.key)
    setOpen(false)
    item.onRun()
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

  return (
    <div className="relative flex items-stretch" ref={rootRef}>
      <button
        type="button"
        className="flex cursor-pointer flex-col items-center gap-0.5 rounded-l-lg px-3 py-1.5 text-muted hover:bg-panel2 hover:text-ink"
        onClick={() => run(active)}
        aria-label={`Add ${active.label.toLowerCase()}`}
        title={`Add ${active.label.toLowerCase()}${active.shortcut ? ` (${active.shortcut})` : ''}`}
      >
        {active.icon}
        <span className="text-[10px] font-medium">{active.label}</span>
      </button>
      <button
        ref={chevronRef}
        type="button"
        className="flex cursor-pointer items-center rounded-r-lg px-1 text-muted hover:bg-panel2 hover:text-ink"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${groupLabel} — show all tools`}
        title={`${groupLabel}`}
        onClick={() => setOpen((v) => !v)}
      >
        <IcChevronDown size={11} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={groupLabel}
          className="absolute bottom-full left-0 z-50 mb-2 w-48 rounded-xl border border-bord bg-panel p-1 shadow-xl"
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
              onClick={() => run(item)}
              onKeyDown={(e) => onItemKeyDown(e, i)}
            >
              <span className="flex-none text-muted">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.shortcut && (
                <kbd className="flex-none text-[10px] text-muted">{item.shortcut}</kbd>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
