import { generateHTML, type JSONContent } from '@tiptap/core'
import type { RichDocMeta } from '@/types/model'
import { storage } from '@/lib/storage/StorageProvider'
import { EMPTY_DOC } from '@/lib/richdoc/docjson'
import { baseExtensions } from '@/components/richdoc/extensions'
import { OdtAdapter, RtfAdapter } from '@/lib/convert/ConversionService'
import { downloadBlob, downloadText, slugify } from '@/lib/download'

export type ExportFormat = 'html' | 'markdown' | 'odt' | 'rtf' | 'docx' | 'pdf'

export interface ExportFormatInfo {
  format: ExportFormat
  label: string
  status: 'ready' | 'planned'
  note?: string
}

/**
 * Export format registry. HTML, Markdown, ODT and RTF are implemented
 * (ODT/RTF through their ConversionService adapters); DOCX and PDF slots
 * exist so UI and plugins can already enumerate them — their serializers
 * land in a later phase (docx lib / print pipeline).
 */
export const EXPORT_FORMATS: ExportFormatInfo[] = [
  { format: 'markdown', label: 'Markdown (.md)', status: 'ready' },
  { format: 'html', label: 'HTML (.html)', status: 'ready' },
  { format: 'odt', label: 'OpenDocument (.odt)', status: 'ready', note: OdtAdapter.limitations[1] },
  { format: 'rtf', label: 'Rich Text (.rtf)', status: 'ready', note: RtfAdapter.limitations[0] },
  { format: 'docx', label: 'Word (.docx)', status: 'planned', note: 'Phase 5 — docx serializer' },
  { format: 'pdf', label: 'PDF (.pdf)', status: 'planned', note: 'Phase 5 — print pipeline' },
]

export class ExportNotReadyError extends Error {}

/** Source of truth is Tiptap JSON; every format is derived from it. */
export async function exportDocument(
  meta: RichDocMeta,
  format: ExportFormat,
): Promise<void> {
  const body = ((await storage.getDocument(meta.id)) as JSONContent) ?? EMPTY_DOC
  const name = slugify(meta.title)

  switch (format) {
    case 'html': {
      const inner = generateHTML(body, baseExtensions)
      const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(meta.title)}</title>
<style>
body{max-width:760px;margin:2rem auto;padding:0 1rem;font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.6;color:#1f1f24}
table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 10px}
blockquote{border-left:3px solid #0d99ff;margin:1em 0;padding:.2em 1em;color:#555}
pre{background:#f4f4f6;border:1px solid #e2e2e6;border-radius:8px;padding:12px;overflow-x:auto}
code{font-family:ui-monospace,monospace}
.callout{border:1px solid #e2e2e6;border-left:4px solid #0d99ff;border-radius:8px;padding:.4em 1em;margin:1em 0}
.callout-warning{border-left-color:#ffa629}.callout-danger{border-left-color:#f24822}.callout-success{border-left-color:#14ae5c}
.wikilink{color:#0d99ff;border-bottom:1px dashed #0d99ff}
img{max-width:100%}
</style>
</head>
<body>
<h1>${escapeHtml(meta.title)}</h1>
${inner}
</body>
</html>`
      downloadText(`${name}.html`, page, 'text/html')
      return
    }
    case 'markdown': {
      const md = `# ${meta.title}\n\n${docJsonToMarkdown(body)}`
      downloadText(`${name}.md`, md, 'text/markdown')
      return
    }
    case 'odt': {
      downloadBlob(`${name}.odt`, await OdtAdapter.exportDocument!(body))
      return
    }
    case 'rtf': {
      downloadBlob(`${name}.rtf`, await RtfAdapter.exportDocument!(body))
      return
    }
    case 'docx':
    case 'pdf': {
      const info = EXPORT_FORMATS.find((f) => f.format === format)
      throw new ExportNotReadyError(
        `${info?.label ?? format} export is planned (${info?.note ?? 'coming soon'}).`,
      )
    }
  }
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/* ---------------- Tiptap JSON → Markdown ---------------- */

function markText(node: JSONContent): string {
  let text = node.text ?? ''
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case 'code':
        text = `\`${text}\``
        break
      case 'bold':
        text = `**${text}**`
        break
      case 'italic':
        text = `*${text}*`
        break
      case 'strike':
        text = `~~${text}~~`
        break
      case 'underline':
        text = `<u>${text}</u>`
        break
      case 'link':
        text = `[${text}](${String(mark.attrs?.href ?? '')})`
        break
    }
  }
  return text
}

function inline(node: JSONContent): string {
  return (node.content ?? [])
    .map((child) => {
      if (child.type === 'text') return markText(child)
      if (child.type === 'wikilink') return `[[${String(child.attrs?.target ?? '')}]]`
      if (child.type === 'hardBreak') return '  \n'
      if (child.type === 'image')
        return `![${String(child.attrs?.alt ?? '')}](${String(child.attrs?.src ?? '')})`
      return inline(child)
    })
    .join('')
}

function block(node: JSONContent, indent = ''): string {
  switch (node.type) {
    case 'paragraph':
      return indent + inline(node)
    case 'heading':
      return `${indent}${'#'.repeat(Number(node.attrs?.level ?? 1))} ${inline(node)}`
    case 'blockquote':
      return (node.content ?? [])
        .map((c) => block(c, indent))
        .join('\n')
        .split('\n')
        .map((l) => `${indent}> ${l.trimStart()}`)
        .join('\n')
    case 'codeBlock':
      return `${indent}\`\`\`${String(node.attrs?.language ?? '')}\n${inline(node)}\n${indent}\`\`\``
    case 'horizontalRule':
      return `${indent}---`
    case 'bulletList':
      return (node.content ?? [])
        .map((li) => listItem(li, `${indent}- `, indent))
        .join('\n')
    case 'orderedList':
      return (node.content ?? [])
        .map((li, i) => listItem(li, `${indent}${i + 1}. `, indent))
        .join('\n')
    case 'taskList':
      return (node.content ?? [])
        .map((li) =>
          listItem(li, `${indent}- [${li.attrs?.checked ? 'x' : ' '}] `, indent),
        )
        .join('\n')
    case 'table':
      return table(node, indent)
    case 'callout': {
      const kind = String(node.attrs?.kind ?? 'info')
      return (node.content ?? [])
        .map((c) => `${indent}> **${kind}:** ${inline(c)}`)
        .join('\n')
    }
    case 'assetEmbed':
      return `${indent}> 📎 embedded asset: \`${String(node.attrs?.assetId ?? '')}\``
    case 'image':
      return `${indent}![${String(node.attrs?.alt ?? '')}](${String(node.attrs?.src ?? '')})`
    default:
      return indent + inline(node)
  }
}

function listItem(li: JSONContent, bullet: string, indent: string): string {
  const children = li.content ?? []
  const lines: string[] = []
  children.forEach((child, i) => {
    if (i === 0 && (child.type === 'paragraph' || child.type === 'text')) {
      lines.push(bullet + inline(child))
    } else {
      lines.push(block(child, `${indent}  `))
    }
  })
  return lines.join('\n') || bullet.trimEnd()
}

function table(node: JSONContent, indent: string): string {
  const rows = node.content ?? []
  const grid = rows.map((row) =>
    (row.content ?? []).map((cell) =>
      (cell.content ?? []).map((c) => inline(c)).join(' ').replace(/\|/g, '\\|'),
    ),
  )
  if (!grid.length) return ''
  const cols = Math.max(...grid.map((r) => r.length))
  const line = (cells: string[]) =>
    `${indent}| ${Array.from({ length: cols }, (_, i) => cells[i] ?? '').join(' | ')} |`
  const out = [line(grid[0]), `${indent}|${' --- |'.repeat(cols)}`]
  for (const row of grid.slice(1)) out.push(line(row))
  return out.join('\n')
}

export function docJsonToMarkdown(body: JSONContent): string {
  return (body.content ?? []).map((n) => block(n)).join('\n\n')
}
