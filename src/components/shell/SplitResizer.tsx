import { useRef } from 'react'
import type { SplitDirection } from '@/types/workspace'
import { clampRatio } from '@/store/workspaceLayoutStore'

/**
 * Draggable divider between the two workspace panes. Pointer-drag resizes; the
 * separator is also keyboard-operable (a `role="separator"` with arrow keys and
 * Home to recentre) so the split ratio is reachable without a mouse.
 */
export function SplitResizer({
  direction,
  ratio,
  onRatio,
}: {
  direction: SplitDirection
  ratio: number
  onRatio: (ratio: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const horizontal = direction === 'horizontal'

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    const parent = ref.current?.parentElement
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    const move = (ev: PointerEvent) => {
      const r = horizontal
        ? (ev.clientX - rect.left) / rect.width
        : (ev.clientY - rect.top) / rect.height
      onRatio(clampRatio(r))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = 0.02
    const back = horizontal ? 'ArrowLeft' : 'ArrowUp'
    const fwd = horizontal ? 'ArrowRight' : 'ArrowDown'
    if (e.key === back) {
      e.preventDefault()
      onRatio(clampRatio(ratio - step))
    } else if (e.key === fwd) {
      e.preventDefault()
      onRatio(clampRatio(ratio + step))
    } else if (e.key === 'Home') {
      e.preventDefault()
      onRatio(0.5)
    }
  }

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      aria-label="Resize panes"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={20}
      aria-valuemax={80}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={`group flex flex-none items-center justify-center bg-bord/40 hover:bg-accent/30 focus-visible:bg-accent/40 focus-visible:outline-none ${
        horizontal ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize'
      }`}
    >
      <span
        aria-hidden
        className={`rounded-full bg-bord group-hover:bg-accent ${
          horizontal ? 'h-8 w-0.5' : 'h-0.5 w-8'
        }`}
      />
    </div>
  )
}
