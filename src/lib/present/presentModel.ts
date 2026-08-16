import { nid } from '@/lib/id'
import type { ThemeTokenOverride } from './theme'
import { sanitizeTokens } from './theme'
import type { PlaceholderRole } from './layouts'
import type { JSONContent } from '@tiptap/core'
import { sanitizeAdjustments, type Crop, type FocalPoint, type ImageAdjustments, type ImageFit } from './media'
import { sanitizeLinkRef, type LinkRef } from './linked'
import type { ChartData } from './sheetRange'
import type { AutoSizeMode } from './overflow'
import {
  sanitizeTextStyles,
  TEXT_STYLE_NAMES,
  type DeckTextStyles,
  type TextStyleName,
  type TextStyleSpec,
} from './textStyles'
import { migrateMasters, type PresentMaster } from './masters'

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
 * and image `alt`. v2 → v3 (19E.1): sections, hidden slides, review status.
 * v3 → v4 (19E.2): theme tokens, masters, slide `masterId`/`layoutId` and
 * element `role`. v4 → v5 (19E.3): structured text (`doc`), named text styles
 * and box typography. v5 → v6 (19E.4): media metadata and assets by
 * reference, table and chart elements, and a link record any element may
 * carry. Every addition is optional, so a body of any version loads unchanged
 * and renders exactly as it did.
 */
export const PRESENT_BODY_VERSION = 6

export type PresentTheme = 'plain' | 'ink' | 'accent'

/**
 * A named group of slides in the rail (19E.1).
 *
 * Order is NOT stored here. The deck's `slides` array remains the single
 * ordered list, and a slide points at its section — so a section and the deck
 * can never disagree about where a slide sits, which is the failure mode a
 * `slideIds` array on the section would invite. The rail groups consecutive
 * runs, and the section operations keep those runs contiguous.
 */
export interface PresentSection {
  id: string
  title: string
  /** collapsed in the rail; purely a view preference, but a persisted one */
  collapsed?: boolean
}

/** Editorial state of a slide, shown in the rail (19E.1). */
export type SlideReviewStatus = 'draft' | 'review' | 'approved'

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
  /**
   * The layout placeholder this element fills (19E.2). It is what makes a
   * layout change non-destructive: the title knows it is the title, so it
   * lands in the new layout's title rather than wherever the old one sat.
   */
  role?: PlaceholderRole
  /**
   * Where this element's content came from, when it came from somewhere
   * (19E.4). Any element may carry one — a picture, a chart, a group of
   * shapes pasted from a board.
   */
  linkRef?: LinkRef
}

export interface TextElement extends PresentElementBase {
  kind: 'text'
  /**
   * The plain projection of `doc`, kept in step with it on every edit. The
   * digest, search and any exporter that cannot carry formatting read this,
   * so they never have to walk a document — and it is what a pre-19E.3 body
   * has instead of one.
   */
  text: string
  fontSize: number
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right'
  color: string | null // null → theme text color
  /** structured rich text (19E.3); absent on anything written before it */
  doc?: JSONContent
  /** the named style this box follows (19E.3) */
  styleRef?: TextStyleName
  /** what it changes about that style — a key here IS the override */
  styleOverride?: TextStyleSpec
  /** vertical placement inside the box (19E.3) */
  valign?: 'top' | 'middle' | 'bottom'
  /** inner padding in slide px (19E.3) */
  padding?: number
  /** what happens when the text does not fit (19E.3) */
  autoSize?: AutoSizeMode
}

export interface ImageElement extends PresentElementBase {
  kind: 'image'
  /**
   * data URL — still the fallback, so a deck stays self-contained through
   * export, import and Drive. `assetId` is preferred when present.
   */
  src: string
  /** alternative text for accessibility + export descr (Phase 1 field) */
  alt?: string
  /** the asset this picture really is (19E.4); resolved through the registry */
  assetId?: string
  /** all display-time metadata: the stored asset is never rewritten */
  crop?: Crop
  focalPoint?: FocalPoint
  adjustments?: ImageAdjustments
  fit?: ImageFit
  radius?: number
}

/** A grid of text on a slide (19E.4). */
export interface TableElement extends PresentElementBase {
  kind: 'table'
  /** rows of display strings; ragged rows are padded on read */
  cells: string[][]
  /** draw the first row as a header */
  headerRow?: boolean
}

/** A chart drawn from cached data, usually read from a sheet range (19E.4). */
export interface ChartElement extends PresentElementBase {
  kind: 'chart'
  chart: 'bar' | 'line'
  /**
   * The data as captured. A deck renders from this, never from a live read —
   * which is what makes a presentation immune to a source changing under it.
   */
  data: ChartData
  title?: string
  showLegend?: boolean
  showValues?: boolean
}

export interface ShapeElement extends PresentElementBase {
  kind: 'shape'
  shape: 'rect' | 'ellipse' | 'line'
  fill: string | null
  stroke: string | null
  strokeWidth: number
}

export type PresentElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | TableElement
  | ChartElement

export interface PresentSlide {
  id: string
  /** CSS color; null → theme background */
  background: string | null
  notes: string
  elements: PresentElement[]
  /** the section this slide belongs to, if any (19E.1) */
  sectionId?: string
  /**
   * Kept in the deck, left out of the presentation (19E.1). Hidden slides
   * still edit and still export nothing — see `presentableSlides`.
   */
  hidden?: boolean
  /** editorial state; absent means nobody has said (19E.1) */
  reviewStatus?: SlideReviewStatus
  /** the master whose design this slide inherits (19E.2) */
  masterId?: string
  /** the layout this slide was last arranged with (19E.2) */
  layoutId?: string
}

export interface PresentationBody {
  app: 'lattice-present'
  version: number
  theme: PresentTheme
  slides: PresentSlide[]
  /** rail sections; absent on decks that never made one (19E.1) */
  sections?: PresentSection[]
  /** deck-level overrides of the theme preset's tokens (19E.2) */
  tokens?: ThemeTokenOverride
  /** the deck's masters; absent means every slide follows the deck (19E.2) */
  masters?: PresentMaster[]
  /** the deck's named text styles (19E.3) */
  textStyles?: DeckTextStyles
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
const AUTOSIZE_MODES = ['overflow', 'shrink', 'grow', 'clip']
const VALIGNS = ['top', 'middle', 'bottom']

function migrateElement(raw: unknown): PresentElement | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  // 19E.3 fields: a value the renderer could not use is dropped, and the
  // element falls back to its style — never to a broken layout
  const styleRef = TEXT_STYLE_NAMES.includes(e.styleRef as TextStyleName)
    ? (e.styleRef as TextStyleName)
    : undefined
  const rich = {
    doc: e.doc && typeof e.doc === 'object' ? (e.doc as JSONContent) : undefined,
    styleRef,
    styleOverride:
      e.styleOverride && typeof e.styleOverride === 'object'
        ? (e.styleOverride as TextStyleSpec)
        : undefined,
    valign: VALIGNS.includes(e.valign as string) ? (e.valign as 'top') : undefined,
    autoSize: AUTOSIZE_MODES.includes(e.autoSize as string) ? (e.autoSize as AutoSizeMode) : undefined,
  }
  // 19E.4: display-time media metadata and the link record, both sanitised so
  // a corrupt body can never produce an unpaintable picture or a dangling tie
  const media =
    e.kind === 'image'
      ? {
          adjustments: sanitizeAdjustments(e.adjustments),
          crop: e.crop && typeof e.crop === 'object' ? (e.crop as Crop) : undefined,
          assetId: typeof e.assetId === 'string' && e.assetId ? (e.assetId as string) : undefined,
        }
      : {}
  return {
    ...(e as unknown as PresentElement),
    ...(e.kind === 'text' ? rich : {}),
    ...media,
    linkRef: sanitizeLinkRef(e.linkRef),
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
  const review = s.reviewStatus
  return {
    ...(s as object),
    id: typeof s.id === 'string' && s.id ? (s.id as string) : nid('slide'),
    background: typeof s.background === 'string' ? (s.background as string) : null,
    notes: typeof s.notes === 'string' ? (s.notes as string) : '',
    elements,
    sectionId: typeof s.sectionId === 'string' && s.sectionId ? (s.sectionId as string) : undefined,
    masterId: typeof s.masterId === 'string' && s.masterId ? (s.masterId as string) : undefined,
    // Kept as written rather than validated against the layout catalogue:
    // `layouts.ts` reads SLIDE_W from this module, so importing it back here
    // would be a load-time cycle. An id that matches no layout resolves to
    // null everywhere it is read, which is the same outcome without the cycle.
    layoutId: typeof s.layoutId === 'string' && s.layoutId ? (s.layoutId as string) : undefined,
    hidden: s.hidden === true ? true : undefined,
    reviewStatus: REVIEW_STATUSES.includes(review as SlideReviewStatus)
      ? (review as SlideReviewStatus)
      : undefined,
  } as PresentSlide
}

/**
 * Versioned migration runner (Phase 0). Accepts whatever storage returns and
 * always yields a valid, current-version body. It **never discards unknown
 * fields** (deck-, slide- and element-level spreads preserve them), so a body
 * written by a newer build round-trips through an older one without data loss.
 */
const REVIEW_STATUSES: SlideReviewStatus[] = ['draft', 'review', 'approved']

/**
 * Repair the section list (v3): keep only well-formed entries with unique ids.
 * A section is a label, so a missing title is survivable — a missing id is not,
 * because slides point at it.
 */
function migrateSections(raw: unknown): PresentSection[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const seen = new Set<string>()
  const out: PresentSection[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const s = item as Record<string, unknown>
    const id = typeof s.id === 'string' ? s.id : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({
      ...(s as object),
      id,
      title: typeof s.title === 'string' ? s.title : 'Section',
      collapsed: s.collapsed === true ? true : undefined,
    } as PresentSection)
  }
  return out.length ? out : undefined
}

export function migratePresentBody(raw: unknown): PresentationBody {
  const b = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!b || b.app !== 'lattice-present' || !Array.isArray(b.slides) || b.slides.length === 0) {
    return createPresentBody()
  }
  const sections = migrateSections(b.sections)
  const masters = migrateMasters(b.masters)
  const knownSections = new Set(sections?.map((s) => s.id))
  const knownMasters = new Set(masters?.map((m) => m.id))
  // a slide pointing at something that no longer exists falls back to the
  // deck's own design rather than disappearing: the rail must never lose a
  // slide, and a missing master must not make one unpaintable
  const slides = b.slides.map(migrateSlide).map((s) => {
    let next = s
    if (next.sectionId && !knownSections.has(next.sectionId)) {
      next = { ...next, sectionId: undefined }
    }
    if (next.masterId && !knownMasters.has(next.masterId)) {
      next = { ...next, masterId: undefined }
    }
    return next
  })
  const tokens = sanitizeTokens(b.tokens)
  const textStyles = sanitizeTextStyles(b.textStyles)
  return {
    ...(b as object),
    app: 'lattice-present',
    version: PRESENT_BODY_VERSION,
    theme: typeof b.theme === 'string' && b.theme in THEME_COLORS ? (b.theme as PresentTheme) : 'plain',
    slides,
    ...(sections ? { sections } : {}),
    ...(tokens ? { tokens } : {}),
    ...(masters ? { masters } : {}),
    ...(textStyles ? { textStyles } : {}),
  } as PresentationBody
}

/**
 * Accept whatever storage returns; always produce a valid body.
 * Kept as the stable public name; delegates to the migration runner.
 */
export function normalizePresentBody(raw: unknown): PresentationBody {
  return migratePresentBody(raw)
}
