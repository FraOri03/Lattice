/**
 * ToolbarDivider — the one divider every toolbar shares (Phase 8).
 *
 * A thin rule on the design-token border color with breathing room on
 * both sides. It is a presentation-only <span role="separator">: not
 * focusable, so keyboard navigation flows straight through it, and
 * callers render it conditionally so it disappears with an empty
 * neighbouring group.
 */
export function ToolbarDivider({
  orientation = 'vertical',
}: {
  /** vertical rule for row toolbars, horizontal for column toolbars */
  orientation?: 'vertical' | 'horizontal'
}) {
  return (
    <span
      role="separator"
      aria-orientation={orientation}
      className={
        orientation === 'vertical'
          ? 'mx-1.5 h-4 w-px flex-none self-center bg-bord'
          : 'my-1.5 h-px w-4 flex-none self-center bg-bord'
      }
    />
  )
}
