import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IcChevronLeft, IcChevronRight, IcX } from '@/components/Icons'
import { panelsAreDocked } from '@/lib/layout/tiers'
import { useViewportTier } from '@/lib/layout/useViewportTier'

/**
 * A panel of the shell's chrome that the user can narrow, widen or shut — and
 * that stops being docked at all where there is no room for it.
 *
 * The panels sit in the same flex row as the content, so their width comes
 * straight out of the working area: a fixed 280 px rail is a quarter of a
 * laptop screen spent on a card that may not even be selected. Docked, this
 * gives that width back (drag the edge to resize, or collapse to a rail that
 * still says what it is and how to get it back).
 *
 * Below the Compact tier that is not enough. 12.0 measured the shell at every
 * width: with the sidebar and the inspector both docked, the Board canvas is
 * 504 px at a 1024 viewport and **0 px** at 390 — the panels are `flex-none`
 * and the canvas is `min-w-0 flex-1`, so the canvas is the only thing that can
 * absorb the deficit and it absorbs all of it. There the panel leaves the flow
 * entirely and overlays the content as a drawer, leaving an edge handle behind
 * so it can be brought back (Phase 12.2).
 *
 * Which behaviour applies is not this component's decision: it asks
 * `panelsAreDocked` (src/lib/layout/tiers.ts), so the threshold lives with the
 * rest of the tier model rather than being restated here.
 *
 * **Docked and drawer are two different questions, and they have two different
 * answers.** `collapsed` is the caller's, persisted: *do I want this panel on
 * my screen?* The drawer's open state is this component's, deliberately not
 * persisted: someone who keeps the inspector open on a desktop must not find
 * it covering the canvas the first time they open the app on a phone.
 *
 * The drawer is a landmark, not a modal: claiming `aria-modal` without
 * trapping focus would tell a screen reader the rest of the page is inert when
 * it is not. What it does promise is three ways out — focus moves in on open
 * and returns to the opener on close, Escape dismisses, and it carries its own
 * close control.
 */
export function SidePanel({
  side = 'right',
  title,
  width,
  collapsed,
  minWidth,
  maxWidth,
  onWidth,
  onCollapsedChange,
  chrome = 'header',
  children,
}: {
  /** Which edge the panel lives on. The sidebar is the only `left` today. */
  side?: 'left' | 'right'
  title: string
  width: number
  collapsed: boolean
  minWidth?: number
  maxWidth?: number
  /** Omit to make the panel a fixed width — the separator is not rendered. */
  onWidth?: (width: number) => void
  onCollapsedChange: (collapsed: boolean) => void
  /**
   * `'header'` gives the panel a title row, a hide control and one scrolling
   * body — what an inspector wants. `'none'` hands the whole box to the
   * children: the sidebar has its own masthead, search and scroll region, and
   * wrapping those in a second header and a second scroller would nest two
   * layouts that each expect to own the column.
   */
  chrome?: 'header' | 'none'
  children: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  const handle = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  const tier = useViewportTier()
  const docked = panelsAreDocked(tier)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isLeft = side === 'left'

  /**
   * Focus follows the drawer: into the panel when it opens, back to the handle
   * when it closes.
   *
   * Back to the *handle*, not to whatever was focused before — the handle IS
   * what was focused before, and opening the drawer replaced it, so restoring
   * "the opener" would mean focusing a detached node and dropping focus to
   * `<body>`. The handle that comes back is a new element, so the panel has to
   * hand focus forward rather than put it back.
   */
  useEffect(() => {
    if (docked) return
    if (drawerOpen) {
      ref.current?.focus()
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setDrawerOpen(false)
      }
      window.addEventListener('keydown', onKey)
      wasOpen.current = true
      return () => window.removeEventListener('keydown', onKey)
    }
    if (wasOpen.current) {
      wasOpen.current = false
      handle.current?.focus()
    }
  }, [docked, drawerOpen])

  const show = `Show ${title.toLowerCase()}`
  const hide = `Hide ${title.toLowerCase()}`

  /* ---------- undocked: an overlay, or the handle that summons it ---------- */

  if (!docked) {
    if (!drawerOpen) {
      return (
        <button
          ref={handle}
          className="side-panel-handle"
          data-side={side}
          title={show}
          aria-label={show}
          aria-expanded={false}
          onClick={() => setDrawerOpen(true)}
        >
          {isLeft ? <IcChevronRight size={13} /> : <IcChevronLeft size={13} />}
        </button>
      )
    }
    return (
      <>
        <div className="side-panel-scrim" onClick={() => setDrawerOpen(false)} aria-hidden />
        <aside
          ref={ref}
          tabIndex={-1}
          aria-label={title}
          data-side={side}
          className="side-panel-drawer"
          style={{ width }}
        >
          {chrome === 'header' ? (
            <>
              <header className="flex flex-none items-center gap-1 border-b border-bord py-1.5 pr-1.5 pl-4">
                <span className="min-w-0 flex-1 truncate text-[10px] font-semibold tracking-widest text-muted uppercase">
                  {title}
                </span>
                <button
                  className="icon-btn h-6 w-6"
                  title={hide}
                  aria-label={hide}
                  aria-expanded
                  onClick={() => setDrawerOpen(false)}
                >
                  <IcX size={13} />
                </button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">{children}</div>
            </>
          ) : (
            <>
              {/* the children own the box, so the way out floats over it */}
              <button
                className="icon-btn side-panel-drawer-close"
                title={hide}
                aria-label={hide}
                aria-expanded
                onClick={() => setDrawerOpen(false)}
              >
                <IcX size={13} />
              </button>
              {children}
            </>
          )}
        </aside>
      </>
    )
  }

  /* ---------- docked ---------- */

  if (collapsed) {
    return (
      <aside
        className={`flex w-9 flex-none flex-col items-center gap-2 bg-panel py-2 ${
          isLeft ? 'border-r' : 'border-l'
        } border-bord`}
      >
        <button
          className="icon-btn h-7 w-7"
          title={show}
          aria-label={show}
          aria-expanded={false}
          onClick={() => onCollapsedChange(false)}
        >
          {isLeft ? <IcChevronRight size={13} /> : <IcChevronLeft size={13} />}
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
    if (!onWidth) return
    e.preventDefault()
    // measured once: the panel's own outer edge is the fixed point the drag is
    // relative to, and re-reading it mid-drag would chase the resize
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    const anchor = isLeft ? box.left : box.right
    const move = (ev: PointerEvent) =>
      onWidth(isLeft ? ev.clientX - anchor : anchor - ev.clientX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!onWidth) return
    const step = e.shiftKey ? 48 : 16
    // arrows always mean "wider" and "narrower" for the panel you are on, so
    // the key that grows it points away from the edge it lives on
    const grow = isLeft ? 'ArrowRight' : 'ArrowLeft'
    const shrink = isLeft ? 'ArrowLeft' : 'ArrowRight'
    if (e.key === grow) {
      e.preventDefault()
      onWidth(width + step)
    } else if (e.key === shrink) {
      e.preventDefault()
      onWidth(width - step)
    }
  }

  return (
    <aside
      ref={ref}
      className={`relative flex flex-none flex-col bg-panel ${
        isLeft ? 'border-r' : 'border-l'
      } border-bord`}
      style={{ width }}
    >
      {onWidth && (
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
          className={`absolute inset-y-0 z-10 w-1.5 cursor-col-resize hover:bg-accent/30 focus-visible:bg-accent/40 focus-visible:outline-none ${
            isLeft ? '-right-0.5' : '-left-0.5'
          }`}
        />
      )}
      {chrome === 'header' ? (
        <>
          <header className="flex flex-none items-center gap-1 border-b border-bord py-1.5 pr-1.5 pl-4">
            <span className="min-w-0 flex-1 truncate text-[10px] font-semibold tracking-widest text-muted uppercase">
              {title}
            </span>
            <button
              className="icon-btn h-6 w-6"
              title={hide}
              aria-label={hide}
              aria-expanded
              onClick={() => onCollapsedChange(true)}
            >
              {isLeft ? <IcChevronLeft size={13} /> : <IcChevronRight size={13} />}
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">{children}</div>
        </>
      ) : (
        children
      )}
    </aside>
  )
}
