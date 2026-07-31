import type { PageMargin, PageSetup, PageSize } from '@/types/model'

/**
 * Page geometry for the Document editor's A4/Letter mode.
 *
 * On screen we render one continuous sheet of page WIDTH with break-line
 * indicators every printable-height, because a contenteditable surface
 * cannot be reflowed into separate DOM pages live. The real pagination
 * happens in the print/PDF pipeline via the `@page` rule this module
 * emits, so what the user exports matches where the indicators fall.
 *
 * Lengths are given in millimetres (the source of truth, used for `@page`
 * and print CSS) and in CSS pixels at 96dpi (used for the on-screen sheet).
 */

const MM_TO_PX = 96 / 25.4 // 1mm at 96dpi ≈ 3.7795px

export const PAGE_SIZES_MM: Record<PageSize, { w: number; h: number; label: string }> = {
  a4: { w: 210, h: 297, label: 'A4' },
  letter: { w: 215.9, h: 279.4, label: 'Letter' },
}

export const PAGE_MARGINS_MM: Record<PageMargin, { value: number; label: string }> = {
  narrow: { value: 12.7, label: 'Narrow' },
  normal: { value: 25.4, label: 'Normal' },
  wide: { value: 38.1, label: 'Wide' },
}

export const DEFAULT_PAGE_SETUP: PageSetup = { mode: 'continuous', size: 'a4', margin: 'normal' }

/** Read a document's page setup, falling back to the continuous default. */
export function pageSetupOf(page: PageSetup | undefined): PageSetup {
  return page ?? DEFAULT_PAGE_SETUP
}

const round = (n: number) => Math.round(n * 100) / 100
const px = (mm: number) => Math.round(mm * MM_TO_PX)

export interface PageMetricsPx {
  /** full page width / height */
  width: number
  height: number
  margin: number
  /** printable height between the top and bottom margins — the break period */
  contentHeight: number
  /** printable width between the left and right margins */
  contentWidth: number
}

/** Page metrics in CSS px at 96dpi, for the on-screen sheet + break lines. */
export function pageMetricsPx(setup: PageSetup): PageMetricsPx {
  const size = PAGE_SIZES_MM[setup.size]
  const margin = px(PAGE_MARGINS_MM[setup.margin].value)
  const width = px(size.w)
  const height = px(size.h)
  return {
    width,
    height,
    margin,
    contentHeight: height - margin * 2,
    contentWidth: width - margin * 2,
  }
}

/**
 * CSS custom properties for the on-screen paged sheet. Spread onto the
 * editor container's style; the stylesheet reads them for the sheet size,
 * padding and the repeating break-line background.
 */
export function pageStyleVars(setup: PageSetup): Record<string, string> {
  const m = pageMetricsPx(setup)
  return {
    '--page-w': `${m.width}px`,
    '--page-h': `${m.height}px`,
    '--page-margin': `${m.margin}px`,
    '--page-content-h': `${m.contentHeight}px`,
  }
}

/**
 * The `@page` block plus the print rules that keep exports faithful: the
 * chosen size and margins, and `break-inside: avoid` so tables, images and
 * callouts are not split across a page boundary when it can be helped.
 * Continuous mode emits no `@page` size, letting the printer use its own.
 */
export function printPageCss(setup: PageSetup): string {
  const avoidBreak = `
table, img, figure, pre, blockquote, .callout { break-inside: avoid; }
h1, h2, h3, h4 { break-after: avoid; }`
  if (setup.mode !== 'paged') return avoidBreak
  const size = PAGE_SIZES_MM[setup.size]
  const margin = round(PAGE_MARGINS_MM[setup.margin].value)
  return `@page { size: ${round(size.w)}mm ${round(size.h)}mm; margin: ${margin}mm; }
${avoidBreak}`
}

/** Human summary, e.g. "A4 · Normal margins" — for menus and tooltips. */
export function describePageSetup(setup: PageSetup): string {
  if (setup.mode !== 'paged') return 'Continuous'
  return `${PAGE_SIZES_MM[setup.size].label} · ${PAGE_MARGINS_MM[setup.margin].label} margins`
}
