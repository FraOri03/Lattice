/**
 * What the top bar can afford — measured against the BAR, not the window.
 *
 * The bar used to fold on the viewport tier (`atLeast(tier, 'full')`), and that
 * was wrong twice over. Wrong box: the bar lives in the viewport minus the
 * sidebar, so a 1440 window gives it ~1190px and the rule read 1440. Wrong
 * number: with everything inline and nothing wrapping, the bar asks for
 * ~1770px, so even a 1920 window (1671px of bar) overflowed — the only reason
 * it *looked* like it fit is that the buttons were shrinking and wrapping
 * their labels, which is how a 44px bar ended up with 45px controls in it.
 *
 * So the thresholds below are widths of the header element, and they are
 * measured sums of what each group actually costs (Italian, the longer of the
 * two locales, with presence avatars showing):
 *
 *   breadcrumb          ~190   switcher (14 icons, 5 clusters)  ~525
 *   status cluster      ~400   actions cluster                  ~250
 *   profile + overflow   ~60   gaps + padding                   ~130
 *
 * The bar is not a scroll surface by design — `overflow-x-auto` is the floor
 * under a locale we did not measure, not the mechanism.
 */

/** Header widths, in CSS px, at which each group can stay in the bar. */
export const BAR_FIT = {
  /**
   * Everything inline: breadcrumb + switcher + status + actions + profile.
   * Measured at 1617px in Italian, signed out, with presence avatars and the
   * collaboration-scope badge both showing — the widest the bar gets.
   */
  actions: 1630,
  /** Status inline, actions in the overflow menu. Measured at 1300px. */
  status: 1320,
  /**
   * Controls that hide their word next to their icon (Share, the realtime
   * chip, Join call) can afford it again. Mirrors the `@min-[64rem]` the
   * breadcrumb still uses for its workspace segment.
   */
  controlLabels: 1024,
  /**
   * The scope badge beside Share ("Drive", "This browser") — the last thing
   * worth space, so the highest bar.
   */
  scopeBadge: 1280,
} as const

export interface BarFit {
  /** presence, realtime, call, notifications, sync stay in the bar */
  showStatus: boolean
  /** share, comments, history, palette, theme stay in the bar */
  showActions: boolean
  /** controls in the bar may render their label, not just their icon */
  showControlLabels: boolean
  /** the collaboration-scope badge beside Share */
  showScopeBadge: boolean
}

/**
 * `null` — no measurement yet — resolves to "everything fits", for the same
 * reason `tierFromCeilings` resolves to `full`: the first paint of a bar that
 * has folded everything into a "···" menu is a worse lie than one frame of an
 * over-full bar, and jsdom (which has no layout) must see the whole bar.
 */
export function barFit(width: number | null): BarFit {
  if (width === null) {
    return {
      showStatus: true,
      showActions: true,
      showControlLabels: true,
      showScopeBadge: true,
    }
  }
  return {
    showStatus: width >= BAR_FIT.status,
    showActions: width >= BAR_FIT.actions,
    showControlLabels: width >= BAR_FIT.controlLabels,
    showScopeBadge: width >= BAR_FIT.scopeBadge,
  }
}
