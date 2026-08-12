import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Presentation state for the call island only — never the call session itself,
 * which lives in <CallProvider> with the LiveKit room. Keeping the two apart
 * means a re-render of the island can never disturb a live connection.
 *
 * The island has two shapes:
 *  - **docked**, the compact bar in the corner with an optional filmstrip;
 *  - **floating**, a free window the user drags anywhere and resizes from any
 *    edge. That is the answer to "right-click a tile → picture in picture",
 *    which only ever pops out ONE video element, leaves the workspace, and is
 *    reachable only by people who know the browser has that context menu.
 *
 * Geometry is in LAYOUT px — the units the inline `left/top/width/height` are
 * written in. The interface is scaled with `zoom` (UI size, 14.3), so pointer
 * coordinates are NOT in those units; `viewport()` in CallWindow.tsx converts.
 */

export type CallWindowMode = 'docked' | 'floating'

export interface CallRect {
  x: number
  y: number
  w: number
  h: number
}

/** The bounds the free window is kept inside, in layout px. */
export interface Viewport {
  width: number
  height: number
}

/** Which edges a resize drags: a vertical edge, a horizontal one, or a corner. */
export type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/**
 * Never smaller than its own bar. The width is the binding constraint: the bar
 * carries the media controls at their real size and they do not shrink, so a
 * narrower window would clip the dock button off the end. Measured at ~319px
 * with the speaking name fully truncated; the rest is slack for wider fonts.
 */
export const MIN_CALL_W = 330
export const MIN_CALL_H = 160
/** What undocking opens at when there is nothing to grow out of. */
export const DEFAULT_CALL_W = 380
export const DEFAULT_CALL_H = 300
/** The inset the docked island already uses (`right-3 bottom-3`). */
const MARGIN = 12

const num = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback

/** `max` is allowed to be below `min` (a viewport smaller than the window). */
const between = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max))

/** Keep the whole window on screen and above its minimum size. */
export function clampCallRect(rect: CallRect, vp: Viewport): CallRect {
  const w = Math.round(between(num(rect.w, DEFAULT_CALL_W), MIN_CALL_W, vp.width))
  const h = Math.round(between(num(rect.h, DEFAULT_CALL_H), MIN_CALL_H, vp.height))
  return {
    w,
    h,
    x: Math.round(between(num(rect.x, 0), 0, vp.width - w)),
    y: Math.round(between(num(rect.y, 0), 0, vp.height - h)),
  }
}

/**
 * Apply a pointer delta to the edges `dir` names. The edges NOT being dragged
 * stay exactly where they are — which is why the west and north cases move the
 * origin and derive the size from the pinned far edge, rather than the other
 * way round.
 */
export function resizeCallRect(
  start: CallRect,
  dir: ResizeDir,
  dx: number,
  dy: number,
  vp: Viewport,
): CallRect {
  const right = start.x + start.w
  const bottom = start.y + start.h
  const next = { ...start }

  if (dir.includes('e')) next.w = between(start.w + dx, MIN_CALL_W, vp.width - start.x)
  if (dir.includes('s')) next.h = between(start.h + dy, MIN_CALL_H, vp.height - start.y)
  if (dir.includes('w')) {
    next.x = between(start.x + dx, 0, right - MIN_CALL_W)
    next.w = right - next.x
  }
  if (dir.includes('n')) {
    next.y = between(start.y + dy, 0, bottom - MIN_CALL_H)
    next.h = bottom - next.y
  }

  return clampCallRect(next, vp)
}

/** Bottom-right, at the same inset as the docked island. */
export function defaultCallRect(vp: Viewport): CallRect {
  return clampCallRect(
    {
      x: vp.width - DEFAULT_CALL_W - MARGIN,
      y: vp.height - DEFAULT_CALL_H - MARGIN,
      w: DEFAULT_CALL_W,
      h: DEFAULT_CALL_H,
    },
    vp,
  )
}

/**
 * The window undocking opens at. It grows out of the island's own bottom-right
 * corner, so the bar the user just clicked stays under the pointer instead of
 * jumping across the screen.
 */
export function floatingRectFrom(docked: CallRect | null, vp: Viewport): CallRect {
  if (!docked) return defaultCallRect(vp)
  const w = Math.max(docked.w, DEFAULT_CALL_W)
  const h = Math.max(docked.h, DEFAULT_CALL_H)
  return clampCallRect({ x: docked.x + docked.w - w, y: docked.y + docked.h - h, w, h }, vp)
}

interface CallUiState {
  /** expanded shows the participant filmstrip; collapsed is the compact bar */
  expanded: boolean
  setExpanded: (expanded: boolean) => void
  toggleExpanded: () => void

  /** docked in the corner, or a free window the user placed themselves */
  mode: CallWindowMode
  /** where that free window is; kept while docked so undocking returns to it */
  rect: CallRect
  /** callers pass an already-clamped rect — the viewport lives in the view */
  float: (rect: CallRect) => void
  dock: () => void
  setRect: (rect: CallRect) => void
}

export const useCallUiStore = create<CallUiState>()(
  persist(
    (set) => ({
      expanded: false,
      setExpanded: (expanded) => set({ expanded }),
      toggleExpanded: () => set((s) => ({ expanded: !s.expanded })),

      mode: 'docked',
      rect: { x: 0, y: 0, w: DEFAULT_CALL_W, h: DEFAULT_CALL_H },
      float: (rect) => set({ mode: 'floating', rect }),
      dock: () => set({ mode: 'docked' }),
      setRect: (rect) => set({ rect }),
    }),
    {
      name: 'lattice-call-ui',
      version: 1,
      partialize: (s) => ({ expanded: s.expanded, mode: s.mode, rect: s.rect }),
    },
  ),
)
