import { useEffect, useReducer } from 'react'
import type { Editor } from '@tiptap/core'
import type { CalloutKind } from './extensions'
import { IcImage, IcLink, IcTable } from '@/components/Icons'
import { ToolbarDivider } from '@/components/ui/ToolbarDivider'

/** Re-render on every editor transaction so active states stay fresh. */
export function useEditorTick(editor: Editor | null): void {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    if (!editor) return
    const tick = () => force()
    editor.on('transaction', tick)
    editor.on('selectionUpdate', tick)
    return () => {
      editor.off('transaction', tick)
      editor.off('selectionUpdate', tick)
    }
  }, [editor])
}

function TBtn({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active?: boolean
  disabled?: boolean
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      className={`tbtn ${active ? 'is-active' : ''}`}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault() /* keep editor focus */}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

const Sep = () => <ToolbarDivider />

export function setOrUnsetLink(editor: Editor): void {
  const existing = editor.getAttributes('link').href as string | undefined
  const url = window.prompt('Link URL (empty to remove)', existing ?? 'https://')
  if (url === null) return
  if (!url.trim()) editor.chain().focus().unsetLink().run()
  else editor.chain().focus().setLink({ href: url.trim() }).run()
}

/** Contextual table controls, shown only while the selection is in a table. */
export function TableControls({ editor }: { editor: Editor }) {
  const c = () => editor.chain().focus()
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-bord bg-panel2 px-1 py-0.5">
      <span className="px-1 text-[10px] font-semibold tracking-wider text-muted uppercase">
        Table
      </span>
      <TBtn title="Add row below" onClick={() => c().addRowAfter().run()}>+Row</TBtn>
      <TBtn title="Add column right" onClick={() => c().addColumnAfter().run()}>+Col</TBtn>
      <TBtn title="Delete row" onClick={() => c().deleteRow().run()}>−Row</TBtn>
      <TBtn title="Delete column" onClick={() => c().deleteColumn().run()}>−Col</TBtn>
      <TBtn title="Toggle header row" onClick={() => c().toggleHeaderRow().run()}>Hdr</TBtn>
      <TBtn title="Delete table" onClick={() => c().deleteTable().run()}>✕</TBtn>
    </div>
  )
}

/**
 * Fixed toolbar for the full document workspace. Keyboard shortcuts
 * (Ctrl+B/I/U…, Ctrl+Z) come from Tiptap itself.
 */
export function DocumentToolbar({
  editor,
  onImage,
  onAsset,
}: {
  editor: Editor
  onImage: () => void
  onAsset: () => void
}) {
  useEditorTick(editor)
  const c = () => editor.chain().focus()

  const blockValue = editor.isActive('heading')
    ? `h${editor.getAttributes('heading').level}`
    : 'p'

  return (
    <div className="doc-toolbar">
      <TBtn title="Undo (Ctrl+Z)" disabled={!editor.can().undo()} onClick={() => c().undo().run()}>↶</TBtn>
      <TBtn title="Redo (Ctrl+Y)" disabled={!editor.can().redo()} onClick={() => c().redo().run()}>↷</TBtn>
      <Sep />
      <select
        className="tbtn h-6 cursor-pointer bg-transparent pr-1 text-xs outline-none"
        value={blockValue}
        title="Block type"
        onChange={(e) => {
          const v = e.target.value
          if (v === 'p') c().setParagraph().run()
          else c().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 }).run()
        }}
      >
        <option value="p">Text</option>
        {[1, 2, 3, 4, 5, 6].map((l) => (
          <option key={l} value={`h${l}`}>{`Heading ${l}`}</option>
        ))}
      </select>
      <Sep />
      <TBtn title="Bold (Ctrl+B)" active={editor.isActive('bold')} onClick={() => c().toggleBold().run()}>
        <b>B</b>
      </TBtn>
      <TBtn title="Italic (Ctrl+I)" active={editor.isActive('italic')} onClick={() => c().toggleItalic().run()}>
        <i>I</i>
      </TBtn>
      <TBtn title="Underline (Ctrl+U)" active={editor.isActive('underline')} onClick={() => c().toggleUnderline().run()}>
        <u>U</u>
      </TBtn>
      <TBtn title="Strikethrough" active={editor.isActive('strike')} onClick={() => c().toggleStrike().run()}>
        <s>S</s>
      </TBtn>
      <TBtn title="Inline code" active={editor.isActive('code')} onClick={() => c().toggleCode().run()}>
        {'<>'}
      </TBtn>
      <TBtn title="Link" active={editor.isActive('link')} onClick={() => setOrUnsetLink(editor)}>
        <IcLink size={12} />
      </TBtn>
      <Sep />
      <TBtn title="Bullet list" active={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()}>
        •≡
      </TBtn>
      <TBtn title="Numbered list" active={editor.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()}>
        1≡
      </TBtn>
      <TBtn title="Checklist" active={editor.isActive('taskList')} onClick={() => c().toggleTaskList().run()}>
        ☑
      </TBtn>
      <Sep />
      <TBtn title="Quote" active={editor.isActive('blockquote')} onClick={() => c().toggleBlockquote().run()}>
        ❝
      </TBtn>
      <TBtn title="Code block" active={editor.isActive('codeBlock')} onClick={() => c().toggleCodeBlock().run()}>
        {'{ }'}
      </TBtn>
      <TBtn
        title="Callout"
        active={editor.isActive('callout')}
        onClick={() => c().toggleCallout('info' as CalloutKind).run()}
      >
        ℹ
      </TBtn>
      <TBtn title="Divider" onClick={() => c().setHorizontalRule().run()}>—</TBtn>
      <Sep />
      <TBtn
        title="Insert table"
        active={editor.isActive('table')}
        onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <IcTable size={12} />
      </TBtn>
      <TBtn title="Insert image" onClick={onImage}>
        <IcImage size={12} />
      </TBtn>
      <TBtn title="Embed asset" onClick={onAsset}>📎</TBtn>
      {editor.isActive('table') && (
        <>
          <Sep />
          <TableControls editor={editor} />
        </>
      )}
    </div>
  )
}
