import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

/**
 * A popover anchored under a trigger, rendered into `document.body`.
 *
 * The portal is the whole point, and it exists because of one line in
 * TopBar: the bar carries `overflow-x-auto` as a safety net so a bar that
 * outgrows its box scrolls instead of pushing the document sideways. CSS
 * does not let that stay one-dimensional — with either axis set to
 * something other than `visible`, a computed `visible` on the OTHER axis
 * becomes `auto`. So the bar is also a *vertical* scroll container, 43 px
 * tall, and every `absolute` panel anchored inside it was being clipped to
 * a ~1 px sliver: the markup was there, the state was right, nothing was on
 * screen. That is what "the notification overlay doesn't work" was.
 *
 * Fixing the symptom by deleting `overflow-x-auto` would put the bar's
 * overflow bug back. So the panels leave the bar instead: `position: fixed`
 * in a body portal is clipped by no ancestor's overflow, and the position
 * is measured from the trigger rather than inherited from it.
 *
 * Stays at z-50 — above page content, deliberately BELOW the modal tiers
 * (settings 60, dialogs 70, confirm 80, toasts 90), which is the ordering
 * it had while it was still nested in the bar.
 */

/** Breathing room from the trigger, and from the viewport edges. */
const GAP = 6
const GUTTER = 8

/**
 * Open panels, in the order they opened, so only the top one reacts to an
 * outside click or Escape.
 *
 * This matters because these popovers nest: below the `full` tier the top
 * bar folds its status cluster into the "···" menu, so the notification
 * bell ends up rendering INSIDE the overflow popover. While both panels
 * were `absolute`, the notification panel was a DOM descendant of the
 * overflow panel and a plain `contains()` check was enough. Portalled, they
 * are siblings under `<body>` — `contains()` says a click inside the
 * notification panel is "outside" the overflow menu, which would close the
 * overflow, unmount the bell, and take the panel the user just clicked
 * with it.
 *
 * Topmost-only also gives the conventional nested-menu behaviour: one
 * outside click (or one Escape) peels one layer.
 */
const layers: HTMLElement[] = []

interface Position {
  top: number
  right: number
  maxHeight: number
}

function measure(anchor: HTMLElement): Position {
  const r = anchor.getBoundingClientRect()
  const top = r.bottom + GAP
  return {
    top,
    // right-aligned to the trigger, never past the left edge of the screen
    right: Math.max(GUTTER, window.innerWidth - r.right),
    // a panel that would run off the bottom scrolls internally instead
    maxHeight: Math.max(120, window.innerHeight - top - GUTTER),
  }
}

export function AnchoredPopover({
  anchorRef,
  open,
  onClose,
  className = '',
  role,
  label,
  children,
}: {
  /** The trigger. Its rect positions the panel, and clicks on it are not "outside". */
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  /** Surface styling — width, layout, anything but position. */
  className?: string
  role?: string
  label?: string
  children: ReactNode
}) {
  const [panel, setPanel] = useState<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<Position | null>(null)

  const reposition = useCallback(() => {
    if (anchorRef.current) setPos(measure(anchorRef.current))
  }, [anchorRef])

  // measured before paint, so the panel never flashes at the wrong corner
  useLayoutEffect(() => {
    if (open) reposition()
    else setPos(null)
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    // capture: the trigger may sit inside something scrollable (the bar
    // itself is, which is the reason this component exists)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, reposition])

  // register as the top layer for as long as this panel is mounted
  useEffect(() => {
    if (!panel) return
    layers.push(panel)
    return () => {
      const i = layers.indexOf(panel)
      if (i !== -1) layers.splice(i, 1)
    }
  }, [panel])

  useEffect(() => {
    if (!open || !panel) return
    const isTopLayer = () => layers[layers.length - 1] === panel
    const onDown = (e: MouseEvent) => {
      if (!isTopLayer()) return
      const target = e.target as Node
      // the trigger is excluded so its own onClick still toggles, rather
      // than this closing first and the click re-opening
      if (panel.contains(target) || anchorRef.current?.contains(target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopLayer()) onClose()
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, panel, anchorRef])

  if (!open || !pos) return null

  return createPortal(
    <div
      ref={setPanel}
      role={role}
      aria-label={label}
      className={`fixed z-50 rounded-xl border border-bord bg-panel shadow-xl ${className}`}
      style={{ top: pos.top, right: pos.right, maxHeight: pos.maxHeight }}
    >
      {children}
    </div>,
    document.body,
  )
}
