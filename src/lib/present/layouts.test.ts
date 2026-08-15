import { describe, expect, it } from 'vitest'
import {
  LAYOUTS,
  applyLayoutPlan,
  layoutById,
  placeholderFontSize,
  placeholderFor,
  placeholderOverrides,
  planLayout,
  revertOverride,
} from './layouts'
import { THEME_PRESETS } from './theme'
import {
  createSlide,
  createTextElement,
  type ImageElement,
  type PresentElement,
  type PresentationBody,
} from './presentModel'

const tokens = THEME_PRESETS.plain

const image = (id: string, extra: Partial<ImageElement> = {}): ImageElement => ({
  id,
  kind: 'image',
  src: 'data:image/png;base64,AA',
  x: 10,
  y: 10,
  w: 100,
  h: 80,
  z: 0,
  ...extra,
})

const deck = (elements: PresentElement[]): PresentationBody => ({
  app: 'lattice-present',
  version: 4,
  theme: 'plain',
  slides: [createSlide({ id: 's1', elements })],
})

describe('the catalogue', () => {
  it('offers at least ten layouts, each with a unique id', () => {
    expect(LAYOUTS.length).toBeGreaterThanOrEqual(10)
    expect(new Set(LAYOUTS.map((l) => l.id)).size).toBe(LAYOUTS.length)
  })

  it('keeps every placeholder on the slide', () => {
    for (const layout of LAYOUTS) {
      for (const p of layout.placeholders) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.x + p.w).toBeLessThanOrEqual(960)
        expect(p.y + p.h).toBeLessThanOrEqual(540)
      }
    }
  })

  it('has a blank layout that claims nothing', () => {
    expect(layoutById('blank')?.placeholders).toHaveLength(0)
  })
})

describe('planLayout — mapping by role', () => {
  it('sends an element with a role to its own placeholder', () => {
    const body = deck([
      createTextElement({ id: 'a', text: 'Body', fontSize: 14, role: 'body' }),
      createTextElement({ id: 'b', text: 'Title', fontSize: 40, role: 'title' }),
    ])
    const plan = planLayout(body, 0, 'title-content')!
    const roles = Object.fromEntries(plan.assignments.map((a) => [a.elementId, a.role]))
    expect(roles).toEqual({ a: 'body', b: 'title' })
  })

  it('treats the largest unroled text as the title', () => {
    const body = deck([
      createTextElement({ id: 'small', text: 'detail', fontSize: 14 }),
      createTextElement({ id: 'big', text: 'THE TITLE', fontSize: 44 }),
    ])
    const plan = planLayout(body, 0, 'title-content')!
    expect(plan.assignments.find((a) => a.role === 'title')?.elementId).toBe('big')
    expect(plan.assignments.find((a) => a.role === 'body')?.elementId).toBe('small')
  })

  it('splits body text across both columns of a two-column layout', () => {
    const body = deck([
      createTextElement({ id: 't', text: 'Title', fontSize: 40 }),
      createTextElement({ id: 'l', text: 'Left', fontSize: 18 }),
      createTextElement({ id: 'r', text: 'Right', fontSize: 18 }),
    ])
    const plan = planLayout(body, 0, 'two-column')!
    expect(plan.assignments.map((a) => a.role).sort()).toEqual(['body', 'bodyAlt', 'title'])
  })

  it('puts images in media placeholders and never in text ones', () => {
    const body = deck([image('img'), createTextElement({ id: 't', fontSize: 40 })])
    const plan = planLayout(body, 0, 'image-text')!
    expect(plan.assignments.find((a) => a.elementId === 'img')?.role).toBe('media')
  })

  it('reports what it could not place instead of moving it anyway', () => {
    const body = deck([
      createTextElement({ id: 'a', fontSize: 40 }),
      createTextElement({ id: 'b', fontSize: 20 }),
      createTextElement({ id: 'c', fontSize: 20 }),
    ])
    const plan = planLayout(body, 0, 'title-content')!
    expect(plan.assignments).toHaveLength(2)
    expect(plan.freeElementIds).toEqual(['c'])
  })

  it('reports placeholders nothing filled', () => {
    const plan = planLayout(deck([createTextElement({ id: 'only', fontSize: 40 })]), 0, 'two-column')!
    expect(plan.emptyRoles).toEqual(['body', 'bodyAlt'])
  })

  it('says nothing rather than guessing when the layout is unknown', () => {
    expect(planLayout(deck([]), 0, 'no-such-layout')).toBeNull()
  })
})

describe('applyLayoutPlan — non-destructive', () => {
  const body = deck([
    createTextElement({ id: 't', text: 'Title', fontSize: 40 }),
    createTextElement({ id: 'b', text: 'Body', fontSize: 18 }),
    createTextElement({ id: 'free', text: 'Stray', fontSize: 18, x: 700, y: 480, w: 200, h: 40 }),
  ])
  const plan = planLayout(body, 0, 'title-content')!
  const next = applyLayoutPlan(body, 0, plan, tokens)
  const byId = (id: string) => next.slides[0].elements.find((e) => e.id === id)!

  it('moves assigned elements onto their placeholder', () => {
    const layout = layoutById('title-content')!
    const title = layout.placeholders.find((p) => p.role === 'title')!
    expect(byId('t')).toMatchObject({ x: title.x, y: title.y, w: title.w, h: title.h })
  })

  it('stamps the role so the next layout change knows where things belong', () => {
    expect(byId('t').role).toBe('title')
    expect(byId('b').role).toBe('body')
  })

  it('takes the type size from the tokens, not from a hard-coded number', () => {
    const el = byId('t')
    expect(el.kind === 'text' && el.fontSize).toBe(tokens.titleSize)
  })

  it('leaves a free object exactly where it was', () => {
    expect(byId('free')).toMatchObject({ x: 700, y: 480, w: 200, h: 40 })
    expect(byId('free').role).toBeUndefined()
  })

  it('records the layout on the slide', () => {
    expect(next.slides[0].layoutId).toBe('title-content')
  })

  it('never drops an element', () => {
    expect(next.slides[0].elements).toHaveLength(3)
  })

  it('leaves other slides untouched', () => {
    const two = { ...body, slides: [body.slides[0], createSlide({ id: 's2' })] }
    const out = applyLayoutPlan(two, 0, plan, tokens)
    expect(out.slides[1]).toBe(two.slides[1])
  })
})

describe('overrides', () => {
  const layout = layoutById('title-content')!
  const ph = layout.placeholders.find((p) => p.role === 'title')!

  const onSpec = createTextElement({
    id: 't',
    role: 'title',
    x: ph.x,
    y: ph.y,
    w: ph.w,
    h: ph.h,
    fontSize: tokens.titleSize,
    align: ph.align ?? 'left',
  })

  it('sees nothing to report when the element sits on its placeholder', () => {
    expect(placeholderOverrides(onSpec, ph, tokens)).toEqual([])
  })

  it('names each property that has moved away', () => {
    const moved = { ...onSpec, x: onSpec.x + 40, fontSize: 12 }
    expect(placeholderOverrides(moved, ph, tokens).sort()).toEqual(['fontSize', 'x'])
  })

  it('reverts one property and leaves the others alone', () => {
    const moved = { ...onSpec, x: onSpec.x + 40, fontSize: 12 }
    const reverted = revertOverride(moved, ph, tokens, 'x')
    expect(reverted.x).toBe(ph.x)
    expect(reverted.kind === 'text' && reverted.fontSize).toBe(12)
  })

  it('reverts the type size back to the token', () => {
    const moved = { ...onSpec, fontSize: 9 }
    const reverted = revertOverride(moved, ph, tokens, 'fontSize')
    expect(reverted.kind === 'text' && reverted.fontSize).toBe(tokens.titleSize)
  })

  it('finds the placeholder an element is bound to, and none for a free one', () => {
    expect(placeholderFor('title-content', onSpec)?.role).toBe('title')
    expect(placeholderFor('title-content', createTextElement({ id: 'x' }))).toBeNull()
  })
})

describe('placeholderFontSize', () => {
  it('reads the scale from the tokens so a master restyles every slide at once', () => {
    const big = { ...tokens, titleSize: 60 }
    const ph = layoutById('title-content')!.placeholders[0]
    expect(placeholderFontSize(ph, tokens)).toBe(tokens.titleSize)
    expect(placeholderFontSize(ph, big)).toBe(60)
  })
})
