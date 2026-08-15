import { nid } from '@/lib/id'
import type { PresentElement, PresentSlide, PresentationBody } from './presentModel'
import { deckTokens, sanitizeTokens, type ThemeTokenOverride, type ThemeTokens } from './theme'

/**
 * Masters (19E.2).
 *
 * A master owns the design a slide inherits: its tokens, and the persistent
 * furniture drawn on every slide that uses it. A deck can hold several — the
 * usual split is a title master, a content master and something lighter for
 * data — and a slide points at one.
 *
 * A deck with no masters is not a special case: `masterTokensFor` falls back to
 * the deck's own tokens, so every deck written before this existed keeps
 * rendering exactly as it did.
 */

export interface MasterFurniture {
  /** hairline above the footer */
  rule?: boolean
  /** the slide's position, drawn bottom-right */
  slideNumber?: boolean
  /** a fixed line of text bottom-left — a wordmark, a confidentiality note */
  footerText?: string
}

export interface PresentMaster {
  id: string
  name: string
  /** what this master changes about the deck's tokens */
  tokens?: ThemeTokenOverride
  furniture?: MasterFurniture
}

export function createMaster(name = 'Master', tokens?: ThemeTokenOverride): PresentMaster {
  return { id: nid('master'), name, ...(tokens ? { tokens } : {}) }
}

/** The master a slide uses, or null when it just follows the deck. */
export function masterFor(body: PresentationBody, slide: PresentSlide): PresentMaster | null {
  if (!slide.masterId) return null
  return body.masters?.find((m) => m.id === slide.masterId) ?? null
}

/** The tokens a slide actually paints with: deck tokens, then its master's. */
export function masterTokensFor(body: PresentationBody, slide: PresentSlide): ThemeTokens {
  const deck = deckTokens(body)
  const master = masterFor(body, slide)
  return master?.tokens ? { ...deck, ...master.tokens } : deck
}

/** The furniture drawn on a slide, if its master asks for any. */
export function furnitureFor(
  body: PresentationBody,
  slide: PresentSlide,
): MasterFurniture | null {
  const f = masterFor(body, slide)?.furniture
  if (!f) return null
  return f.rule || f.slideNumber || f.footerText ? f : null
}

/**
 * The master's furniture, expressed as ordinary elements (19E.2).
 *
 * One implementation, three consumers: the canvas, the thumbnails and both
 * exporters draw furniture by appending these to the slide's own elements, so
 * a footer can never appear on screen and go missing from the PDF. They carry
 * a `master:` id prefix and are never part of `slide.elements` — nothing can
 * select, move or delete them from a slide, which is what "inherited" means.
 */
export function furnitureElements(
  body: PresentationBody,
  slide: PresentSlide,
  slideNumber: number,
  tokens: ThemeTokens,
): PresentElement[] {
  const f = furnitureFor(body, slide)
  if (!f) return []
  const out: PresentElement[] = []
  const baseZ = 10_000 // furniture sits above content, like a page frame
  if (f.rule) {
    out.push({
      id: 'master:rule',
      kind: 'shape',
      shape: 'line',
      x: 64,
      y: 486,
      w: 832,
      h: 1,
      z: baseZ,
      fill: null,
      stroke: tokens.textMuted,
      strokeWidth: 1,
    })
  }
  if (f.footerText) {
    out.push({
      id: 'master:footer',
      kind: 'text',
      text: f.footerText,
      x: 64,
      y: 496,
      w: 500,
      h: 24,
      z: baseZ + 1,
      fontSize: tokens.captionSize,
      bold: false,
      italic: false,
      align: 'left',
      color: tokens.textMuted,
    })
  }
  if (f.slideNumber) {
    out.push({
      id: 'master:number',
      kind: 'text',
      text: String(slideNumber),
      x: 836,
      y: 496,
      w: 60,
      h: 24,
      z: baseZ + 2,
      fontSize: tokens.captionSize,
      bold: false,
      italic: false,
      align: 'right',
      color: tokens.textMuted,
    })
  }
  return out
}

/** How many slides a master is responsible for — shown beside its name. */
export function masterUsage(body: PresentationBody, masterId: string): number {
  return body.slides.filter((s) => s.masterId === masterId).length
}

/* ---------- pure body → body operations ---------- */

export function addMaster(body: PresentationBody, master: PresentMaster): PresentationBody {
  return { ...body, masters: [...(body.masters ?? []), master] }
}

export function updateMaster(
  body: PresentationBody,
  id: string,
  patch: Partial<Omit<PresentMaster, 'id'>>,
): PresentationBody {
  return {
    ...body,
    masters: (body.masters ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)),
  }
}

/**
 * Change one token on a master. Setting a value to `undefined` removes the
 * override, which is how "revert to inherited" is expressed — the key stops
 * existing rather than being pinned to the value it happened to inherit.
 */
export function setMasterToken<K extends keyof ThemeTokens>(
  body: PresentationBody,
  id: string,
  key: K,
  value: ThemeTokens[K] | undefined,
): PresentationBody {
  return {
    ...body,
    masters: (body.masters ?? []).map((m) => {
      if (m.id !== id) return m
      const tokens = { ...(m.tokens ?? {}) }
      if (value === undefined) delete tokens[key]
      else tokens[key] = value
      return { ...m, tokens: Object.keys(tokens).length ? tokens : undefined }
    }),
  }
}

/**
 * Delete a master. Its slides fall back to the deck's own design rather than
 * to another master's — silently re-homing a slide under a design nobody chose
 * would be a worse surprise than losing the styling.
 */
export function removeMaster(body: PresentationBody, id: string): PresentationBody {
  const masters = (body.masters ?? []).filter((m) => m.id !== id)
  return {
    ...body,
    slides: body.slides.map((s) => (s.masterId === id ? { ...s, masterId: undefined } : s)),
    ...(masters.length ? { masters } : { masters: undefined }),
  }
}

export function assignMaster(
  body: PresentationBody,
  slideId: string,
  masterId: string | undefined,
): PresentationBody {
  return {
    ...body,
    slides: body.slides.map((s) => (s.id === slideId ? { ...s, masterId } : s)),
  }
}

/** Repair the master list on load, dropping entries that cannot be used. */
export function migrateMasters(raw: unknown): PresentMaster[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const seen = new Set<string>()
  const out: PresentMaster[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const m = item as Record<string, unknown>
    const id = typeof m.id === 'string' ? m.id : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    const furniture =
      m.furniture && typeof m.furniture === 'object'
        ? (m.furniture as MasterFurniture)
        : undefined
    out.push({
      ...(m as object),
      id,
      name: typeof m.name === 'string' && m.name ? m.name : 'Master',
      tokens: sanitizeTokens(m.tokens),
      ...(furniture ? { furniture } : {}),
    } as PresentMaster)
  }
  return out.length ? out : undefined
}
