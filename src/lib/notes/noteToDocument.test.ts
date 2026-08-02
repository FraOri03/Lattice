import { describe, expect, it } from 'vitest'
import { markdownToDocBody, noteHtmlToDocHtml } from './noteToDocument'
import { renderMarkdown } from '@/lib/markdown'

/**
 * Promotion is the one place where the two text entities meet, so it is
 * also the one place where a note's meaning can quietly be lost. These
 * lock the constructs that do NOT survive a naive markdown → Tiptap pass:
 * wikilinks (the note's whole point) and task lists.
 */

const kinds = (body: { content?: { type?: string }[] }) =>
  (body.content ?? []).map((n) => n.type)

/** Walk the tree collecting every node of a type. */
function collect(node: unknown, type: string, out: Record<string, unknown>[] = []) {
  if (!node || typeof node !== 'object') return out
  const n = node as { type?: string; content?: unknown[] }
  if (n.type === type) out.push(n as Record<string, unknown>)
  for (const child of n.content ?? []) collect(child, type, out)
  return out
}

describe('noteHtmlToDocHtml', () => {
  it('turns a wikilink anchor into the schema’s span atom', () => {
    const html = noteHtmlToDocHtml(renderMarkdown('See [[Project brief]] first.'))
    expect(html).toContain('<span data-wikilink="Project brief">Project brief</span>')
    expect(html).not.toContain('<a')
  })

  it('marks a checkbox list as a task list, carrying the checked state', () => {
    const html = noteHtmlToDocHtml(renderMarkdown('- [x] shipped\n- [ ] pending'))
    expect(html).toContain('data-type="taskList"')
    expect(html).toContain('data-checked="true"')
    expect(html).toContain('data-checked="false"')
    // the disabled input is schema noise once data-checked carries the state
    expect(html).not.toContain('<input')
  })

  it('leaves a mixed list alone rather than half-converting it', () => {
    const html = noteHtmlToDocHtml(renderMarkdown('- [ ] a task\n- a plain item'))
    expect(html).not.toContain('taskList')
  })
})

describe('markdownToDocBody', () => {
  it('keeps the document structure of a note', () => {
    const body = markdownToDocBody('# Title\n\nA paragraph.\n\n- one\n- two')
    expect(kinds(body)).toEqual(['heading', 'paragraph', 'bulletList'])
  })

  it('carries wikilinks across as real wikilink nodes', () => {
    const body = markdownToDocBody('Ties back to [[Roadmap]].')
    expect(collect(body, 'wikilink').map((n) => (n.attrs as { target: string }).target)).toEqual(
      ['Roadmap'],
    )
  })

  it('carries a task list across with its checked state', () => {
    const body = markdownToDocBody('- [x] done\n- [ ] todo')
    const items = collect(body, 'taskItem')
    expect(items).toHaveLength(2)
    expect(items.map((n) => (n.attrs as { checked: boolean }).checked)).toEqual([true, false])
  })

  it('never drops the words of a construct it cannot model', () => {
    const body = markdownToDocBody('Text with `code` and **bold** and ~~strike~~.')
    expect(JSON.stringify(body)).toContain('code')
    expect(JSON.stringify(body)).toContain('bold')
    expect(JSON.stringify(body)).toContain('strike')
  })
})
