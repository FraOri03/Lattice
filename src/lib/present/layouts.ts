import type { PresentElement, PresentationBody } from './presentModel'
import { SLIDE_H, SLIDE_W } from './presentModel'
import type { ThemeTokens } from './theme'

/**
 * Layouts (19E.2) — semantic placeholder sets, not arrangements of boxes.
 *
 * A layout says "this slide has a title, a body and a picture, and here is
 * where each belongs". Applying one **remaps content by role**: the title
 * stays the title, the body moves into the body, and anything that matches no
 * placeholder keeps its exact geometry and is reported as a free object.
 *
 * Nothing here mutates: `planLayout` computes what would happen so the editor
 * can show it before committing, and `applyLayoutPlan` turns an approved plan
 * into a new body in one step.
 */

export type PlaceholderRole =
  | 'title'
  | 'subtitle'
  | 'body'
  | 'bodyAlt'
  | 'media'
  | 'quote'
  | 'attribution'
  | 'caption'

/** Which token drives a placeholder's type size. */
export type PlaceholderScale = 'title' | 'heading' | 'body' | 'caption'

export interface Placeholder {
  role: PlaceholderRole
  kind: 'text' | 'image'
  x: number
  y: number
  w: number
  h: number
  scale?: PlaceholderScale
  align?: 'left' | 'center' | 'right'
}

export interface LayoutSpec {
  id: string
  name: string
  placeholders: Placeholder[]
}

const M = 64 // slide margin
const CONTENT_W = SLIDE_W - M * 2

const text = (
  role: PlaceholderRole,
  x: number,
  y: number,
  w: number,
  h: number,
  scale: PlaceholderScale,
  align: Placeholder['align'] = 'left',
): Placeholder => ({ role, kind: 'text', x, y, w, h, scale, align })

const media = (x: number, y: number, w: number, h: number): Placeholder => ({
  role: 'media',
  kind: 'image',
  x,
  y,
  w,
  h,
})

/**
 * The catalogue. Ten layouts covering the shapes a deck actually needs, all
 * on the same 64px margin so slides line up when you page through them.
 */
export const LAYOUTS: LayoutSpec[] = [
  {
    id: 'title-slide',
    name: 'Title slide',
    placeholders: [
      text('title', M, 190, CONTENT_W, 96, 'title', 'center'),
      text('subtitle', M, 296, CONTENT_W, 48, 'body', 'center'),
    ],
  },
  {
    id: 'title-content',
    name: 'Title + content',
    placeholders: [
      text('title', M, 52, CONTENT_W, 70, 'title'),
      text('body', M, 150, CONTENT_W, 300, 'body'),
    ],
  },
  {
    id: 'two-column',
    name: 'Two column',
    placeholders: [
      text('title', M, 52, CONTENT_W, 70, 'title'),
      text('body', M, 150, 380, 250, 'body'),
      text('bodyAlt', 516, 150, 380, 250, 'body'),
    ],
  },
  {
    id: 'section',
    name: 'Section',
    placeholders: [text('title', M, 220, CONTENT_W, 100, 'title', 'left')],
  },
  {
    id: 'comparison',
    name: 'Comparison',
    placeholders: [
      text('title', M, 52, CONTENT_W, 70, 'title'),
      text('body', M, 150, 380, 250, 'body'),
      text('bodyAlt', 516, 150, 380, 250, 'body'),
      text('caption', M, 420, CONTENT_W, 40, 'caption'),
    ],
  },
  {
    id: 'image-full',
    name: 'Image full bleed',
    placeholders: [
      media(0, 0, SLIDE_W, SLIDE_H),
      text('title', M, 400, CONTENT_W, 80, 'title'),
    ],
  },
  {
    id: 'image-text',
    name: 'Image + text',
    placeholders: [
      media(0, 0, 460, SLIDE_H),
      text('title', 516, 120, 380, 70, 'heading'),
      text('body', 516, 210, 380, 210, 'body'),
    ],
  },
  {
    id: 'quote',
    name: 'Quote',
    placeholders: [
      text('quote', 120, 170, SLIDE_W - 240, 140, 'heading', 'center'),
      text('attribution', 120, 330, SLIDE_W - 240, 40, 'caption', 'center'),
    ],
  },
  {
    id: 'data',
    name: 'Data',
    placeholders: [
      text('title', M, 52, CONTENT_W, 70, 'title'),
      media(M, 150, CONTENT_W, 300),
    ],
  },
  { id: 'blank', name: 'Blank', placeholders: [] },
]

export const layoutById = (id: string | undefined): LayoutSpec | null =>
  LAYOUTS.find((l) => l.id === id) ?? null

/** The font size a placeholder implies, given the tokens in force. */
export function placeholderFontSize(ph: Placeholder, tokens: ThemeTokens): number {
  switch (ph.scale) {
    case 'title':
      return tokens.titleSize
    case 'heading':
      return tokens.headingSize
    case 'caption':
      return tokens.captionSize
    default:
      return tokens.bodySize
  }
}

/* ---------- planning ---------- */

export interface LayoutAssignment {
  elementId: string
  role: PlaceholderRole
  /** what the element looks like now, so a preview can show the difference */
  from: { x: number; y: number; w: number; h: number }
  to: { x: number; y: number; w: number; h: number }
}

export interface LayoutPlan {
  layout: LayoutSpec
  assignments: LayoutAssignment[]
  /** elements that match no placeholder; they keep their exact geometry */
  freeElementIds: string[]
  /** placeholders nothing filled — the slide will simply not have them */
  emptyRoles: PlaceholderRole[]
}

const rectOf = (e: PresentElement) => ({ x: e.x, y: e.y, w: e.w, h: e.h })

/**
 * Work out how a slide's content would land in a layout.
 *
 * Order matters, and it is deliberate:
 *   1. an element that already knows its role claims that placeholder;
 *   2. the remaining text fills the remaining text placeholders in reading
 *      order, biggest type first, so the slide's own title stays the title;
 *   3. images fill media placeholders;
 *   4. whatever is left is free, and is never moved.
 */
export function planLayout(
  body: PresentationBody,
  slideIndex: number,
  layoutId: string,
): LayoutPlan | null {
  const slide = body.slides[slideIndex]
  const layout = layoutById(layoutId)
  if (!slide || !layout) return null

  const open = [...layout.placeholders]
  const assignments: LayoutAssignment[] = []
  const taken = new Set<string>()

  const claim = (el: PresentElement, phIndex: number) => {
    const ph = open[phIndex]
    open.splice(phIndex, 1)
    taken.add(el.id)
    assignments.push({
      elementId: el.id,
      role: ph.role,
      from: rectOf(el),
      to: { x: ph.x, y: ph.y, w: ph.w, h: ph.h },
    })
  }

  // 1. elements that already carry a role
  for (const el of slide.elements) {
    if (!el.role) continue
    const i = open.findIndex((p) => p.role === el.role)
    if (i >= 0) claim(el, i)
  }

  // 2. text, biggest first — a slide's largest line is its title
  const looseText = slide.elements
    .filter((e) => e.kind === 'text' && !taken.has(e.id))
    .sort((a, b) => {
      const size = (e: PresentElement) => (e.kind === 'text' ? e.fontSize : 0)
      return size(b) - size(a) || a.y - b.y
    })
  for (const el of looseText) {
    const i = open.findIndex((p) => p.kind === 'text')
    if (i >= 0) claim(el, i)
  }

  // 3. images into media
  for (const el of slide.elements) {
    if (el.kind !== 'image' || taken.has(el.id)) continue
    const i = open.findIndex((p) => p.kind === 'image')
    if (i >= 0) claim(el, i)
  }

  return {
    layout,
    assignments,
    freeElementIds: slide.elements.filter((e) => !taken.has(e.id)).map((e) => e.id),
    emptyRoles: open.map((p) => p.role),
  }
}

/**
 * Commit a plan. Assigned elements take their placeholder's geometry, type
 * size and alignment, and are stamped with the role so a later layout change
 * knows where they belong. Free objects are returned untouched — that is the
 * whole promise of "non-destructive".
 */
export function applyLayoutPlan(
  body: PresentationBody,
  slideIndex: number,
  plan: LayoutPlan,
  tokens: ThemeTokens,
): PresentationBody {
  const byId = new Map(plan.assignments.map((a) => [a.elementId, a]))
  const phByRole = new Map(plan.layout.placeholders.map((p) => [p.role, p]))

  return {
    ...body,
    slides: body.slides.map((s, i) => {
      if (i !== slideIndex) return s
      return {
        ...s,
        layoutId: plan.layout.id,
        elements: s.elements.map((el) => {
          const a = byId.get(el.id)
          if (!a) return el
          const ph = phByRole.get(a.role)!
          const next: PresentElement = { ...el, ...a.to, role: a.role }
          if (next.kind === 'text') {
            next.fontSize = placeholderFontSize(ph, tokens)
            if (ph.align) next.align = ph.align
          }
          return next
        }),
      }
    }),
  }
}

/* ---------- overrides ---------- */

export type OverrideKey = 'x' | 'y' | 'w' | 'h' | 'fontSize' | 'align'

/**
 * Which properties this element has moved away from its placeholder. An
 * override is a fact to be shown, not an error — but it has to be visible,
 * and reverting one must not disturb the others.
 */
export function placeholderOverrides(
  el: PresentElement,
  ph: Placeholder,
  tokens: ThemeTokens,
): OverrideKey[] {
  const out: OverrideKey[] = []
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5
  if (!near(el.x, ph.x)) out.push('x')
  if (!near(el.y, ph.y)) out.push('y')
  if (!near(el.w, ph.w)) out.push('w')
  if (!near(el.h, ph.h)) out.push('h')
  if (el.kind === 'text') {
    if (!near(el.fontSize, placeholderFontSize(ph, tokens))) out.push('fontSize')
    if (ph.align && el.align !== ph.align) out.push('align')
  }
  return out
}

/** Put one overridden property back to what the placeholder says. */
export function revertOverride(
  el: PresentElement,
  ph: Placeholder,
  tokens: ThemeTokens,
  key: OverrideKey,
): PresentElement {
  switch (key) {
    case 'x':
    case 'y':
    case 'w':
    case 'h':
      return { ...el, [key]: ph[key] }
    case 'fontSize':
      return el.kind === 'text' ? { ...el, fontSize: placeholderFontSize(ph, tokens) } : el
    case 'align':
      return el.kind === 'text' && ph.align ? { ...el, align: ph.align } : el
  }
}

/** The placeholder an element is bound to on its slide, if any. */
export function placeholderFor(
  layoutId: string | undefined,
  el: PresentElement,
): Placeholder | null {
  if (!el.role) return null
  return layoutById(layoutId)?.placeholders.find((p) => p.role === el.role) ?? null
}

export const OVERRIDE_LABEL: Record<OverrideKey, string> = {
  x: 'X',
  y: 'Y',
  w: 'Width',
  h: 'Height',
  fontSize: 'Text size',
  align: 'Alignment',
}
