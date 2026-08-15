import type { PresentTheme, PresentationBody } from './presentModel'

/**
 * Deck design tokens (19E.2).
 *
 * The three themes were three background/text/accent triples. They are now
 * **presets that expand into a token set**, so a master can override any part
 * of the design without the deck losing the preset it started from.
 *
 * `theme` keeps its meaning and its place in the body — this is additive on
 * purpose. Nothing has to migrate, old bodies resolve to exactly the colours
 * they rendered with before, and a deck that never touches a token never
 * grows one.
 */

export interface ThemeTokens {
  bg: string
  /** panels/cards drawn on top of the background */
  surface: string
  text: string
  textMuted: string
  accent: string
  fontFamily: string
  /** type scale, in slide pixels on the 960×540 canvas */
  titleSize: number
  headingSize: number
  bodySize: number
  captionSize: number
  radius: number
  /** reserved for charts (19E.4); defined here so one file owns the palette */
  chartPalette: string[]
}

const SANS = 'Inter, ui-sans-serif, system-ui, sans-serif'

export const THEME_PRESETS: Record<PresentTheme, ThemeTokens> = {
  plain: {
    bg: '#ffffff',
    surface: '#f4f4f6',
    text: '#1f1f24',
    textMuted: '#71717a',
    accent: '#0d99ff',
    fontFamily: SANS,
    titleSize: 44,
    headingSize: 30,
    bodySize: 18,
    captionSize: 12,
    radius: 6,
    chartPalette: ['#0d99ff', '#14ae5c', '#ffa629', '#9747ff', '#f24822'],
  },
  ink: {
    bg: '#17181c',
    surface: '#232327',
    text: '#f0f1f4',
    textMuted: '#97979f',
    accent: '#5ab8ff',
    fontFamily: SANS,
    titleSize: 44,
    headingSize: 30,
    bodySize: 18,
    captionSize: 12,
    radius: 6,
    chartPalette: ['#5ab8ff', '#3ec97e', '#ffb454', '#b681ff', '#ff7a5c'],
  },
  accent: {
    bg: '#0d2b45',
    surface: '#123a5c',
    text: '#f0f6ff',
    textMuted: '#a8c4dd',
    accent: '#ffcd29',
    fontFamily: SANS,
    titleSize: 44,
    headingSize: 30,
    bodySize: 18,
    captionSize: 12,
    radius: 6,
    chartPalette: ['#ffcd29', '#5ab8ff', '#3ec97e', '#ff7a5c', '#b681ff'],
  },
}

/** A partial override of the preset, stored on the deck or on a master. */
export type ThemeTokenOverride = Partial<ThemeTokens>

const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v)
const isSize = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

/**
 * Keep only the token overrides that are well-formed. A corrupt or
 * hand-edited body can then never push an unpaintable colour or a negative
 * font size into the renderer — the preset value simply stands.
 */
export function sanitizeTokens(raw: unknown): ThemeTokenOverride | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const out: ThemeTokenOverride = {}
  for (const key of ['bg', 'surface', 'text', 'textMuted', 'accent'] as const) {
    if (isColor(r[key])) out[key] = r[key] as string
  }
  for (const key of ['titleSize', 'headingSize', 'bodySize', 'captionSize', 'radius'] as const) {
    if (isSize(r[key])) out[key] = r[key] as number
  }
  if (typeof r.fontFamily === 'string' && r.fontFamily.trim()) out.fontFamily = r.fontFamily
  if (Array.isArray(r.chartPalette) && r.chartPalette.every(isColor)) {
    out.chartPalette = r.chartPalette as string[]
  }
  return Object.keys(out).length ? out : undefined
}

/** The deck's tokens: its preset, with whatever the deck overrides on top. */
export function deckTokens(body: PresentationBody): ThemeTokens {
  const preset = THEME_PRESETS[body.theme] ?? THEME_PRESETS.plain
  return body.tokens ? { ...preset, ...body.tokens } : preset
}

/**
 * Which token values a layer has actually changed, compared with what it
 * inherits. This is what makes an override **visible** — the inspector reads
 * it rather than guessing, and reverting is deleting a key.
 */
export function overriddenTokenKeys(
  inherited: ThemeTokens,
  override: ThemeTokenOverride | undefined,
): (keyof ThemeTokens)[] {
  if (!override) return []
  return (Object.keys(override) as (keyof ThemeTokens)[]).filter((k) => {
    const a = override[k]
    const b = inherited[k]
    return Array.isArray(a) && Array.isArray(b) ? a.join() !== b.join() : a !== b
  })
}

/** Human label for a token, used by the overrides list. */
export const TOKEN_LABEL: Record<keyof ThemeTokens, string> = {
  bg: 'Background',
  surface: 'Surface',
  text: 'Text',
  textMuted: 'Muted text',
  accent: 'Accent',
  fontFamily: 'Font',
  titleSize: 'Title size',
  headingSize: 'Heading size',
  bodySize: 'Body size',
  captionSize: 'Caption size',
  radius: 'Radius',
  chartPalette: 'Chart palette',
}
