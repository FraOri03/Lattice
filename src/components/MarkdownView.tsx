import { useMemo } from 'react'
import { renderMarkdown } from '@/lib/markdown'
import { useStore } from '@/store/useStore'

/**
 * Rendered markdown with clickable [[wikilinks]].
 * Clicking a wikilink opens (or creates) the target note in the editor.
 */
export function MarkdownView({
  content,
  className = '',
}: {
  content: string
  className?: string
}) {
  const openWikilink = useStore((s) => s.openWikilink)
  const html = useMemo(() => renderMarkdown(content), [content])

  return (
    <div
      className={`md ${className}`}
      onClick={(e) => {
        const link = (e.target as HTMLElement).closest('a[data-wikilink]')
        if (link) {
          e.preventDefault()
          e.stopPropagation()
          openWikilink(link.getAttribute('data-wikilink')!)
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
