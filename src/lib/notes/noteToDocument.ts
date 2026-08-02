import { generateJSON, type JSONContent } from '@tiptap/core'
import { baseExtensions } from '@/components/richdoc/extensions'
import { renderMarkdown } from '@/lib/markdown'

/**
 * Promotion: a note's markdown → a document body (Tiptap JSON).
 *
 * A note is capture and a document is the deliverable, so the only bridge
 * between them runs in this direction. It reuses the note renderer, which
 * means the promotion produces exactly what the note's own Preview tab
 * showed — then rewrites the two constructs whose HTML shape differs
 * between the two worlds:
 *
 * - a wikilink is `<a data-wikilink>` in note HTML but a
 *   `span[data-wikilink]` atom in the document schema;
 * - a task list is a plain `<ul>` of disabled checkboxes in note HTML but
 *   `ul[data-type="taskList"]` / `li[data-type="taskItem"]` in the schema.
 *
 * Everything else (headings, lists, quotes, code blocks, images, inline
 * marks) already parses. Anything the schema does not know degrades to
 * text rather than disappearing — a promotion never silently drops words.
 */
export function markdownToDocBody(markdown: string): JSONContent {
  return generateJSON(noteHtmlToDocHtml(renderMarkdown(markdown)), baseExtensions)
}

/** The HTML-level half of the promotion; exported for its tests. */
export function noteHtmlToDocHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')

  for (const link of [...doc.querySelectorAll('a[data-wikilink]')]) {
    const span = doc.createElement('span')
    span.setAttribute('data-wikilink', link.getAttribute('data-wikilink') ?? '')
    span.textContent = link.textContent
    link.replaceWith(span)
  }

  for (const list of [...doc.querySelectorAll('ul')]) {
    const items = [...list.children]
    // a mixed list is left alone: half a task list would be worse than none
    if (!items.length || !items.every((li) => li.classList.contains('task'))) continue
    list.setAttribute('data-type', 'taskList')
    for (const item of items) {
      const box = item.querySelector('input[type="checkbox"]')
      item.setAttribute('data-type', 'taskItem')
      item.setAttribute('data-checked', box?.hasAttribute('checked') ? 'true' : 'false')
      item.removeAttribute('class')
      box?.remove()
      const paragraph = doc.createElement('p')
      paragraph.innerHTML = item.innerHTML.trim()
      item.replaceChildren(paragraph)
    }
  }

  return doc.body.innerHTML
}
