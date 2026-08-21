import { describe, expect, it } from 'vitest'
import { BAR_FIT, barFit } from './topBarFit'

/**
 * The thresholds are measurements, so the tests that matter are the ones that
 * would catch a threshold drifting back under what the bar actually costs.
 * The costs are recorded in topBarFit's header comment; if the bar grows, one
 * of these fails before the bar starts scrolling sideways in front of a user.
 */
describe('barFit', () => {
  const COST = {
    /** breadcrumb + switcher + status + actions + profile, Italian, signed out */
    everythingInline: 1617,
    /** the same with the actions cluster in the overflow menu */
    actionsFolded: 1300,
  }

  it('keeps a group in the bar only at a width that actually holds it', () => {
    expect(BAR_FIT.actions).toBeGreaterThanOrEqual(COST.everythingInline)
    expect(BAR_FIT.status).toBeGreaterThanOrEqual(COST.actionsFolded)
  })

  it('folds the actions first and the status second', () => {
    expect(BAR_FIT.status).toBeLessThan(BAR_FIT.actions)

    const wide = barFit(BAR_FIT.actions)
    expect(wide).toMatchObject({ showActions: true, showStatus: true })

    const middle = barFit(BAR_FIT.actions - 1)
    expect(middle).toMatchObject({ showActions: false, showStatus: true })

    const narrow = barFit(BAR_FIT.status - 1)
    expect(narrow).toMatchObject({ showActions: false, showStatus: false })
  })

  it('drops the scope badge before the words beside it', () => {
    expect(BAR_FIT.controlLabels).toBeLessThan(BAR_FIT.scopeBadge)
    expect(barFit(BAR_FIT.scopeBadge - 1)).toMatchObject({
      showControlLabels: true,
      showScopeBadge: false,
    })
  })

  /**
   * jsdom has no layout and answers 0 for every box; a display:none ancestor
   * does the same in a browser. Neither is a measurement, and resolving them
   * to "the narrowest bar" would fold the whole suite into a "···" menu — the
   * same direction `tierFromCeilings` resolves for the same reason.
   */
  it('assumes everything fits when there is no measurement', () => {
    expect(barFit(null)).toEqual({
      showStatus: true,
      showActions: true,
      showControlLabels: true,
      showScopeBadge: true,
    })
  })
})
