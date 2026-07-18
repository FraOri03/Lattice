import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { useWorkspaceLayoutStore } from '@/store/workspaceLayoutStore'
import {
  SECTION_METAS,
  viewModeToSection,
  type WorkspaceSection,
} from '@/types/workspace'
import {
  IcBoard,
  IcCamera,
  IcCheck,
  IcChevronDown,
  IcCode,
  IcDoc,
  IcPresentation,
  IcTable,
} from '@/components/Icons'

const SECTION_ICONS: Record<WorkspaceSection, React.ReactNode> = {
  board: <IcBoard size={14} />,
  document: <IcDoc size={14} />,
  spreadsheet: <IcTable size={14} />,
  presentation: <IcPresentation size={14} />,
  code: <IcCode size={14} />,
  photo: <IcCamera size={14} />,
}

/**
 * SectionSwitcher — a single compact button showing the current section, with a
 * dropdown to switch between all of them. Replaces the old row of always-visible
 * mode tabs and, crucially, no longer lists Split (a layout) or Graph (a view):
 * those live in the ViewModeIsland. Keyboard-first (a roving `role="menu"`), the
 * same accessible-menu idiom used elsewhere in the app.
 */
export function SectionSwitcher() {
  const viewMode = useStore((s) => s.viewMode)
  const setViewMode = useStore((s) => s.setViewMode)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([])

  // Graph is a VIEW layered over a section, so while it is on screen the
  // switcher keeps naming the section underneath it.
  const graphReturnMode = useWorkspaceLayoutStore((s) => s.graphReturnMode)
  const activeSection: WorkspaceSection =
    viewModeToSection(viewMode) ?? viewModeToSection(graphReturnMode) ?? 'board'
  const current =
    SECTION_METAS.find((m) => m.section === activeSection) ?? SECTION_METAS[0]

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

  const close = (focusTrigger = true) => {
    setOpen(false)
    if (focusTrigger) requestAnimationFrame(() => buttonRef.current?.focus())
  }

  const choose = (mode: (typeof SECTION_METAS)[number]['mode']) => {
    setOpen(false)
    setViewMode(mode)
    requestAnimationFrame(() => buttonRef.current?.focus())
  }

  const onItemKeyDown = (e: React.KeyboardEvent, index: number) => {
    const last = SECTION_METAS.length - 1
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
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-bord bg-panel2 px-2.5 py-1 text-xs font-medium text-ink hover:bg-panel"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Section: ${current.label}. Change section`}
        title="Switch section"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-muted">{SECTION_ICONS[current.section]}</span>
        <span>{current.label}</span>
        <IcChevronDown size={11} className="text-muted" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Sections"
          className="absolute top-9 left-0 z-50 w-52 rounded-xl border border-bord bg-panel p-1 shadow-xl"
        >
          {SECTION_METAS.map((m, i) => {
            const isActive = m.section === activeSection && viewMode !== 'graph'
            return (
              <button
                key={m.section}
                ref={(el) => {
                  itemsRef.current[i] = el
                }}
                role="menuitemradio"
                aria-checked={isActive}
                tabIndex={-1}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-muted hover:bg-panel2 hover:text-ink focus:bg-panel2 focus:text-ink focus:outline-none"
                onClick={() => choose(m.mode)}
                onKeyDown={(e) => onItemKeyDown(e, i)}
              >
                <span className="flex-none text-muted">{SECTION_ICONS[m.section]}</span>
                <span className="flex-1">{m.label}</span>
                {isActive && <IcCheck size={13} className="flex-none text-accent" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
