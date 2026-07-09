import type { RichDocMeta } from '@/types/model'

/**
 * Clickable heading outline. Reads the digested outline from metadata
 * (refreshed on every save) and scrolls the workspace editor's matching
 * heading into view — no editor instance coupling.
 */
export function DocumentOutline({ doc }: { doc: RichDocMeta }) {
  if (!doc.outline.length) {
    return <p className="px-1 text-[11px] text-muted italic">No headings yet</p>
  }

  const jumpTo = (index: number) => {
    const headings = document.querySelectorAll(
      '.richdoc-full .ProseMirror h1, .richdoc-full .ProseMirror h2, .richdoc-full .ProseMirror h3, .richdoc-full .ProseMirror h4, .richdoc-full .ProseMirror h5, .richdoc-full .ProseMirror h6',
    )
    headings[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div>
      {doc.outline.map((item, i) => (
        <button
          key={`${i}-${item.text}`}
          className="block w-full cursor-pointer truncate rounded px-1.5 py-0.5 text-left text-[11.5px] text-muted hover:bg-panel2 hover:text-ink"
          style={{ paddingLeft: `${6 + (item.level - 1) * 12}px` }}
          title={item.text}
          onClick={() => jumpTo(i)}
        >
          {item.text}
        </button>
      ))}
    </div>
  )
}
