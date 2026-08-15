import type { JSONContent } from '@tiptap/core'

/**
 * Slide rich text (19E.3).
 *
 * A text box stops being a string and becomes a **structured document**, in
 * the same `JSONContent` shape Lattice already uses for rich documents. That
 * choice is the point: the representation has to merge, not merely serialise,
 * and `DocumentCRDT` already merges this one — so when decks join the CRDT
 * layer there is one text model to reuse, not a second one to reconcile.
 *
 * `TextElement.text` stays alongside it as the plain projection. Everything
 * that only needs words — the digest, search, an exporter that cannot carry
 * formatting — keeps reading it, and it is rewritten from the document on
 * every edit so the two can never drift.
 */

export type RunMark = 'bold' | 'italic' | 'underline'

export interface TextRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  /** href of a link mark; entity links use the `lattice://` form */
  href?: string
}

export interface TextLine {
  runs: TextRun[]
  /** list membership, if this line is an item */
  list?: 'bullet' | 'number'
  /** nesting depth, 0 for a top-level item */
  level: number
}

const marksOf = (node: JSONContent): TextRun => {
  const run: TextRun = { text: node.text ?? '' }
  for (const m of node.marks ?? []) {
    if (m.type === 'bold') run.bold = true
    else if (m.type === 'italic') run.italic = true
    else if (m.type === 'underline') run.underline = true
    else if (m.type === 'link' && typeof m.attrs?.href === 'string') run.href = m.attrs.href
  }
  return run
}

/** An empty document — one empty paragraph, which is what an editor expects. */
export const emptyDoc = (): JSONContent => ({
  type: 'doc',
  content: [{ type: 'paragraph' }],
})

/**
 * Build a document from plain text, carrying the element's whole-box marks
 * onto every run. This is how a pre-19E.3 text box becomes a document without
 * looking any different.
 */
export function docFromPlain(text: string, marks: { bold?: boolean; italic?: boolean } = {}): JSONContent {
  const applied = [
    ...(marks.bold ? [{ type: 'bold' }] : []),
    ...(marks.italic ? [{ type: 'italic' }] : []),
  ]
  const lines = text.split('\n')
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      ...(line
        ? { content: [{ type: 'text', text: line, ...(applied.length ? { marks: applied } : {}) }] }
        : {}),
    })),
  }
}

/** The plain projection: what the words are, with paragraphs as newlines. */
export function plainFromDoc(doc: JSONContent | undefined): string {
  if (!doc) return ''
  return linesOf(doc)
    .map((l) => l.runs.map((r) => r.text).join(''))
    .join('\n')
}

/**
 * Flatten a document into lines of styled runs.
 *
 * Renderers and exporters both need the same answer to "what does this say,
 * and how is it marked?", and neither should walk ProseMirror nodes to get it.
 * Unknown node types are descended into rather than dropped, so a document
 * written by a newer build still shows its words here.
 */
export function linesOf(doc: JSONContent | undefined): TextLine[] {
  if (!doc) return []
  const lines: TextLine[] = []

  const walkBlock = (node: JSONContent, list: TextLine['list'], level: number): void => {
    const type = node.type
    if (type === 'bulletList' || type === 'orderedList') {
      const kind = type === 'bulletList' ? 'bullet' : 'number'
      for (const child of node.content ?? []) walkBlock(child, kind, level)
      return
    }
    if (type === 'listItem') {
      for (const child of node.content ?? []) {
        // a list inside an item is one level deeper; its paragraph is not
        const nested = child.type === 'bulletList' || child.type === 'orderedList'
        walkBlock(child, list, nested ? level + 1 : level)
      }
      return
    }
    if (type === 'paragraph' || type === 'heading') {
      const runs = (node.content ?? [])
        .filter((n) => n.type === 'text')
        .map(marksOf)
        .filter((r) => r.text.length > 0)
      lines.push({ runs, ...(list ? { list } : {}), level })
      return
    }
    // anything else: keep descending so words are never lost
    for (const child of node.content ?? []) walkBlock(child, list, level)
  }

  for (const child of doc.content ?? []) walkBlock(child, undefined, 0)
  return lines
}

/** True when a document carries no words at all. */
export const isEmptyDoc = (doc: JSONContent | undefined): boolean =>
  plainFromDoc(doc).trim().length === 0

/** Does this document use anything a plain-text export cannot carry? */
export function richFeaturesOf(doc: JSONContent | undefined): {
  mixedMarks: boolean
  lists: boolean
  links: boolean
} {
  const lines = linesOf(doc)
  const marks = new Set<string>()
  let links = false
  let lists = false
  for (const line of lines) {
    if (line.list) lists = true
    for (const run of line.runs) {
      if (run.href) links = true
      marks.add(`${run.bold ? 'b' : ''}${run.italic ? 'i' : ''}${run.underline ? 'u' : ''}`)
    }
  }
  return { mixedMarks: marks.size > 1, lists, links }
}

/**
 * The document a text element should be edited and rendered from.
 *
 * An element written before 19E.3 has no document, only a string — this is
 * where it becomes one, on demand, so no migration has to rewrite bodies that
 * may never be opened.
 */
export function docOf(el: { doc?: JSONContent; text: string; bold?: boolean; italic?: boolean }): JSONContent {
  return el.doc ?? docFromPlain(el.text, { bold: el.bold, italic: el.italic })
}
