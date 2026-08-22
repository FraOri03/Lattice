import type { Ref } from 'react'

/**
 * One tab of the top navigation.
 *
 * Extracted from `SectionTabs` when 21.3 gave the AI cluster a live member:
 * that tab needs a ref (it anchors a popover) and lives in its own file
 * beside the panel it opens, but it must look and behave exactly like every
 * other tab in the bar. Two copies of these class names is how a toolbar
 * starts drifting one control at a time, so there is one.
 *
 * The width rules are the interesting part and they are both measured, not
 * guessed — see [`topBarFit`](../../lib/layout/topBarFit.ts):
 *
 *  - `labelled` at `@min-[127rem]`, because the eight words take the
 *    switcher from 520px to 899px, and that is the difference between a bar
 *    that fits and one that does not. The query asks the BAR how wide it is,
 *    not the window (audit F4).
 *  - `hideWhenTight` at `@min-[64rem]`, for controls that lead nowhere yet:
 *    below that width every pixel belongs to a live surface.
 */
export function SwitcherTab({
  icon,
  label,
  labelled = true,
  hideWhenTight,
  active,
  disabled,
  onClick,
  ariaLabel,
  title,
  ref,
  badge,
}: {
  icon: React.ReactNode
  label: string
  /** false pins the tab to its icon — see PlannedTab, and the AI tab */
  labelled?: boolean
  /** leaves the bar below 64rem, where every pixel belongs to a live surface */
  hideWhenTight?: boolean
  active: boolean
  disabled?: boolean
  onClick: () => void
  ariaLabel: string
  title: string
  ref?: Ref<HTMLButtonElement>
  /**
   * A count rendered beside the icon — running generations, today.
   *
   * A number rather than a coloured dot, because "something is happening"
   * conveyed by colour alone is exactly what `docs/accessibility.md` records
   * as a debt, and a new control must not add to it.
   */
  badge?: number
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={ariaLabel}
      title={title}
      className={`flex-none cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
        hideWhenTight ? 'hidden @min-[64rem]:flex' : 'flex'
      } ${active ? 'bg-panel text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
    >
      {icon}
      {labelled && <span className="hidden @min-[127rem]:inline">{label}</span>}
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-accent px-1 text-[9px] leading-4 font-semibold text-white">
          {badge}
        </span>
      )}
    </button>
  )
}
