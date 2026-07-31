import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { IcChevronDown } from '@/components/Icons'
import { ToolbarDivider } from '@/components/ui/ToolbarDivider'
import { TOOLBAR_CONTROL_ATTR, useRovingFocus } from './useRovingFocus'

/**
 * Toolbar primitives (Phase 11.1.2a).
 *
 * One behaviour, several densities. The audit found three grammars that
 * disagreed on roles, names, pressed state and keyboard model; these
 * components fix the BEHAVIOUR and leave the look to two orthogonal axes —
 * `size` (sm | md) and `content` (icon | icon-label) — so the board can keep
 * its labelled tools while a formatting strip stays compact.
 *
 * Nothing here invents a tool. The primitives render what a mode passes them.
 */

export type ToolbarSize = 'sm' | 'md'
/**
 * `icon` — icon only, named by aria-label.
 * `icon-text` — icon and text side by side (compact bars).
 * `icon-label` — text under the icon (wide canvases, discovery matters).
 */
export type ToolbarContent = 'icon' | 'icon-text' | 'icon-label'

interface ToolbarCtx {
  size: ToolbarSize
  content: ToolbarContent
}
const ToolbarContext = createContext<ToolbarCtx>({ size: 'md', content: 'icon' })

/* ------------------------------------------------------------------ root */

export function ToolbarRoot({
  label,
  orientation = 'horizontal',
  size = 'md',
  content = 'icon',
  className = '',
  children,
}: {
  /** accessible name — required: an unnamed toolbar is a toolbar you cannot find */
  label: string
  orientation?: 'horizontal' | 'vertical'
  size?: ToolbarSize
  content?: ToolbarContent
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const roving = useRovingFocus(ref, orientation)
  return (
    <ToolbarContext.Provider value={{ size, content }}>
      <div
        ref={ref}
        role="toolbar"
        aria-label={label}
        aria-orientation={orientation}
        className={`flex ${orientation === 'vertical' ? 'flex-col' : 'flex-row'} items-center ${className}`}
        onKeyDown={roving.onKeyDown}
        onFocus={roving.onFocus}
      >
        {children}
      </div>
    </ToolbarContext.Provider>
  )
}

export function ToolbarGroup({
  label,
  className = '',
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    // flex-none: a group never squashes its own controls. Without it a bar
    // narrower than its content shrinks the groups while the controls keep
    // their size, and they paint outside the toolbar's background.
    <div
      role="group"
      aria-label={label}
      className={`flex flex-none items-center gap-0.5 ${className}`}
    >
      {children}
    </div>
  )
}

/** The separator every family already shared — re-exported, not re-invented. */
export const ToolbarSeparator = ToolbarDivider

/* --------------------------------------------------------------- controls */

interface ControlProps {
  icon: ReactNode
  /** the accessible name, always required */
  label: string
  /** longer tooltip; falls back to the label */
  description?: string
  shortcut?: string
  size?: ToolbarSize
  content?: ToolbarContent
  disabled?: boolean
  /** shown instead of the tooltip when disabled — never invented */
  disabledReason?: string
  className?: string
  /**
   * Classes for the label span — the one legitimate use is hiding the text at
   * narrow widths (`hidden lg:inline`). Passing it keeps `aria-label` on the
   * button, because a label that can disappear cannot be the accessible name.
   */
  labelClassName?: string
  onRun: () => void
}

function tooltipOf(p: {
  label: string
  description?: string
  shortcut?: string
  disabled?: boolean
  disabledReason?: string
}): string {
  if (p.disabled && p.disabledReason) return p.disabledReason
  const base = p.description ?? p.label
  return p.shortcut ? `${base} (${p.shortcut})` : base
}

function controlClass(size: ToolbarSize, content: ToolbarContent, extra = '') {
  return [
    'toolbar-control',
    `toolbar-control--${size}`,
    content === 'icon' ? '' : `toolbar-control--${content}`,
    extra,
  ]
    .filter(Boolean)
    .join(' ')
}

/** The visible text, plus whether the button still needs an aria-label. */
function labelParts(
  content: ToolbarContent,
  label: string,
  labelClassName?: string,
): { text: ReactNode; ariaLabel?: string } {
  if (content === 'icon') return { text: null, ariaLabel: label }
  return {
    text: (
      <span className={`toolbar-control__label ${labelClassName ?? ''}`}>{label}</span>
    ),
    // a label that can be hidden by a breakpoint cannot carry the name alone
    ariaLabel: labelClassName ? label : undefined,
  }
}

/**
 * A plain action. `content: 'icon-label'` shows the label under the icon —
 * then the visible text IS the accessible name (WCAG 2.5.3), so no
 * `aria-label` is added on top of it.
 */
export function ToolbarAction({
  icon,
  label,
  description,
  shortcut,
  size,
  content,
  disabled,
  disabledReason,
  className,
  labelClassName,
  onRun,
}: ControlProps) {
  const ctx = useContext(ToolbarContext)
  const s = size ?? ctx.size
  const c = content ?? ctx.content
  const { text, ariaLabel } = labelParts(c, label, labelClassName)
  return (
    <button
      type="button"
      {...{ [TOOLBAR_CONTROL_ATTR]: '' }}
      className={controlClass(s, c, className)}
      disabled={disabled}
      aria-label={ariaLabel}
      title={tooltipOf({ label, description, shortcut, disabled, disabledReason })}
      onClick={onRun}
    >
      {icon}
      {text}
    </button>
  )
}

/** A two-state control. State reaches AT through `aria-pressed`, and the eye
 *  through an underline as well as a colour (the sheet toolbar used colour
 *  alone). */
export function ToolbarToggle({
  pressed,
  ...rest
}: ControlProps & { pressed: boolean }) {
  const ctx = useContext(ToolbarContext)
  const s = rest.size ?? ctx.size
  const c = rest.content ?? ctx.content
  const { text, ariaLabel } = labelParts(c, rest.label, rest.labelClassName)
  return (
    <button
      type="button"
      {...{ [TOOLBAR_CONTROL_ATTR]: '' }}
      className={controlClass(s, c, rest.className)}
      disabled={rest.disabled}
      aria-pressed={pressed}
      aria-label={ariaLabel}
      title={tooltipOf(rest)}
      onClick={rest.onRun}
    >
      {rest.icon}
      {text}
    </button>
  )
}

/* ------------------------------------------------------------------ menu */

export interface ToolbarMenuItem {
  id: string
  label: string
  /** tooltip when this item is the split control's primary ("Add note") */
  description?: string
  icon?: ReactNode
  shortcut?: string
  run: () => void
}

/**
 * The popover half of a menu control: a roving `role="menu"` (arrows,
 * Home/End), Escape returns focus to its trigger, Tab closes it, and a click
 * outside dismisses it.
 */
export function ToolbarMenu({
  label,
  items,
  onClose,
  onRun,
  className = '',
}: {
  label: string
  items: ToolbarMenuItem[]
  /** close, optionally returning focus to the trigger */
  onClose: (focusTrigger?: boolean) => void
  onRun: (item: ToolbarMenuItem) => void
  className?: string
}) {
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    requestAnimationFrame(() => itemsRef.current[0]?.focus())
  }, [])

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
      onClose(true)
    } else if (e.key === 'Tab') {
      onClose(false)
    }
  }

  return (
    <div
      role="menu"
      aria-label={label}
      className={`absolute bottom-full left-0 z-50 mb-2 w-48 rounded-xl border border-bord bg-panel p-1 shadow-xl ${className}`}
    >
      {items.map((item, i) => (
        <button
          key={item.id}
          ref={(el) => {
            itemsRef.current[i] = el
          }}
          role="menuitem"
          tabIndex={-1}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-muted hover:bg-panel2 hover:text-ink focus:bg-panel2 focus:text-ink focus:outline-none"
          onClick={() => onRun(item)}
          onKeyDown={(e) => onItemKeyDown(e, i)}
        >
          {item.icon && <span className="flex-none text-muted">{item.icon}</span>}
          <span className="flex-1">{item.label}</span>
          {item.shortcut && (
            <kbd className="flex-none text-[10px] text-muted">{item.shortcut}</kbd>
          )}
        </button>
      ))}
    </div>
  )
}

/**
 * The trigger for whatever did not fit. Pair it with `useToolbarOverflow`,
 * which decides how many items are visible; this only renders the tail.
 */
export function ToolbarOverflow({
  label,
  items,
  size,
  className = '',
}: {
  label: string
  items: ToolbarMenuItem[]
  size?: ToolbarSize
  className?: string
}) {
  const ctx = useContext(ToolbarContext)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  if (!items.length) return null

  const close = (focusTrigger = true) => {
    setOpen(false)
    if (focusTrigger) requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        {...{ [TOOLBAR_CONTROL_ATTR]: '' }}
        className={controlClass(size ?? ctx.size, 'icon')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden className="text-[15px] leading-none">···</span>
      </button>
      {open && (
        <ToolbarMenu
          label={label}
          items={items}
          onClose={close}
          onRun={(item) => {
            setOpen(false)
            item.run()
          }}
        />
      )}
    </div>
  )
}

/**
 * Split control: the primary repeats the last-used tool in its family, the
 * chevron opens the alternatives. Two separate targets on purpose — merging
 * them would cost the repeat-click gesture — but both now clear the 24 px
 * floor through `.toolbar-control`, where the old chevron measured 19 px.
 */
export function ToolbarSplitButton({
  items,
  menuLabel,
  defaultItemId,
  openOnEvent,
  size,
  content,
  className = '',
}: {
  items: ToolbarMenuItem[]
  /** specific, e.g. "Open shape tools" — never a bare "More" */
  menuLabel: string
  defaultItemId?: string
  openOnEvent?: string
  size?: ToolbarSize
  content?: ToolbarContent
  className?: string
}) {
  const ctx = useContext(ToolbarContext)
  const s = size ?? ctx.size
  const c = content ?? ctx.content
  const [activeId, setActiveId] = useState(defaultItemId ?? items[0]?.id)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const chevronRef = useRef<HTMLButtonElement>(null)
  const active = items.find((i) => i.id === activeId) ?? items[0]

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (!openOnEvent) return
    const onOpen = () => setOpen(true)
    window.addEventListener(openOnEvent, onOpen)
    return () => window.removeEventListener(openOnEvent, onOpen)
  }, [openOnEvent])

  if (!active) return null

  const close = (focusTrigger = true) => {
    setOpen(false)
    if (focusTrigger) requestAnimationFrame(() => chevronRef.current?.focus())
  }

  const run = (item: ToolbarMenuItem) => {
    setActiveId(item.id)
    setOpen(false)
    item.run()
  }

  return (
    <div className={`toolbar-split relative ${className}`} ref={rootRef}>
      <button
        type="button"
        {...{ [TOOLBAR_CONTROL_ATTR]: '' }}
        className={controlClass(s, c)}
        aria-label={labelParts(c, active.label).ariaLabel}
        title={tooltipOf({
          label: active.label,
          description: active.description,
          shortcut: active.shortcut,
        })}
        onClick={() => run(active)}
      >
        {active.icon}
        {labelParts(c, active.label).text}
      </button>
      <button
        ref={chevronRef}
        type="button"
        {...{ [TOOLBAR_CONTROL_ATTR]: '' }}
        className={controlClass(s, 'icon')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={menuLabel}
        title={menuLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <IcChevronDown size={11} />
      </button>
      {open && (
        <ToolbarMenu label={menuLabel} items={items} onClose={close} onRun={run} />
      )}
    </div>
  )
}
