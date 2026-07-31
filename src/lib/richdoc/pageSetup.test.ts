import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAGE_SETUP,
  describePageSetup,
  pageMetricsPx,
  pageSetupOf,
  pageStyleVars,
  printPageCss,
} from './pageSetup'
import type { PageSetup } from '@/types/model'

const paged = (over: Partial<PageSetup> = {}): PageSetup => ({
  mode: 'paged',
  size: 'a4',
  margin: 'normal',
  ...over,
})

describe('pageSetupOf', () => {
  it('defaults an absent setup to continuous', () => {
    expect(pageSetupOf(undefined)).toEqual(DEFAULT_PAGE_SETUP)
    expect(DEFAULT_PAGE_SETUP.mode).toBe('continuous')
  })

  it('passes a present setup through', () => {
    const s = paged({ size: 'letter' })
    expect(pageSetupOf(s)).toBe(s)
  })
})

describe('pageMetricsPx', () => {
  it('sizes an A4 page at 96dpi', () => {
    const m = pageMetricsPx(paged())
    expect(m.width).toBe(794) // 210mm
    expect(m.height).toBe(1123) // 297mm
  })

  it('sizes a Letter page at 96dpi', () => {
    const m = pageMetricsPx(paged({ size: 'letter' }))
    expect(m.width).toBe(816) // 215.9mm
    expect(m.height).toBe(1056) // 279.4mm
  })

  it('derives the printable content box from the margins', () => {
    const m = pageMetricsPx(paged({ margin: 'normal' }))
    expect(m.margin).toBe(96) // 25.4mm
    expect(m.contentHeight).toBe(m.height - 96 * 2)
    expect(m.contentWidth).toBe(m.width - 96 * 2)
  })

  it('narrow margins leave more printable area than wide', () => {
    const narrow = pageMetricsPx(paged({ margin: 'narrow' }))
    const wide = pageMetricsPx(paged({ margin: 'wide' }))
    expect(narrow.contentHeight).toBeGreaterThan(wide.contentHeight)
  })
})

describe('pageStyleVars', () => {
  it('exposes the sheet geometry as CSS custom properties', () => {
    const vars = pageStyleVars(paged())
    expect(vars).toMatchObject({
      '--page-w': '794px',
      '--page-h': '1123px',
      '--page-margin': '96px',
      '--page-content-h': `${1123 - 96 * 2}px`,
    })
  })
})

describe('printPageCss', () => {
  it('emits an @page size and margin for paged mode', () => {
    const css = printPageCss(paged())
    expect(css).toContain('@page')
    expect(css).toContain('210mm 297mm')
    expect(css).toContain('margin: 25.4mm')
  })

  it('honours size and margin choices', () => {
    const css = printPageCss(paged({ size: 'letter', margin: 'narrow' }))
    expect(css).toContain('215.9mm 279.4mm')
    expect(css).toContain('margin: 12.7mm')
  })

  it('omits @page size in continuous mode but still avoids bad breaks', () => {
    const css = printPageCss({ mode: 'continuous', size: 'a4', margin: 'normal' })
    expect(css).not.toContain('@page')
    expect(css).toContain('break-inside: avoid')
  })

  it('keeps tables and images from splitting across pages', () => {
    const css = printPageCss(paged())
    expect(css).toMatch(/table[^}]*break-inside: avoid/)
  })
})

describe('describePageSetup', () => {
  it('names the paged geometry', () => {
    expect(describePageSetup(paged())).toBe('A4 · Normal margins')
    expect(describePageSetup(paged({ size: 'letter', margin: 'wide' }))).toBe(
      'Letter · Wide margins',
    )
  })

  it('labels continuous mode', () => {
    expect(describePageSetup({ mode: 'continuous', size: 'a4', margin: 'normal' })).toBe(
      'Continuous',
    )
  })
})
