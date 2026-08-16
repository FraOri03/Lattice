import { describe, expect, it } from 'vitest'
import type { JSONContent } from '@tiptap/core'
import {
  docFromPlain,
  docOf,
  emptyDoc,
  isEmptyDoc,
  linesOf,
  plainFromDoc,
  richFeaturesOf,
} from './richtext'

const para = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content })
const t = (text: string, ...marks: string[]): JSONContent => ({
  type: 'text',
  text,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
})

describe('docFromPlain / plainFromDoc', () => {
  it('round-trips plain text through the document and back', () => {
    const text = 'First line\nSecond line'
    expect(plainFromDoc(docFromPlain(text))).toBe(text)
  })

  it('keeps empty lines instead of collapsing the shape', () => {
    expect(plainFromDoc(docFromPlain('a\n\nb'))).toBe('a\n\nb')
  })

  it('carries the old whole-box marks onto every run', () => {
    const lines = linesOf(docFromPlain('bold text', { bold: true }))
    expect(lines[0].runs[0]).toMatchObject({ text: 'bold text', bold: true })
  })

  it('treats an absent document as empty rather than throwing', () => {
    expect(plainFromDoc(undefined)).toBe('')
    expect(linesOf(undefined)).toEqual([])
    expect(isEmptyDoc(undefined)).toBe(true)
    expect(isEmptyDoc(emptyDoc())).toBe(true)
  })
})

describe('linesOf — mixed formatting', () => {
  it('keeps several differently marked runs inside one line', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [para(t('plain '), t('bold', 'bold'), t(' and '), t('italic', 'italic'))],
    }
    const [line] = linesOf(doc)
    expect(line.runs.map((r) => r.text)).toEqual(['plain ', 'bold', ' and ', 'italic'])
    expect(line.runs[1].bold).toBe(true)
    expect(line.runs[3].italic).toBe(true)
    expect(line.runs[0].bold).toBeUndefined()
  })

  it('reads a link’s href off the mark', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        para({
          type: 'text',
          text: 'the brief',
          marks: [{ type: 'link', attrs: { href: 'lattice://doc/abc' } }],
        }),
      ],
    }
    expect(linesOf(doc)[0].runs[0].href).toBe('lattice://doc/abc')
  })

  it('drops empty runs so a line has no phantom text', () => {
    const doc: JSONContent = { type: 'doc', content: [para(t(''), t('real'))] }
    expect(linesOf(doc)[0].runs).toHaveLength(1)
  })
})

describe('linesOf — lists', () => {
  const list = (type: 'bulletList' | 'orderedList', ...items: JSONContent[]): JSONContent => ({
    type,
    content: items,
  })
  const item = (...content: JSONContent[]): JSONContent => ({ type: 'listItem', content })

  it('marks each item with its list kind', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [list('bulletList', item(para(t('one'))), item(para(t('two'))))],
    }
    const lines = linesOf(doc)
    expect(lines.map((l) => l.list)).toEqual(['bullet', 'bullet'])
    expect(lines.map((l) => l.level)).toEqual([0, 0])
  })

  it('counts nesting depth, so an indented item reads as indented', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        list(
          'bulletList',
          item(para(t('top')), list('orderedList', item(para(t('nested'))))),
        ),
      ],
    }
    const lines = linesOf(doc)
    expect(lines[0]).toMatchObject({ level: 0, list: 'bullet' })
    expect(lines[1]).toMatchObject({ level: 1, list: 'number' })
  })

  it('descends into node types it does not know rather than losing the words', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [{ type: 'someFutureBlock', content: [para(t('still here'))] }],
    }
    expect(plainFromDoc(doc)).toBe('still here')
  })
})

describe('richFeaturesOf', () => {
  it('reports nothing special for uniform plain text', () => {
    expect(richFeaturesOf(docFromPlain('just words'))).toEqual({
      mixedMarks: false,
      lists: false,
      links: false,
    })
  })

  it('notices formatting that a plain-text export cannot carry', () => {
    const doc: JSONContent = { type: 'doc', content: [para(t('a'), t('b', 'bold'))] }
    expect(richFeaturesOf(doc).mixedMarks).toBe(true)
  })
})

describe('docOf', () => {
  it('uses the element’s document when it has one', () => {
    const doc = docFromPlain('from the document')
    expect(plainFromDoc(docOf({ doc, text: 'stale string' }))).toBe('from the document')
  })

  it('builds one from the string for an element written before 19E.3', () => {
    expect(plainFromDoc(docOf({ text: 'legacy', bold: true }))).toBe('legacy')
    expect(linesOf(docOf({ text: 'legacy', bold: true }))[0].runs[0].bold).toBe(true)
  })
})
