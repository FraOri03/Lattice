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

/**
 * Body schema version. Bumped when the shape grows; `migratePresentBody`
 * upgrades older bodies and never drops unknown fields (Phase 0). v1 → v2
 * (Phase 1): additive optional element fields (rotation/opacity/locked/hidden)
 * and image `alt` — none required, so v1 bodies load unchanged.
 */
export const PRESENT_BODY_VERSION = 2

export type PresentTheme = 'plain' | 'ink' | 'accent'

export interface PresentElementBase {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** paint order inside the slide (low first) */
  z: number
  /** clockwise rotation in degrees (Phase 1); absent = 0 */
  rotation?: number
  /** 0..1 element opacity (Phase 1); absent = 1 */
  opacity?: number
  /** locked elements can't be selected/moved on the canvas (Phase 1) */
  locked?: boolean
  /** hidden elements don't render on the slide/thumbnail (Phase 1) */
  hidden?: boolean
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
  /** alternative text for accessibility + export descr (Phase 1 field) */
  alt?: string
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
  version: number
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
    version: PRESENT_BODY_VERSION,
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

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const num = (v: unknown, fallback: number): number => (isFiniteNumber(v) ? v : fallback)

/**
 * Repair one element: guarantee a valid id + finite geometry so a corrupt or
 * legacy body can never produce malformed geometry (audit §19 / DM-8), while
 * **preserving every other field** — including unknown ones from a future
 * schema — via the spread. Returns null only for non-objects.
 */
function migrateElement(raw: unknown): PresentElement | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  return {
    ...(e as unknown as PresentElement),
    id: typeof e.id === 'string' && e.id ? (e.id as string) : nid('el'),
    x: num(e.x, 0),
    y: num(e.y, 0),
    w: Math.max(1, num(e.w, 100)),
    h: Math.max(1, num(e.h, 40)),
    z: num(e.z, 0),
  }
}

/** Repair one slide, preserving unknown slide-level fields (layoutId, etc.). */
function migrateSlide(raw: unknown): PresentSlide {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const elements = Array.isArray(s.elements)
    ? (s.elements.map(migrateElement).filter(Boolean) as PresentElement[])
    : []
  return {
    ...(s as object),
    id: typeof s.id === 'string' && s.id ? (s.id as string) : nid('slide'),
    background: typeof s.background === 'string' ? (s.background as string) : null,
    notes: typeof s.notes === 'string' ? (s.notes as string) : '',
    elements,
  } as PresentSlide
}

/**
 * Versioned migration runner (Phase 0). Accepts whatever storage returns and
 * always yields a valid, current-version body. It **never discards unknown
 * fields** (deck-, slide- and element-level spreads preserve them), so a body
 * written by a newer build round-trips through an older one without data loss.
 */
export function migratePresentBody(raw: unknown): PresentationBody {
  const b = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!b || b.app !== 'lattice-present' || !Array.isArray(b.slides) || b.slides.length === 0) {
    return createPresentBody()
  }
  return {
    ...(b as object),
    app: 'lattice-present',
    version: PRESENT_BODY_VERSION,
    theme: typeof b.theme === 'string' && b.theme in THEME_COLORS ? (b.theme as PresentTheme) : 'plain',
    slides: b.slides.map(migrateSlide),
  } as PresentationBody
}

/**
 * Accept whatever storage returns; always produce a valid body.
 * Kept as the stable public name; delegates to the migration runner.
 */
export function normalizePresentBody(raw: unknown): PresentationBody {
  return migratePresentBody(raw)
}
