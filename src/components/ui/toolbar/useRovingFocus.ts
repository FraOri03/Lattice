import { useCallback, useEffect, type RefObject } from 'react'

/**
 * Roving tabindex for a toolbar (Phase 11.1.2b).
 *
 * A toolbar is ONE tab stop: Tab enters it and Tab leaves it, arrows move
 * between the controls inside. Before this, the board declared
 * `role="toolbar"` while shipping eight separate tab stops — the role
 * promised a keyboard model the DOM did not implement.
 *
 * DOM-driven on purpose: controls are found by querying, never by
 * registering themselves through context. Toolbars render conditionally
 * (a permission hides Comment, a selection reveals table controls), and a
 * registration list would drift out of order the moment one of them
 * mounted or unmounted mid-list.
 */

/** Every primitive marks itself with this; nothing else participates. */
export const TOOLBAR_CONTROL_ATTR = 'data-toolbar-control'

const CONTROLS = `[${TOOLBAR_CONTROL_ATTR}]:not(:disabled):not([aria-disabled='true'])`

/** Focus inside these means arrows belong to the control, not the toolbar. */
function ownsArrowKeys(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'SELECT' ||
    tag === 'TEXTAREA' ||
    (el as HTMLElement).isContentEditable ||
    // an open menu runs its own roving loop
    !!el.closest('[role="menu"]')
  )
}

export function useRovingFocus(
  rootRef: RefObject<HTMLElement | null>,
  orientation: 'horizontal' | 'vertical' = 'horizontal',
) {
  /** Controls the arrows may land on. */
  const controls = useCallback(
    (): HTMLElement[] => [...(rootRef.current?.querySelectorAll<HTMLElement>(CONTROLS) ?? [])],
    [rootRef],
  )

  /** Every control, disabled ones included — they must not keep tabIndex 0
   *  from before they were disabled, or re-enabling adds a second tab stop. */
  const allControls = useCallback(
    (): HTMLElement[] => [
      ...(rootRef.current?.querySelectorAll<HTMLElement>(`[${TOOLBAR_CONTROL_ATTR}]`) ??
        []),
    ],
    [rootRef],
  )

  /** Keep exactly one control in the tab order. */
  const sync = useCallback(
    (focused?: Element | null) => {
      const list = controls()
      if (!list.length) return
      const current =
        (focused && list.find((c) => c === focused)) ??
        list.find((c) => c.tabIndex === 0) ??
        list[0]
      for (const c of allControls()) c.tabIndex = c === current ? 0 : -1
    },
    [allControls, controls],
  )

  // after every render: a control that appeared or disappeared must not leave
  // the toolbar with zero or two tab stops
  useEffect(sync)

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const active = document.activeElement
      if (ownsArrowKeys(active)) return
      const [next, prev] =
        orientation === 'vertical'
          ? ['ArrowDown', 'ArrowUp']
          : ['ArrowRight', 'ArrowLeft']
      const list = controls()
      if (!list.length) return
      const at = list.findIndex((c) => c === active)
      const last = list.length - 1
      let target: HTMLElement | undefined
      if (e.key === next) target = list[at >= last ? 0 : at + 1]
      else if (e.key === prev) target = list[at <= 0 ? last : at - 1]
      else if (e.key === 'Home') target = list[0]
      else if (e.key === 'End') target = list[last]
      if (!target) return
      e.preventDefault()
      sync(target)
      target.focus()
    },
    [controls, orientation, sync],
  )

  /** Clicking or tabbing to a control makes it the tab stop. */
  const onFocus = useCallback(
    (e: React.FocusEvent) => sync(e.target as Element),
    [sync],
  )

  return { onKeyDown, onFocus }
}
