/**
 * Text overflow (19E.3).
 *
 * Autofit is a choice here, not a surprise. The editor measures the rendered
 * text, and each remedy states what it will do *before* it does it — the new
 * size, the new height — so shrinking type is something you agree to rather
 * than something that happens to your slide while you look away.
 *
 * The measurement belongs to the DOM; the arithmetic belongs here, where it
 * can be tested.
 */

export interface OverflowMeasure {
  /** height the text actually needs */
  contentHeight: number
  /** height the box gives it */
  boxHeight: number
  /** current type size, used to work out a shrink */
  fontSize: number
  /** resolved line height multiplier, used to express the excess in lines */
  lineHeight: number
}

export interface OverflowReport {
  overflowing: boolean
  /** how far past the box the text runs, in slide pixels */
  overBy: number
  /** the same excess expressed in lines, rounded up — what a person sees */
  linesOver: number
  /** the size "shrink to fit" would land on, or null when nothing is needed */
  shrunkFontSize: number | null
  /** the height "grow the box" would land on, or null */
  grownHeight: number | null
}

/** Below this, shrinking has stopped being a remedy and become a problem. */
export const MIN_READABLE_SIZE = 8

export function measureOverflow(m: OverflowMeasure): OverflowReport {
  const overBy = Math.max(0, Math.round(m.contentHeight - m.boxHeight))
  if (overBy <= 0) {
    return { overflowing: false, overBy: 0, linesOver: 0, shrunkFontSize: null, grownHeight: null }
  }
  const lineHeightPx = Math.max(1, m.fontSize * m.lineHeight)
  // the ratio the text has to lose; shrinking type shrinks height proportionally
  const ratio = m.boxHeight / m.contentHeight
  const shrunk = Math.max(MIN_READABLE_SIZE, Math.floor(m.fontSize * ratio * 10) / 10)
  return {
    overflowing: true,
    overBy,
    linesOver: Math.max(1, Math.ceil(overBy / lineHeightPx)),
    // a shrink that cannot actually fit is not offered as one
    shrunkFontSize: shrunk < m.fontSize ? shrunk : null,
    grownHeight: Math.ceil(m.contentHeight),
  }
}

/** Would shrinking to fit take the text under the readable floor? */
export function shrinkIsUnreadable(report: OverflowReport): boolean {
  return report.shrunkFontSize !== null && report.shrunkFontSize <= MIN_READABLE_SIZE
}

/** How a text box responds to text that does not fit. */
export type AutoSizeMode = 'overflow' | 'shrink' | 'grow' | 'clip'

export const AUTOSIZE_LABEL: Record<AutoSizeMode, string> = {
  overflow: 'Show overflow',
  shrink: 'Shrink to fit',
  grow: 'Grow the box',
  clip: 'Clip',
}
