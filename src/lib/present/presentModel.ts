import { nid } from '@/lib/id'

/**
 * Presentation model (Phase 8) — the internal JSON source format.
 *
 * A deck is a list of slides on a fixed 960×540 canvas; each slide holds
 * absolutely-positioned elements (text boxes, images, shapes) with a
 * z-order, a background and speaker notes. This is the canonical format:
 * PDF/PPTX exports and PPTX/ODP imports all go through it.
 */

export const SLIDE_W = 960
export const SLIDE_H = 540

export type PresentTheme = 'plain' | 'ink' | 'accent'

export interface PresentElementBase {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** paint order inside the slide (low first) */
  z: number
}

export interface TextElement extends PresentElementBase {
  kind: 'text'
  text: string
  fontSize: number
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right'
  color: string | null // null → theme text color
}

export interface ImageElement extends PresentElementBase {
  kind: 'image'
  /** data URL (self-contained decks survive export/import/Drive) */
  src: string
}

export interface ShapeElement extends PresentElementBase {
  kind: 'shape'
  shape: 'rect' | 'ellipse' | 'line'
  fill: string | null
  stroke: string | null
  strokeWidth: number
}

export type PresentElement = TextElement | ImageElement | ShapeElement

export interface PresentSlide {
  id: string
  /** CSS color; null → theme background */
  background: string | null
  notes: string
  elements: PresentElement[]
}

export interface PresentationBody {
  app: 'lattice-present'
  version: 1
  theme: PresentTheme
  slides: PresentSlide[]
}

export const THEME_COLORS: Record<
  PresentTheme,
  { bg: string; text: string; accent: string }
> = {
  plain: { bg: '#ffffff', text: '#1f1f24', accent: '#0d99ff' },
  ink: { bg: '#17181c', text: '#f0f1f4', accent: '#5ab8ff' },
  accent: { bg: '#0d2b45', text: '#f0f6ff', accent: '#ffcd29' },
}

export function createSlide(partial: Partial<PresentSlide> = {}): PresentSlide {
  return { id: nid('slide'), background: null, notes: '', elements: [], ...partial }
}

export function createTextElement(partial: Partial<TextElement> = {}): TextElement {
  return {
    id: nid('el'),
    kind: 'text',
    x: 120,
    y: 120,
    w: 480,
    h: 100,
    z: 0,
    text: 'Text',
    fontSize: 28,
    bold: false,
    italic: false,
    align: 'left',
    color: null,
    ...partial,
  }
}

export function createTitleSlide(title: string): PresentSlide {
  return createSlide({
    elements: [
      createTextElement({
        x: 80,
        y: 200,
        w: 800,
        h: 90,
        text: title,
        fontSize: 48,
        bold: true,
        align: 'center',
      }),
      createTextElement({
        x: 80,
        y: 300,
        w: 800,
        h: 50,
        text: 'Subtitle',
        fontSize: 22,
        align: 'center',
        color: '#888888',
      }),
    ],
  })
}

export function createPresentBody(title = 'Untitled presentation'): PresentationBody {
  return {
    app: 'lattice-present',
    version: 1,
    theme: 'plain',
    slides: [createTitleSlide(title)],
  }
}

/** Digest for metadata: slide count + first text lines. */
export function digestPresentation(body: PresentationBody): {
  slideCount: number
  snippet: string
} {
  const texts: string[] = []
  for (const slide of body.slides) {
    for (const el of slide.elements) {
      if (el.kind === 'text' && el.text.trim()) texts.push(el.text.trim())
      if (texts.length >= 4) break
    }
    if (texts.length >= 4) break
  }
  return {
    slideCount: body.slides.length,
    snippet: texts.join(' · ').slice(0, 160),
  }
}

/** Accept whatever storage returns; always produce a valid body. */
export function normalizePresentBody(raw: unknown): PresentationBody {
  const b = raw as Partial<PresentationBody> | undefined
  if (b?.app === 'lattice-present' && Array.isArray(b.slides) && b.slides.length) {
    return {
      app: 'lattice-present',
      version: 1,
      theme: b.theme && b.theme in THEME_COLORS ? b.theme : 'plain',
      slides: b.slides.map((s) => ({
        id: s.id || nid('slide'),
        background: s.background ?? null,
        notes: s.notes ?? '',
        elements: Array.isArray(s.elements) ? s.elements : [],
      })),
    }
  }
  return createPresentBody()
}
