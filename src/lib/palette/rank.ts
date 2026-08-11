/**
 * How the command palette orders what it found (13.4 §3, built in 15.3).
 *
 * `includes()` in insertion order is not a ranking: it puts a document whose
 * name *is* the query below whichever map happened to be walked first. Four
 * tiers replace it, and the tie-breaks inside a tier are what make the order
 * feel considered rather than arbitrary.
 *
 * Pure, so the order can be asserted without mounting a palette — the same
 * reason `lib/nav/navUrl` and `lib/layout/tiers` are.
 */

/** Where a result is listed. Order here is only the zero-query fallback. */
export type PaletteSection =
  | 'recent'
  | 'create'
  | 'goto'
  | 'files'
  | 'boards'
  | 'projects'
  | 'workspace'
  | 'actions'

export interface Rankable {
  key: string
  /** What is matched and, as a last resort, sorted on. */
  name: string
  section: PaletteSection
  /** Position in the recents log; absent when the item is not in it. */
  recentRank?: number
  /** True for items belonging to the project currently open. */
  inActiveProject?: boolean
  /**
   * True for commands. A tie between an action and a thing breaks toward the
   * thing: a document you already made is more specific than a command that
   * would make another one.
   */
  isAction?: boolean
}

/**
 * Which tier a name matches the query in, or null for no match.
 *
 * 0 exact · 1 name starts with · 2 a word in the name starts with · 3 anywhere.
 * An empty query matches everything at the weakest tier, which is what lets the
 * zero-query state reuse the same pipeline.
 */
export function matchTier(name: string, query: string): number | null {
  const n = name.trim().toLowerCase()
  const q = query.trim().toLowerCase()
  if (!q) return 3
  if (n === q) return 0
  if (n.startsWith(q)) return 1
  // split on whitespace and the separators filenames actually use, so
  // "budget" reaches "q2-budget.xlsx" at tier 2 rather than falling to 3
  if (n.split(/[\s\-_./]+/).some((word) => word.startsWith(q))) return 2
  if (n.includes(q)) return 3
  return null
}

/**
 * Rank matching items, best first.
 *
 * Tier, then recency, then the active project, then things before commands,
 * then alphabetical — with the key as the final tie-break so the order is
 * total and a re-render can never reshuffle equals.
 */
export function rank<T extends Rankable>(items: T[], query: string): T[] {
  const scored: { item: T; tier: number }[] = []
  for (const item of items) {
    const tier = matchTier(item.name, query)
    if (tier !== null) scored.push({ item, tier })
  }
  return scored
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier
      const ar = a.item.recentRank ?? Infinity
      const br = b.item.recentRank ?? Infinity
      if (ar !== br) return ar - br
      const ap = a.item.inActiveProject ? 0 : 1
      const bp = b.item.inActiveProject ? 0 : 1
      if (ap !== bp) return ap - bp
      const aa = a.item.isAction ? 1 : 0
      const ba = b.item.isAction ? 1 : 0
      if (aa !== ba) return aa - ba
      return a.item.name.localeCompare(b.item.name) || a.item.key.localeCompare(b.item.key)
    })
    .map((s) => s.item)
}

/**
 * Group ranked items into sections, ordered by their best-scoring member.
 *
 * A fixed section order is what buries the document you are looking for under
 * seven `New …` commands whenever the query starts with "new". Headers stay
 * where they are; which header comes first follows the results.
 *
 * Caps are 13.4's: five per section, twenty overall. Narrowing is done by
 * typing, never by paging.
 */
export function groupSections<T extends Rankable>(
  ranked: T[],
  perSection = 5,
  total = 20,
): { section: PaletteSection; items: T[] }[] {
  const groups = new Map<PaletteSection, T[]>()
  for (const item of ranked) {
    const bucket = groups.get(item.section)
    if (bucket) bucket.push(item)
    else groups.set(item.section, [item])
  }
  // insertion order IS best-first, because `ranked` is already sorted
  const out: { section: PaletteSection; items: T[] }[] = []
  let budget = total
  for (const [section, items] of groups) {
    if (budget <= 0) break
    const take = items.slice(0, Math.min(perSection, budget))
    budget -= take.length
    out.push({ section, items: take })
  }
  return out
}

/** Rank and group in one call — what the palette actually asks for. */
export function search<T extends Rankable>(
  items: T[],
  query: string,
): { section: PaletteSection; items: T[] }[] {
  return groupSections(rank(items, query))
}
