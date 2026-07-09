import type { JSONContent } from '@tiptap/core'
import type { OutlineItem } from '@/types/model'

/**
 * Pure helpers over Tiptap JSON bodies. Everything the app needs from a
 * document without opening it (search snippet, outline, link graph) is
 * digested here on save and stored on RichDocMeta — document bodies are
 * never scanned at query time.
 */

export const EMPTY_DOC: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

function walk(node: JSONContent, visit: (n: JSONContent) => void): void {
  visit(node)
  for (const child of node.content ?? []) walk(child, visit)
}

export function plainText(node: JSONContent): string {
  const parts: string[] = []
  walk(node, (n) => {
    if (n.type === 'text' && n.text) parts.push(n.text)
    else if (n.type === 'wikilink') parts.push(String(n.attrs?.target ?? ''))
    else if (
      n.type === 'paragraph' ||
      n.type === 'heading' ||
      n.type === 'codeBlock' ||
      n.type === 'listItem' ||
      n.type === 'taskItem' ||
      n.type === 'tableRow'
    ) {
      parts.push('\n')
    }
  })
  return parts.join('').replace(/\n{2,}/g, '\n').trim()
}

export interface DocDigest {
  snippet: string
  wordCount: number
  outline: OutlineItem[]
  outgoingLinks: string[]
  linkedAssets: string[]
}

export function digestDocJson(body: JSONContent): DocDigest {
  const outline: OutlineItem[] = []
  const outgoing = new Set<string>()
  const assets = new Set<string>()

  walk(body, (n) => {
    if (n.type === 'heading') {
      const text = plainText(n)
      if (text) outline.push({ level: Number(n.attrs?.level ?? 1), text })
    }
    if (n.type === 'wikilink' && n.attrs?.target) {
      outgoing.add(String(n.attrs.target))
    }
    if (n.type === 'assetEmbed' && n.attrs?.assetId) {
      assets.add(String(n.attrs.assetId))
    }
  })

  const text = plainText(body)
  return {
    snippet: text.replace(/\s+/g, ' ').slice(0, 240),
    wordCount: text ? text.split(/\s+/).filter(Boolean).length : 0,
    outline: outline.slice(0, 100),
    outgoingLinks: [...outgoing],
    linkedAssets: [...assets],
  }
}
