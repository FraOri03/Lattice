import JSZip from 'jszip'
import type { JSONContent } from '@tiptap/core'

/**
 * OpenDocument Text (ODT) ↔ Tiptap JSON, fully in-browser.
 *
 * Import: unzip the container, parse content.xml (namespace-agnostic via
 * localName), map text:h/text:p/text:list/table:table plus bold/italic/
 * underline resolved from automatic styles. Embedded images are skipped
 * (documented adapter limitation).
 *
 * Export: build a minimal valid ODT package — uncompressed `mimetype`
 * first, META-INF/manifest.xml, content.xml with generated text styles,
 * and a placeholder styles.xml. Opens in LibreOffice/Word.
 */

const ODT_MIME = 'application/vnd.oasis.opendocument.text'

/* ================= import ================= */

interface TextStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

function attr(el: Element, local: string): string | null {
  for (const a of Array.from(el.attributes)) {
    if (a.localName === local) return a.value
  }
  return null
}

function marksOf(style: TextStyle): JSONContent['marks'] {
  const marks: NonNullable<JSONContent['marks']> = []
  if (style.bold) marks.push({ type: 'bold' })
  if (style.italic) marks.push({ type: 'italic' })
  if (style.underline) marks.push({ type: 'underline' })
  return marks.length ? marks : undefined
}

export async function odtToDocJson(data: Blob): Promise<JSONContent> {
  const zip = await JSZip.loadAsync(data)
  const contentXml = await zip.file('content.xml')?.async('string')
  if (!contentXml) {
    throw new Error('Not a valid OpenDocument file (missing content.xml)')
  }
  const dom = new DOMParser().parseFromString(contentXml, 'application/xml')
  if (dom.getElementsByTagName('parsererror').length) {
    throw new Error('Could not parse OpenDocument content.xml')
  }

  // automatic styles → text marks
  const styleMarks = new Map<string, TextStyle>()
  for (const el of Array.from(dom.getElementsByTagName('*'))) {
    if (el.localName !== 'style') continue
    const name = attr(el, 'name')
    if (!name) continue
    const props = Array.from(el.children).find(
      (c) => c.localName === 'text-properties',
    )
    if (!props) continue
    const s: TextStyle = {}
    if ((attr(props, 'font-weight') ?? '').startsWith('bold')) s.bold = true
    if (attr(props, 'font-style') === 'italic') s.italic = true
    const underline = attr(props, 'text-underline-style')
    if (underline && underline !== 'none') s.underline = true
    if (s.bold || s.italic || s.underline) styleMarks.set(name, s)
  }

  const inline = (el: Element, inherited: TextStyle): JSONContent[] => {
    const out: JSONContent[] = []
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? ''
        if (text) out.push({ type: 'text', text, marks: marksOf(inherited) })
        continue
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue
      const child = node as Element
      switch (child.localName) {
        case 'span': {
          const styleName = attr(child, 'style-name')
          const style = { ...inherited, ...(styleName ? styleMarks.get(styleName) : {}) }
          out.push(...inline(child, style))
          break
        }
        case 'a': {
          const href = attr(child, 'href') ?? ''
          for (const piece of inline(child, inherited)) {
            if (piece.type === 'text') {
              piece.marks = [...(piece.marks ?? []), { type: 'link', attrs: { href } }]
            }
            out.push(piece)
          }
          break
        }
        case 's':
          out.push({
            type: 'text',
            text: ' '.repeat(Number(attr(child, 'c') ?? 1)),
            marks: marksOf(inherited),
          })
          break
        case 'tab':
          out.push({ type: 'text', text: '\t', marks: marksOf(inherited) })
          break
        case 'line-break':
          out.push({ type: 'hardBreak' })
          break
        default:
          out.push(...inline(child, inherited))
      }
    }
    return out
  }

  const paragraph = (el: Element): JSONContent => {
    const styleName = attr(el, 'style-name')
    const style = styleName ? (styleMarks.get(styleName) ?? {}) : {}
    const content = inline(el, style)
    return { type: 'paragraph', ...(content.length ? { content } : {}) }
  }

  const block = (el: Element): JSONContent[] => {
    switch (el.localName) {
      case 'h': {
        const level = Math.min(6, Math.max(1, Number(attr(el, 'outline-level') ?? 1)))
        const content = inline(el, {})
        return [{ type: 'heading', attrs: { level }, ...(content.length ? { content } : {}) }]
      }
      case 'p':
        return [paragraph(el)]
      case 'list': {
        const items: JSONContent[] = []
        for (const li of Array.from(el.children)) {
          if (li.localName !== 'list-item') continue
          const itemBlocks = Array.from(li.children).flatMap(block)
          items.push({
            type: 'listItem',
            content: itemBlocks.length ? itemBlocks : [{ type: 'paragraph' }],
          })
        }
        return items.length ? [{ type: 'bulletList', content: items }] : []
      }
      case 'table': {
        const rows: JSONContent[] = []
        const collectRows = (container: Element, header: boolean) => {
          for (const child of Array.from(container.children)) {
            if (child.localName === 'table-header-rows') {
              collectRows(child, true)
            } else if (child.localName === 'table-row') {
              const cells: JSONContent[] = []
              for (const cell of Array.from(child.children)) {
                if (cell.localName !== 'table-cell') continue
                const cellBlocks = Array.from(cell.children).flatMap(block)
                cells.push({
                  type: header ? 'tableHeader' : 'tableCell',
                  content: cellBlocks.length ? cellBlocks : [{ type: 'paragraph' }],
                })
              }
              if (cells.length) rows.push({ type: 'tableRow', content: cells })
            }
          }
        }
        collectRows(el, false)
        return rows.length ? [{ type: 'table', content: rows }] : []
      }
      case 'section':
        return Array.from(el.children).flatMap(block)
      default:
        return []
    }
  }

  let officeText: Element | null = null
  for (const el of Array.from(dom.getElementsByTagName('*'))) {
    if (el.localName === 'text' && el.parentElement?.localName === 'body') {
      officeText = el
      break
    }
  }
  if (!officeText) throw new Error('OpenDocument file has no text body')

  const blocks = Array.from(officeText.children).flatMap(block)
  return { type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] }
}

/* ================= export ================= */

const xmlEscape = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

type MarkCombo = string // e.g. 'b', 'bi', 'iu'

function comboOf(node: JSONContent): MarkCombo {
  const types = new Set((node.marks ?? []).map((m) => m.type))
  return `${types.has('bold') ? 'b' : ''}${types.has('italic') ? 'i' : ''}${
    types.has('underline') || types.has('link') ? 'u' : ''
  }`
}

export function docJsonToOdtXml(body: JSONContent): string {
  const combos = new Set<MarkCombo>()

  const inline = (nodes: JSONContent[] | undefined): string =>
    (nodes ?? [])
      .map((n) => {
        if (n.type === 'text') {
          const combo = comboOf(n)
          const text = xmlEscape(n.text ?? '')
          if (!combo) return text
          combos.add(combo)
          return `<text:span text:style-name="T${combo}">${text}</text:span>`
        }
        if (n.type === 'hardBreak') return '<text:line-break/>'
        if (n.type === 'wikilink') return xmlEscape(`[[${String(n.attrs?.target ?? '')}]]`)
        if (n.type === 'image') return ''
        return inline(n.content)
      })
      .join('')

  const para = (n: JSONContent, style = 'Standard'): string =>
    `<text:p text:style-name="${style}">${inline(n.content)}</text:p>`

  const block = (n: JSONContent): string => {
    switch (n.type) {
      case 'heading': {
        const level = Number(n.attrs?.level ?? 1)
        return `<text:h text:style-name="Heading_20_${level}" text:outline-level="${level}">${inline(n.content)}</text:h>`
      }
      case 'paragraph':
        return para(n)
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        return `<text:list>${(n.content ?? [])
          .map(
            (li) =>
              `<text:list-item>${(li.content ?? [])
                .map((c) => (c.type === 'paragraph' ? para(c) : block(c)))
                .join('')}</text:list-item>`,
          )
          .join('')}</text:list>`
      case 'blockquote':
      case 'callout':
        return (n.content ?? []).map(block).join('')
      case 'codeBlock': {
        const lines = (n.content ?? [])
          .map((c) => xmlEscape(c.text ?? ''))
          .join('')
          .split('\n')
        return `<text:p text:style-name="Preformatted_20_Text">${lines.join('<text:line-break/>')}</text:p>`
      }
      case 'horizontalRule':
        return '<text:p/>'
      case 'table': {
        const rows = (n.content ?? [])
          .map(
            (row) =>
              `<table:table-row>${(row.content ?? [])
                .map(
                  (cell) =>
                    `<table:table-cell office:value-type="string">${(cell.content ?? [])
                      .map((c) => (c.type === 'paragraph' ? para(c) : block(c)))
                      .join('')}</table:table-cell>`,
                )
                .join('')}</table:table-row>`,
          )
          .join('')
        const cols = Math.max(
          1,
          ...(n.content ?? []).map((r) => (r.content ?? []).length),
        )
        return `<table:table><table:table-column table:number-columns-repeated="${cols}"/>${rows}</table:table>`
      }
      case 'assetEmbed':
        return `<text:p>[embedded asset: ${xmlEscape(String(n.attrs?.assetId ?? ''))}]</text:p>`
      default:
        return para(n)
    }
  }

  const bodyXml = (body.content ?? []).map(block).join('')

  const styleXml = [...combos]
    .map((combo) => {
      const props = [
        combo.includes('b') ? 'fo:font-weight="bold"' : '',
        combo.includes('i') ? 'fo:font-style="italic"' : '',
        combo.includes('u') ? 'style:text-underline-style="solid"' : '',
      ]
        .filter(Boolean)
        .join(' ')
      return `<style:style style:name="T${combo}" style:family="text"><style:text-properties ${props}/></style:style>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" office:version="1.2"><office:automatic-styles>${styleXml}</office:automatic-styles><office:body><office:text>${bodyXml}</office:text></office:body></office:document-content>`
}

const MANIFEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
<manifest:file-entry manifest:full-path="/" manifest:media-type="${ODT_MIME}"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.2"><office:styles/></office:document-styles>`

export async function docJsonToOdtBlob(body: JSONContent): Promise<Blob> {
  const zip = new JSZip()
  // the mimetype entry must be first and uncompressed per the ODF spec
  zip.file('mimetype', ODT_MIME, { compression: 'STORE' })
  zip.file('META-INF/manifest.xml', MANIFEST_XML, { compression: 'DEFLATE' })
  zip.file('content.xml', docJsonToOdtXml(body), { compression: 'DEFLATE' })
  zip.file('styles.xml', STYLES_XML, { compression: 'DEFLATE' })
  return zip.generateAsync({ type: 'blob', mimeType: ODT_MIME })
}
