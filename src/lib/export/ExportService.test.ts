import { describe, expect, it } from 'vitest'
import { buildStandaloneHtml, companionFileName } from './ExportService'
import type { RichDocMeta } from '@/types/model'
import type { JSONContent } from '@tiptap/core'

/**
 * companionFileName and buildStandaloneHtml are the two pieces shared by
 * the manual "Export as HTML" download and the Drive-readable companion
 * (SyncEngine.syncCompanion) — get these right once here rather than in
 * two call sites.
 */

const docMeta = (over: Partial<RichDocMeta> = {}): RichDocMeta => ({
  id: 'doc_1',
  title: 'Untitled document',
  type: 'rich-document',
  createdAt: 0,
  updatedAt: 0,
  linkedAssets: [],
  outgoingLinks: [],
  snippet: '',
  wordCount: 0,
  outline: [],
  tags: [],
  metadata: {},
  ...over,
})

const bodyWithText = (text: string): JSONContent => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

describe('companionFileName', () => {
  it('uses the title unchanged, not slugified — the readability requirement asks for the SAME name', () => {
    expect(companionFileName('Q3 Roadmap: Draft 2')).toBe('Q3 Roadmap: Draft 2.html')
  })

  it('preserves accented and non-Latin characters', () => {
    expect(companionFileName('Città e progetti — 计划')).toBe('Città e progetti — 计划.html')
  })

  it('strips control characters and backslashes', () => {
    expect(companionFileName('ab\\c')).toBe('a b c.html')
  })

  it('collapses internal whitespace runs and trims the ends', () => {
    expect(companionFileName('  a    b  ')).toBe('a b.html')
  })

  it('falls back to Untitled for an empty or whitespace-only title', () => {
    expect(companionFileName('')).toBe('Untitled.html')
    expect(companionFileName('   ')).toBe('Untitled.html')
  })
})

describe('buildStandaloneHtml', () => {
  it('embeds the title in <title> and <h1>, and the body content', () => {
    const html = buildStandaloneHtml(docMeta({ title: 'Meeting notes' }), bodyWithText('hello world'))
    expect(html).toContain('<title>Meeting notes</title>')
    expect(html).toContain('<h1>Meeting notes</h1>')
    expect(html).toContain('hello world')
    expect(html.startsWith('<!doctype html>')).toBe(true)
  })

  it('HTML-escapes the title (it is interpolated directly into markup)', () => {
    const html = buildStandaloneHtml(docMeta({ title: 'A <b> & "C"' }), bodyWithText('x'))
    expect(html).toContain('<title>A &lt;b&gt; &amp; "C"</title>')
    expect(html).not.toContain('<title>A <b></title>')
  })

  it('includes an @page rule with the chosen size/margin for a paged document', () => {
    const html = buildStandaloneHtml(
      docMeta({ page: { mode: 'paged', size: 'a4', margin: 'normal' } }),
      bodyWithText('x'),
    )
    expect(html).toContain('@page')
    expect(html).toContain('210mm 297mm')
  })

  it('omits @page for a continuous (or unset) document, keeping only break-avoid rules', () => {
    const html = buildStandaloneHtml(docMeta(), bodyWithText('x'))
    expect(html).not.toContain('@page')
    expect(html).toContain('break-inside: avoid')
  })
})
