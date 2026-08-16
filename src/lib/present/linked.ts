import type { PresentElement, PresentationBody } from './presentModel'

/**
 * Linked content (19E.4).
 *
 * One model for every way a slide can hold something that lives elsewhere:
 *
 * - **copy** — taken once, no tie. It never updates, and it says so.
 * - **embed** — a snapshot with a remembered origin. It can be refreshed, on
 *   purpose, and it reports when the origin has moved on.
 * - **link** — the same, plus the intent that it should be kept current.
 *
 * Nothing here is presentation-specific: it is an entity kind, an id, an
 * optional part of that entity and the revision the holder has. Board and
 * RichDoc can hold the same record; Present is simply the first consumer.
 *
 * The rule the whole design serves: **nothing updates itself.** A deck being
 * presented cannot change under the presenter, so refreshing is always an act
 * someone takes in the editor.
 */

export type LinkMode = 'copy' | 'embed' | 'link'

export type LinkedEntityKind = 'sheet' | 'board' | 'document' | 'asset' | 'note'

export interface LinkRef {
  mode: LinkMode
  kind: LinkedEntityKind
  /** the entity's id in its own store */
  id: string
  /** which part of it — a sheet range, a section id; absent means the whole */
  ref?: string
  /** the revision this holder captured */
  rev?: number
  /** what to call it when the entity itself cannot be reached */
  label?: string
}

/** What a source looks like right now, as far as the holder can tell. */
export interface SourceState {
  id: string
  rev: number
  label?: string
}

export type SyncState = 'copy' | 'in-sync' | 'update-available' | 'missing'

export const SYNC_LABEL: Record<SyncState, string> = {
  copy: 'Copy — never updates',
  'in-sync': 'In sync',
  'update-available': 'Update available',
  missing: 'Source is gone',
}

/**
 * Where a link stands. A copy is deliberately not compared with anything: it
 * was taken once and has no claim on the source, so calling it "out of date"
 * would be inventing an obligation nobody asked for.
 */
export function syncStateOf(
  link: LinkRef | undefined,
  sources: ReadonlyMap<string, SourceState>,
): SyncState | null {
  if (!link) return null
  if (link.mode === 'copy') return 'copy'
  const source = sources.get(link.id)
  if (!source) return 'missing'
  if (link.rev === undefined) return 'in-sync'
  return source.rev > link.rev ? 'update-available' : 'in-sync'
}

export interface LinkedItem {
  elementId: string
  slideIndex: number
  link: LinkRef
  state: SyncState
  /** the revision available now, when there is a source to ask */
  sourceRev?: number
  label: string
}

/** Every linked element in the deck, with where each one stands. */
export function linkedItems(
  body: PresentationBody,
  sources: ReadonlyMap<string, SourceState>,
): LinkedItem[] {
  const out: LinkedItem[] = []
  body.slides.forEach((slide, slideIndex) => {
    for (const el of slide.elements) {
      const link = (el as PresentElement & { linkRef?: LinkRef }).linkRef
      if (!link) continue
      const state = syncStateOf(link, sources)!
      out.push({
        elementId: el.id,
        slideIndex,
        link,
        state,
        sourceRev: sources.get(link.id)?.rev,
        label: sources.get(link.id)?.label ?? link.label ?? link.id,
      })
    }
  })
  return out
}

export interface UpdatePlan {
  items: LinkedItem[]
  /** 1-based slide numbers this would rewrite — what "Update all" must say */
  slideNumbers: number[]
}

/**
 * What "Update all" would actually touch. It is computed and shown *before*
 * anything is rewritten, because a button that silently edits several slides
 * is the one thing a deck cannot afford.
 */
export function planUpdates(
  body: PresentationBody,
  sources: ReadonlyMap<string, SourceState>,
): UpdatePlan {
  const items = linkedItems(body, sources).filter((i) => i.state === 'update-available')
  const slideNumbers = [...new Set(items.map((i) => i.slideIndex + 1))].sort((a, b) => a - b)
  return { items, slideNumbers }
}

/** Count by state, for the panel's one-line summary. */
export function summarizeLinks(items: LinkedItem[]): Record<SyncState, number> {
  const out: Record<SyncState, number> = {
    copy: 0,
    'in-sync': 0,
    'update-available': 0,
    missing: 0,
  }
  for (const i of items) out[i.state]++
  return out
}

/** Mark an element's link as caught up with its source. */
export function withCapturedRev(link: LinkRef, rev: number): LinkRef {
  return { ...link, rev }
}

/** Cut the tie but keep the content — the honest exit for a missing source. */
export function detached(link: LinkRef): LinkRef {
  return { ...link, mode: 'copy' }
}

/** Keep only a well-formed link when loading a body. */
export function sanitizeLinkRef(raw: unknown): LinkRef | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const modes: LinkMode[] = ['copy', 'embed', 'link']
  const kinds: LinkedEntityKind[] = ['sheet', 'board', 'document', 'asset', 'note']
  if (!modes.includes(r.mode as LinkMode) || !kinds.includes(r.kind as LinkedEntityKind)) {
    return undefined
  }
  if (typeof r.id !== 'string' || !r.id) return undefined
  return {
    mode: r.mode as LinkMode,
    kind: r.kind as LinkedEntityKind,
    id: r.id,
    ...(typeof r.ref === 'string' ? { ref: r.ref } : {}),
    ...(typeof r.rev === 'number' && Number.isFinite(r.rev) ? { rev: r.rev } : {}),
    ...(typeof r.label === 'string' ? { label: r.label } : {}),
  }
}
