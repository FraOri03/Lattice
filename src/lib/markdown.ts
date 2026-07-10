/**
 * Minimal markdown renderer with Obsidian-style [[wikilink]] support.
 * Deliberately dependency-free for the MVP; swap for Tiptap/remark later.
 * Output is safe: source is HTML-escaped before any tags are generated.
 */

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * Scheme allow-list for markdown links/images (Phase 8 security fix):
 * escaping alone still lets `[x](javascript:…)` produce a live XSS
 * link. Anything but http(s)/mailto/relative collapses to '#'.
 */
function safeUrl(url: string): string {
  const trimmed = url.trim()
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed
  if (/^[/#.]/.test(trimmed) && !/^\/\//.test(trimmed)) return trimmed
  return '#'
}

/** Images additionally allow safe inline data: images. */
function safeImgUrl(url: string): string {
  const trimmed = url.trim()
  if (/^data:image\/(png|jpe?g|gif|webp|avif);/i.test(trimmed)) return trimmed
  return safeUrl(trimmed)
}

function inline(s: string): string {
  return s
    .replace(
      /!\[([^\]]*)\]\(([^)\s]+)\)/g,
      (_m, alt: string, url: string) => `<img alt="${alt}" src="${safeImgUrl(url)}">`,
    )
    .replace(
      /\[\[([^\]]+)\]\]/g,
      (_m, t: string) =>
        `<a class="wikilink" data-wikilink="${t.trim()}">${t.trim()}</a>`,
    )
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_m, label: string, url: string) =>
        `<a href="${safeUrl(url)}" target="_blank" rel="noreferrer">${label}</a>`,
    )
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
}

// Fenced code blocks are swapped for a sentinel line before any other
// processing, then restored at the end. The sentinel is unlikely to appear
// in user text; if it somehow does without a matching block, the line is
// rendered as a plain paragraph (see guard below).
const BLOCK_OPEN = '%%LATTICE-CODE-'
const BLOCK_CLOSE = '%%'
const BLOCK_RE = /^%%LATTICE-CODE-(\d+)%%$/

export function renderMarkdown(src: string): string {
  const blocks: string[] = []
  const text = escapeHtml(
    src.replace(/```[^\n]*\n([\s\S]*?)```/g, (_m, code: string) => {
      blocks.push(code)
      return BLOCK_OPEN + (blocks.length - 1) + BLOCK_CLOSE
    }),
  )

  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  let quote = false
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`)
      list = null
    }
  }
  const closeQuote = () => {
    if (quote) {
      out.push('</blockquote>')
      quote = false
    }
  }
  const openList = (kind: 'ul' | 'ol') => {
    if (list !== kind) {
      closeList()
      out.push(`<${kind}>`)
      list = kind
    }
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd()

    const block = line.match(BLOCK_RE)
    if (block && blocks[+block[1]] !== undefined) {
      closeList()
      closeQuote()
      out.push(`<pre><code>${escapeHtml(blocks[+block[1]])}</code></pre>`)
      continue
    }
    if (!line.trim()) {
      closeList()
      closeQuote()
      continue
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      closeList()
      closeQuote()
      const level = h[1].length
      out.push(`<h${level}>${inline(h[2])}</h${level}>`)
      continue
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      closeList()
      closeQuote()
      out.push('<hr>')
      continue
    }
    const q = line.match(/^&gt;\s?(.*)$/)
    if (q) {
      closeList()
      if (!quote) {
        out.push('<blockquote>')
        quote = true
      }
      out.push(`<p>${inline(q[1])}</p>`)
      continue
    }
    const task = line.match(/^\s*[-*]\s+\[( |x)\]\s+(.*)$/)
    if (task) {
      closeQuote()
      openList('ul')
      const checked = task[1] === 'x' ? ' checked' : ''
      out.push(
        `<li class="task"><input type="checkbox" disabled${checked}> ${inline(task[2])}</li>`,
      )
      continue
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/)
    if (ul) {
      closeQuote()
      openList('ul')
      out.push(`<li>${inline(ul[1])}</li>`)
      continue
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (ol) {
      closeQuote()
      openList('ol')
      out.push(`<li>${inline(ol[1])}</li>`)
      continue
    }
    closeList()
    closeQuote()
    out.push(`<p>${inline(line)}</p>`)
  }
  closeList()
  closeQuote()
  return out.join('\n')
}

export function extractWikilinks(content: string): string[] {
  return [...content.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim())
}
