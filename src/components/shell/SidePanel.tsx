import { useRef, type ReactNode } from 'react'
import { IcChevronLeft, IcChevronRight } from '@/components/Icons'

/**
 * A docked right-hand panel that the user can narrow, widen or shut.
 *
 * The inspectors sit in the same flex row as their canvas, so their width is
 * taken straight out of the working area — a fixed 280px rail is a quarter of
 * a laptop screen spent on a card that may not even be selected. This gives
 * that width back: drag the left edge to resize, or collapse to a rail that
 * still says what it is and how to get it back.
 *
 * Width and collapsed state belong to the caller (they are persisted in the
 * workspace layout store); this component owns only the chrome around them.
 */
export function SidePanel({
  title,
  width,
  collapsed,
  minWidth,
  maxWidth,
  onWidth,
  onCollapsedChange,
  children,
}: {
  title: string
  width: number
  collapsed: boolean
  minWidth: number
  maxWidth: number
  onWidth: (width: number) => void
  onCollapsedChange: (collapsed: boolean) => void
  children: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)

  if (collapsed) {
    return (
      <aside className="flex w-9 flex-none flex-col items-center gap-2 border-l border-bord bg-panel py-2">
        <button
          className="icon-btn h-7 w-7"
          title={`Show ${title.toLowerCase()}`}
          aria-label={`Show ${title.toLowerCase()}`}
          aria-expanded={false}
          onClick={() => onCollapsedChange(false)}
        >
          <IcChevronLeft size={13} />
        </button>
        {/* the rail keeps naming itself, so a shut panel never reads as a
            stray border the user has to go hunting for */}
        <span
          className="text-[10px] font-semibold tracking-widest text-muted uppercase"
          style={{ writingMode: 'vertical-rl' }}
        >
          {title}
        </span>
      </aside>
    )
  }

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    // measured once: the panel's own right edge is the fixed point the drag
    // is relative to, and re-reading it mid-drag would chase the resize
    const right = ref.current?.getBoundingClientRect().right
    if (right == null) return
    const move = (ev: PointerEvent) => onWidth(right - ev.clientX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 48 : 16
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onWidth(width + step)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      onWidth(width - step)
    }
  }

  return (
    <aside
      ref={ref}
      className="relative flex flex-none flex-col border-l border-bord bg-panel"
      style={{ width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${title.toLowerCase()}`}
        aria-valuenow={width}
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        className="absolute inset-y-0 -left-0.5 z-10 w-1.5 cursor-col-resize hover:bg-accent/30 focus-visible:bg-accent/40 focus-visible:outline-none"
      />
      <header className="flex flex-none items-center gap-1 border-b border-bord py-1.5 pr-1.5 pl-4">
        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold tracking-widest text-muted uppercase">
          {title}
        </span>
        <button
          className="icon-btn h-6 w-6"
          title={`Hide ${title.toLowerCase()}`}
          aria-label={`Hide ${title.toLowerCase()}`}
          aria-expanded
          onClick={() => onCollapsedChange(true)}
        >
          <IcChevronRight size={13} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">{children}</div>
    </aside>
  )
}
