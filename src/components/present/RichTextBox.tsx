import { useEffect } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import type { JSONContent } from '@tiptap/core'
import type { TextRender } from '@/lib/present/textStyles'
import { plainFromDoc } from '@/lib/present/richtext'

/**
 * Inline rich editing for a slide text box (19E.3).
 *
 * Built on the same editor Lattice already uses for documents, so a slide's
 * text is the same kind of object as a document's — one representation, and
 * the one `DocumentCRDT` already knows how to merge.
 *
 * Two deliberate settings:
 *
 * - **`history: false`.** The deck owns undo (`useDeckHistory`). An editor with
 *   its own stack would answer Ctrl+Z first and unwind text while the deck
 *   unwound something else.
 * - **no `openOnClick`.** A link is content here, not navigation; clicking a
 *   slide must never leave the deck.
 */
export function RichTextBox({
  doc,
  render,
  autofocus,
  onChange,
  onDone,
}: {
  doc: JSONContent
  render: TextRender
  autofocus: boolean
  onChange: (doc: JSONContent, plain: string) => void
  onDone: () => void
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false, heading: false, codeBlock: false, blockquote: false }),
      Underline,
      Link.configure({ openOnClick: false, autolink: false }),
    ],
    content: doc,
    autofocus: autofocus ? 'end' : false,
    editorProps: {
      attributes: {
        // the box already carries the typography; the editor only has to not
        // fight it, and to keep the caret inside the shape
        style: 'outline:none; min-height:1em;',
        'aria-label': 'Slide text',
      },
    },
    onUpdate: ({ editor: e }) => {
      const json = e.getJSON()
      onChange(json, plainFromDoc(json))
    },
  })

  // keep the caret out of the way of the canvas' own key handling
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const stop = (e: Event) => e.stopPropagation()
    dom.addEventListener('keydown', stop)
    return () => dom.removeEventListener('keydown', stop)
  }, [editor])

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent:
          render.valign === 'middle' ? 'center' : render.valign === 'bottom' ? 'flex-end' : 'flex-start',
        padding: render.padding,
        fontSize: render.size,
        fontFamily: render.fontFamily,
        fontWeight: render.weight,
        textAlign: render.align,
        color: render.color,
        lineHeight: render.lineHeight,
        letterSpacing: `${render.letterSpacing}em`,
        boxSizing: 'border-box',
        cursor: 'text',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={onDone}
    >
      <EditorContent editor={editor} />
    </div>
  )
}
