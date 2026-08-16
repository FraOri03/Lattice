import type { ThemeTokens } from './theme'

/**
 * Named text styles (19E.3).
 *
 * A styled element stores **only what it changes**. Everything else is read
 * from the style at render time, which is what makes "edit the style and every
 * linked element updates" true by construction rather than by a fan-out that
 * has to walk the deck and can miss one — and it is one history entry, because
 * it is one patch to one object.
 *
 * It is the same shape as master token overrides: an override is a key that
 * exists, and reverting is deleting it, never pinning it to the value it
 * happened to inherit.
 */

export type TextStyleName = 'title' | 'heading' | 'body' | 'caption'

export const TEXT_STYLE_NAMES: TextStyleName[] = ['title', 'heading', 'body', 'caption']

export interface TextStyleSpec {
  fontFamily?: string
  /** 100–900 */
  weight?: number
  size?: number
  lineHeight?: number
  /** em, so it scales with the type */
  letterSpacing?: number
  color?: string
  align?: 'left' | 'center' | 'right'
}

export type ResolvedTextStyle = Required<Omit<TextStyleSpec, 'color'>> & { color: string }

/**
 * What each style means before anyone edits it: sizes come from the deck's
 * tokens, so a master that changes its type scale moves every style with it.
 */
export function defaultTextStyle(name: TextStyleName, tokens: ThemeTokens): ResolvedTextStyle {
  const base = { fontFamily: tokens.fontFamily, align: 'left' as const, letterSpacing: 0 }
  switch (name) {
    case 'title':
      return { ...base, weight: 700, size: tokens.titleSize, lineHeight: 1.15, letterSpacing: -0.01, color: tokens.text }
    case 'heading':
      return { ...base, weight: 600, size: tokens.headingSize, lineHeight: 1.2, color: tokens.text }
    case 'caption':
      return { ...base, weight: 500, size: tokens.captionSize, lineHeight: 1.4, color: tokens.textMuted }
    default:
      return { ...base, weight: 400, size: tokens.bodySize, lineHeight: 1.5, color: tokens.text }
  }
}

export type DeckTextStyles = Partial<Record<TextStyleName, TextStyleSpec>>

/** The style as the deck defines it: defaults, then the deck's own changes. */
export function resolveTextStyle(
  name: TextStyleName,
  tokens: ThemeTokens,
  deckStyles: DeckTextStyles | undefined,
): ResolvedTextStyle {
  return { ...defaultTextStyle(name, tokens), ...(deckStyles?.[name] ?? {}) }
}

/** What a styled element actually renders with: its style, then its overrides. */
export function resolveElementStyle(
  el: { styleRef?: TextStyleName; styleOverride?: TextStyleSpec },
  tokens: ThemeTokens,
  deckStyles: DeckTextStyles | undefined,
): ResolvedTextStyle | null {
  if (!el.styleRef) return null
  return { ...resolveTextStyle(el.styleRef, tokens, deckStyles), ...(el.styleOverride ?? {}) }
}

/** Everything a renderer needs to draw one text box, already resolved. */
export interface TextRender {
  fontFamily: string
  weight: number
  size: number
  lineHeight: number
  letterSpacing: number
  color: string
  align: 'left' | 'center' | 'right'
  valign: 'top' | 'middle' | 'bottom'
  padding: number
}

/**
 * The one place that decides what a text box looks like.
 *
 * A box with a style reads from it; a box without one keeps the flat fields it
 * has always had, so nothing written before 19E.3 changes appearance. Both
 * paths end in the same shape, so the canvas, the thumbnails and the exporters
 * cannot disagree about a slide.
 */
export function resolveTextRender(
  el: {
    fontSize: number
    bold: boolean
    italic: boolean
    /** present once the box holds structured text */
    doc?: unknown
    align: 'left' | 'center' | 'right'
    color: string | null
    styleRef?: TextStyleName
    styleOverride?: TextStyleSpec
    valign?: 'top' | 'middle' | 'bottom'
    padding?: number
  },
  tokens: ThemeTokens,
  deckStyles: DeckTextStyles | undefined,
): TextRender {
  const style = resolveElementStyle(el, tokens, deckStyles)
  return {
    fontFamily: style?.fontFamily ?? tokens.fontFamily,
    /**
     * Once a box holds a document, its runs own their marks: `bold` was
     * migrated onto them, so keeping it on the container too would make a
     * run that turns bold OFF still render bold.
     */
    weight: style?.weight ?? (el.doc ? 400 : el.bold ? 700 : 400),
    size: style?.size ?? el.fontSize,
    lineHeight: style?.lineHeight ?? 1.25,
    letterSpacing: style?.letterSpacing ?? 0,
    // an element colour always wins: it is the more specific decision
    color: el.color ?? style?.color ?? tokens.text,
    align: el.styleRef ? (el.styleOverride?.align ?? style?.align ?? el.align) : el.align,
    valign: el.valign ?? 'top',
    padding: el.padding ?? 0,
  }
}

/** Which properties this element overrides on its style — the visible badge. */
export function textStyleOverrides(el: { styleOverride?: TextStyleSpec | undefined }): (keyof TextStyleSpec)[] {
  return Object.keys(el.styleOverride ?? {}) as (keyof TextStyleSpec)[]
}

/**
 * Set or clear one override. `undefined` deletes the key, which is how the
 * element goes back to following its style.
 */
export function withStyleOverride<K extends keyof TextStyleSpec>(
  override: TextStyleSpec | undefined,
  key: K,
  value: TextStyleSpec[K] | undefined,
): TextStyleSpec | undefined {
  const next = { ...(override ?? {}) }
  if (value === undefined) delete next[key]
  else next[key] = value
  return Object.keys(next).length ? next : undefined
}

/** Keep only well-formed style values when loading a body. */
export function sanitizeTextStyles(raw: unknown): DeckTextStyles | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: DeckTextStyles = {}
  for (const name of TEXT_STYLE_NAMES) {
    const spec = (raw as Record<string, unknown>)[name]
    if (!spec || typeof spec !== 'object') continue
    const s = spec as Record<string, unknown>
    const clean: TextStyleSpec = {}
    if (typeof s.fontFamily === 'string' && s.fontFamily.trim()) clean.fontFamily = s.fontFamily
    if (typeof s.weight === 'number' && s.weight >= 100 && s.weight <= 900) clean.weight = s.weight
    if (typeof s.size === 'number' && Number.isFinite(s.size) && s.size > 0) clean.size = s.size
    if (typeof s.lineHeight === 'number' && s.lineHeight > 0) clean.lineHeight = s.lineHeight
    if (typeof s.letterSpacing === 'number' && Number.isFinite(s.letterSpacing)) {
      clean.letterSpacing = s.letterSpacing
    }
    if (typeof s.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(s.color)) clean.color = s.color
    if (s.align === 'left' || s.align === 'center' || s.align === 'right') clean.align = s.align
    if (Object.keys(clean).length) out[name] = clean
  }
  return Object.keys(out).length ? out : undefined
}

export const TEXT_STYLE_LABEL: Record<TextStyleName, string> = {
  title: 'Title',
  heading: 'Heading',
  body: 'Body',
  caption: 'Caption',
}

export const STYLE_PROP_LABEL: Record<keyof TextStyleSpec, string> = {
  fontFamily: 'Font',
  weight: 'Weight',
  size: 'Size',
  lineHeight: 'Line height',
  letterSpacing: 'Tracking',
  color: 'Colour',
  align: 'Alignment',
}

/**
 * Fonts a local-first deck may use: everything here is already on the machine.
 * No webfont is fetched, so a deck renders the same offline as online.
 */
export const SAFE_FONTS: { label: string; value: string }[] = [
  { label: 'Sans (theme)', value: 'Inter, ui-sans-serif, system-ui, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Iowan Old Style", "Times New Roman", serif' },
  { label: 'Mono', value: '"Cascadia Mono", Consolas, ui-monospace, monospace' },
  { label: 'System UI', value: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
]
