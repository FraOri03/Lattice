/** Digest a code document body into card/search/backlink metadata. */

export interface CodeDigest {
  snippet: string
  lineCount: number
  size: number
  outgoingLinks: string[]
}

export function digestCode(content: string): CodeDigest {
  const outgoing = new Set<string>()
  for (const m of content.matchAll(/\[\[([^[\]\n]+)\]\]/g)) {
    outgoing.add(m[1].trim())
  }
  return {
    snippet: content.slice(0, 400),
    lineCount: content ? content.split('\n').length : 0,
    size: new Blob([content]).size,
    outgoingLinks: [...outgoing],
  }
}
