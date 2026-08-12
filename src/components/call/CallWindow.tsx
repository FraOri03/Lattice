import { useEffect, type ReactNode } from 'react'
import {
  clampCallRect,
  resizeCallRect,
  useCallUiStore,
  type CallRect,
  type ResizeDir,
  type Viewport,
} from '@/store/callUiStore'
import { IcGrip, IcMove } from '@/components/Icons'

/**
 * The free call window: a bar you drag to move, eight edges you drag to resize.
 *
 * Everything a pointer can do here a keyboard can do too (WCAG 2.5.7): the
 * grip in the bar moves the window with the arrow keys, the corner grip resizes
 * with them, and Shift makes either one fine-grained.
 */

/** Arrow-key steps, in layout px. */
const STEP = 24
const FINE_STEP = 6

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/**
 * The interface is scaled by `zoom` on <body> (UI size, 14.3). Inline `left`
 * and `width` are in layout px and get multiplied by that zoom on the way to
 * the screen, while `clientX` and `getBoundingClientRect()` are already in
 * scaled px — so every pointer delta and every viewport bound is divided by
 * this factor to put both sides of the arithmetic in the same units. It is the
 * same mismatch the board sidesteps by cancelling the zoom on its canvas.
 */
function uiScale(): number {
  const factor = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'),
  )
  return Number.isFinite(factor) && factor > 0 ? factor : 1
}

/** The screen, in the layout px the window's geometry is written in. */
export function viewport(): Viewport {
  const scale = uiScale()
  return { width: window.innerWidth / scale, height: window.innerHeight / scale }
}

/** An element's box, in those same units. */
export function rectOf(el: Element): CallRect {
  const scale = uiScale()
  const r = el.getBoundingClientRect()
  return { x: r.left / scale, y: r.top / scale, w: r.width / scale, h: r.height / scale }
}

/** Edge and corner hit areas. The bottom-right one is a focusable button. */
const HANDLES: { dir: ResizeDir; className: string }[] = [
  { dir: 'n', className: 'top-0 right-3 left-3 h-1.5 cursor-ns-resize' },
  { dir: 's', className: 'bottom-0 right-3 left-3 h-1.5 cursor-ns-resize' },
  { dir: 'w', className: 'top-3 bottom-3 left-0 w-1.5 cursor-ew-resize' },
  { dir: 'e', className: 'top-3 bottom-3 right-0 w-1.5 cursor-ew-resize' },
  { dir: 'nw', className: 'top-0 left-0 h-3 w-3 cursor-nwse-resize' },
  { dir: 'ne', className: 'top-0 right-0 h-3 w-3 cursor-nesw-resize' },
  { dir: 'sw', className: 'bottom-0 left-0 h-3 w-3 cursor-nesw-resize' },
]

export function CallWindow({ bar, children }: { bar: ReactNode; children: ReactNode }) {
  const rect = useCallUiStore((s) => s.rect)
  const setRect = useCallUiStore((s) => s.setRect)

  // A viewport that shrank (a smaller screen, a rotated tablet, a restored
  // window) must not leave the call somewhere the user cannot reach it. This
  // also re-fits the geometry that came back from localStorage.
  useEffect(() => {
    const fit = () => setRect(clampCallRect(useCallUiStore.getState().rect, viewport()))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [setRect])

  /** Follow the pointer until it is released, in layout px. */
  const track = (
    e: React.PointerEvent,
    apply: (dx: number, dy: number, start: CallRect, vp: Viewport) => CallRect,
  ) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).focus?.()
    const scale = uiScale()
    const start = useCallUiStore.getState().rect
    const vp = viewport()
    const originX = e.clientX
    const originY = e.clientY

    const move = (ev: PointerEvent) =>
      setRect(apply((ev.clientX - originX) / scale, (ev.clientY - originY) / scale, start, vp))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const startMove = (e: React.PointerEvent) =>
    track(e, (dx, dy, start, vp) =>
      clampCallRect({ ...start, x: start.x + dx, y: start.y + dy }, vp),
    )

  const startResize = (dir: ResizeDir) => (e: React.PointerEvent) => {
    e.stopPropagation()
    track(e, (dx, dy, start, vp) => resizeCallRect(start, dir, dx, dy, vp))
  }

  /** The bar is draggable, but a control inside it is a control first. */
  const onBarPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button,a,input,select,[role="menu"]')) return
    startMove(e)
  }

  const onKey =
    (apply: (dx: number, dy: number, vp: Viewport) => CallRect) =>
    (e: React.KeyboardEvent) => {
      const arrow = ARROWS[e.key]
      if (!arrow) return
      e.preventDefault()
      const step = e.shiftKey ? FINE_STEP : STEP
      setRect(apply(arrow[0] * step, arrow[1] * step, viewport()))
    }

  return (
    <aside
      role="region"
      aria-label="Project call window"
      className="pointer-events-auto fixed z-40 flex flex-col overflow-hidden rounded-xl border border-bord bg-panel/95 shadow-2xl backdrop-blur"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <div
        onPointerDown={onBarPointerDown}
        className="flex h-[52px] flex-none touch-none cursor-grab items-center gap-2 border-b border-bord px-2 select-none active:cursor-grabbing"
      >
        <button
          type="button"
          onPointerDown={startMove}
          onKeyDown={onKey((dx, dy, vp) => {
            const r = useCallUiStore.getState().rect
            return clampCallRect({ ...r, x: r.x + dx, y: r.y + dy }, vp)
          })}
          aria-label="Move the call window — drag it, or use the arrow keys"
          title="Drag to move (arrow keys also work)"
          className="flex flex-none cursor-grab touch-none items-center justify-center rounded-md px-1 py-1.5 text-muted hover:bg-panel2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none active:cursor-grabbing"
        >
          <IcMove size={13} />
        </button>
        {bar}
      </div>

      <div className="min-h-0 flex-1">{children}</div>

      {HANDLES.map((h) => (
        <div
          key={h.dir}
          aria-hidden
          onPointerDown={startResize(h.dir)}
          className={`absolute touch-none ${h.className}`}
        />
      ))}
      <button
        type="button"
        onPointerDown={startResize('se')}
        onKeyDown={onKey((dx, dy, vp) =>
          resizeCallRect(useCallUiStore.getState().rect, 'se', dx, dy, vp),
        )}
        aria-label="Resize the call window — drag it, or use the arrow keys"
        title="Drag to resize (arrow keys also work)"
        className="absolute right-0 bottom-0 flex h-4 w-4 cursor-nwse-resize touch-none items-center justify-center rounded-tl-md text-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <IcGrip size={11} />
      </button>
    </aside>
  )
}
