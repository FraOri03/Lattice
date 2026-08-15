import { describe, expect, it } from 'vitest'
import {
  defaultTextStyle,
  resolveTextRender,
  resolveElementStyle,
  resolveTextStyle,
  sanitizeTextStyles,
  textStyleOverrides,
  withStyleOverride,
} from './textStyles'
import { MIN_READABLE_SIZE, measureOverflow, shrinkIsUnreadable } from './overflow'
import { THEME_PRESETS } from './theme'

const tokens = THEME_PRESETS.plain

describe('text styles — defaults', () => {
  it('takes its sizes from the tokens, so a master moves every style at once', () => {
    expect(defaultTextStyle('title', tokens).size).toBe(tokens.titleSize)
    expect(defaultTextStyle('body', tokens).size).toBe(tokens.bodySize)
    const bigger = { ...tokens, titleSize: 60 }
    expect(defaultTextStyle('title', bigger).size).toBe(60)
  })

  it('gives a caption the muted colour, because that is what a caption is', () => {
    expect(defaultTextStyle('caption', tokens).color).toBe(tokens.textMuted)
    expect(defaultTextStyle('body', tokens).color).toBe(tokens.text)
  })
})

describe('text styles — the deck’s changes', () => {
  it('layers the deck’s definition over the default', () => {
    const style = resolveTextStyle('body', tokens, { body: { weight: 300, size: 21 } })
    expect(style).toMatchObject({ weight: 300, size: 21, color: tokens.text })
  })

  it('leaves every other style alone', () => {
    const styles = { body: { size: 21 } }
    expect(resolveTextStyle('title', tokens, styles).size).toBe(tokens.titleSize)
  })
})

describe('an element and its style', () => {
  const styles = { body: { size: 20 } }

  it('reads everything from the style when it overrides nothing', () => {
    const el = { styleRef: 'body' as const, styleOverride: undefined }
    expect(resolveElementStyle(el, tokens, styles)?.size).toBe(20)
    expect(textStyleOverrides(el)).toEqual([])
  })

  it('follows the style when the style changes — no fan-out required', () => {
    const el = { styleRef: 'body' as const }
    expect(resolveElementStyle(el, tokens, { body: { size: 30 } })?.size).toBe(30)
  })

  it('keeps its own value where it overrides, and says which', () => {
    const el = { styleRef: 'body' as const, styleOverride: { size: 44, weight: 700 } }
    expect(resolveElementStyle(el, tokens, styles)?.size).toBe(44)
    expect(textStyleOverrides(el).sort()).toEqual(['size', 'weight'])
  })

  it('has no style at all when it is not linked to one', () => {
    expect(resolveElementStyle({}, tokens, styles)).toBeNull()
  })
})

describe('withStyleOverride', () => {
  it('sets one property without disturbing the others', () => {
    const out = withStyleOverride({ size: 30 }, 'weight', 700)
    expect(out).toEqual({ size: 30, weight: 700 })
  })

  it('reverting deletes the key rather than pinning the inherited value', () => {
    expect(withStyleOverride({ size: 30, weight: 700 }, 'size', undefined)).toEqual({ weight: 700 })
  })

  it('drops the override object once the last key goes', () => {
    expect(withStyleOverride({ size: 30 }, 'size', undefined)).toBeUndefined()
  })
})

describe('sanitizeTextStyles', () => {
  it('keeps well-formed values', () => {
    expect(sanitizeTextStyles({ body: { size: 18, weight: 400 } })).toEqual({
      body: { size: 18, weight: 400 },
    })
  })

  it('drops values a renderer could not use', () => {
    expect(sanitizeTextStyles({ body: { size: -2, weight: 5000, color: 'red' } })).toBeUndefined()
  })

  it('ignores style names it does not know', () => {
    expect(sanitizeTextStyles({ shout: { size: 90 } })).toBeUndefined()
  })
})

describe('overflow', () => {
  it('says nothing when the text fits', () => {
    const r = measureOverflow({ contentHeight: 80, boxHeight: 100, fontSize: 18, lineHeight: 1.5 })
    expect(r.overflowing).toBe(false)
    expect(r.shrunkFontSize).toBeNull()
  })

  it('reports the excess in lines, which is what a person sees', () => {
    const r = measureOverflow({ contentHeight: 154, boxHeight: 100, fontSize: 18, lineHeight: 1.5 })
    expect(r.overflowing).toBe(true)
    expect(r.linesOver).toBe(2)
  })

  it('states the size a shrink would land on, and the height a grow would', () => {
    const r = measureOverflow({ contentHeight: 200, boxHeight: 100, fontSize: 20, lineHeight: 1.5 })
    expect(r.shrunkFontSize).toBeCloseTo(10, 1)
    expect(r.grownHeight).toBe(200)
  })

  it('never offers a shrink that would not actually shrink', () => {
    const r = measureOverflow({ contentHeight: 101, boxHeight: 100, fontSize: 8, lineHeight: 1.2 })
    expect(r.shrunkFontSize).toBeNull()
  })

  it('flags a shrink that would take the text under the readable floor', () => {
    const r = measureOverflow({ contentHeight: 900, boxHeight: 100, fontSize: 40, lineHeight: 1.2 })
    expect(r.shrunkFontSize).toBe(MIN_READABLE_SIZE)
    expect(shrinkIsUnreadable(r)).toBe(true)
  })
})

/**
 * Once a box holds a document its runs own their marks. If the container kept
 * the old box-level bold as well, a run that turns bold *off* would still
 * render bold — which is what the browser showed before this rule existed.
 */
describe('resolveTextRender — marks belong to the runs', () => {
  const base = { fontSize: 20, bold: true, italic: true, align: 'left' as const, color: null }

  it('keeps the box-level weight for a box that never became a document', () => {
    expect(resolveTextRender(base, tokens, undefined).weight).toBe(700)
  })

  it('hands weight to the runs once there is a document', () => {
    expect(resolveTextRender({ ...base, doc: {} }, tokens, undefined).weight).toBe(400)
  })

  it('still lets a style set the weight for a document box', () => {
    const out = resolveTextRender({ ...base, doc: {}, styleRef: 'title' }, tokens, undefined)
    expect(out.weight).toBe(700)
  })
})
