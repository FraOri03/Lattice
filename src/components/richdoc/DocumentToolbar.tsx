import { useEffect, useReducer } from 'react'
import type { Editor } from '@tiptap/core'
import type { CalloutKind } from './extensions'
import { useI18n, type Catalog } from '@/lib/i18n'
import { promptDialog } from '@/components/ui/ConfirmDialog'
import { IcImage, IcLink, IcTable } from '@/components/Icons'
import {
  ToolbarAction,
  ToolbarGroup,
  ToolbarRoot,
  ToolbarSelect,
  ToolbarSeparator,
  ToolbarToggle,
} from '@/components/ui/toolbar'

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

/**
 * Set or clear the link on the selection.
 *
 * Uses the app's own prompt, not `window.prompt`: the audit found the same
 * interaction implemented two ways (the board already used `promptDialog`),
 * and a native prompt cannot be translated.
 */
export function setOrUnsetLink(editor: Editor, t: Catalog): void {
  const existing = editor.getAttributes('link').href as string | undefined
  const copy = t.toolbar.document.linkPrompt
  void promptDialog({
    title: copy.title,
    body: copy.body,
    label: copy.label,
    placeholder: 'https://…',
    initialValue: existing ?? '',
    confirmLabel: copy.confirm,
  }).then((url) => {
    if (url === null) return // cancelled
    if (!url.trim()) editor.chain().focus().unsetLink().run()
    else editor.chain().focus().setLink({ href: url.trim() }).run()
  })
}

/** Contextual table controls, shown only while the selection is in a table. */
export function TableControls({ editor }: { editor: Editor }) {
  const t = useI18n()
  const table = t.toolbar.document.table
  const c = () => editor.chain().focus()
  return (
    <ToolbarGroup
      label={table.group}
      className="gap-0.5 rounded-md border border-bord bg-panel2 px-1 py-0.5"
    >
      <span
        aria-hidden
        className="px-1 text-[10px] font-semibold tracking-wider text-muted uppercase"
      >
        {table.group}
      </span>
      <ToolbarAction icon="+Row" label={table.addRow} onRun={() => c().addRowAfter().run()} />
      <ToolbarAction
        icon="+Col"
        label={table.addColumn}
        onRun={() => c().addColumnAfter().run()}
      />
      <ToolbarAction icon="−Row" label={table.deleteRow} onRun={() => c().deleteRow().run()} />
      <ToolbarAction
        icon="−Col"
        label={table.deleteColumn}
        onRun={() => c().deleteColumn().run()}
      />
      <ToolbarAction
        icon="Hdr"
        label={table.headerRow}
        onRun={() => c().toggleHeaderRow().run()}
      />
      <ToolbarAction icon="✕" label={table.deleteTable} onRun={() => c().deleteTable().run()} />
    </ToolbarGroup>
  )
}

/**
 * Fixed toolbar for the full document workspace, on the shared primitives
 * (Phase 11.1.5a). Keyboard shortcuts (Ctrl+B/I/U…, Ctrl+Z) come from Tiptap
 * itself; the toolbar only names them in its tooltips.
 *
 * Every control here already existed — this phase normalises the grammar, it
 * does not add editing features.
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
  const t = useI18n()
  const d = t.toolbar.document
  const c = () => editor.chain().focus()

  const blockValue = editor.isActive('heading')
    ? `h${editor.getAttributes('heading').level}`
    : 'p'

  return (
    <ToolbarRoot
      label={d.label}
      size="sm"
      // clicking a control keeps the caret and the selection in the editor,
      // which is what the old TBtn's mousedown preventDefault was for
      preserveFocus
      className="flex-none flex-wrap gap-0.5 border-b border-bord bg-panel px-2 py-1"
    >
      <ToolbarGroup label={t.toolbar.groups.history}>
        <ToolbarAction
          icon="↶"
          label={d.undo}
          shortcut="Ctrl+Z"
          disabled={!editor.can().undo()}
          onRun={() => c().undo().run()}
        />
        <ToolbarAction
          icon="↷"
          label={d.redo}
          shortcut="Ctrl+Y"
          disabled={!editor.can().redo()}
          onRun={() => c().redo().run()}
        />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarSelect
        label={d.blockType}
        value={blockValue}
        options={[
          { value: 'p', label: d.text },
          ...[1, 2, 3, 4, 5, 6].map((l) => ({ value: `h${l}`, label: d.heading(l) })),
        ]}
        onChange={(v) => {
          if (v === 'p') c().setParagraph().run()
          else c().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 }).run()
        }}
      />

      <ToolbarSeparator />

      <ToolbarGroup label={d.groups.textStyle}>
        <ToolbarToggle
          icon={<b>B</b>}
          label={d.bold}
          shortcut="Ctrl+B"
          pressed={editor.isActive('bold')}
          onRun={() => c().toggleBold().run()}
        />
        <ToolbarToggle
          icon={<i>I</i>}
          label={d.italic}
          shortcut="Ctrl+I"
          pressed={editor.isActive('italic')}
          onRun={() => c().toggleItalic().run()}
        />
        <ToolbarToggle
          icon={<u>U</u>}
          label={d.underline}
          shortcut="Ctrl+U"
          pressed={editor.isActive('underline')}
          onRun={() => c().toggleUnderline().run()}
        />
        <ToolbarToggle
          icon={<s>S</s>}
          label={d.strike}
          pressed={editor.isActive('strike')}
          onRun={() => c().toggleStrike().run()}
        />
        <ToolbarToggle
          icon={'<>'}
          label={d.inlineCode}
          pressed={editor.isActive('code')}
          onRun={() => c().toggleCode().run()}
        />
        <ToolbarToggle
          icon={<IcLink size={12} />}
          label={d.link}
          pressed={editor.isActive('link')}
          onRun={() => setOrUnsetLink(editor, t)}
        />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup label={d.groups.lists}>
        <ToolbarToggle
          icon="•≡"
          label={d.bulletList}
          pressed={editor.isActive('bulletList')}
          onRun={() => c().toggleBulletList().run()}
        />
        <ToolbarToggle
          icon="1≡"
          label={d.numberedList}
          pressed={editor.isActive('orderedList')}
          onRun={() => c().toggleOrderedList().run()}
        />
        <ToolbarToggle
          icon="☑"
          label={d.checklist}
          pressed={editor.isActive('taskList')}
          onRun={() => c().toggleTaskList().run()}
        />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup label={d.groups.blocks}>
        <ToolbarToggle
          icon="❝"
          label={d.quote}
          pressed={editor.isActive('blockquote')}
          onRun={() => c().toggleBlockquote().run()}
        />
        <ToolbarToggle
          icon={'{ }'}
          label={d.codeBlock}
          pressed={editor.isActive('codeBlock')}
          onRun={() => c().toggleCodeBlock().run()}
        />
        <ToolbarToggle
          icon="ℹ"
          label={d.callout}
          pressed={editor.isActive('callout')}
          onRun={() => c().toggleCallout('info' as CalloutKind).run()}
        />
        <ToolbarAction
          icon="—"
          label={d.divider}
          onRun={() => c().setHorizontalRule().run()}
        />
      </ToolbarGroup>

      <ToolbarSeparator />

      {/* Inserting is not a toggle: these carry no pressed state, unlike the
          old shared TBtn which put aria-pressed on every button it rendered. */}
      <ToolbarGroup label={d.groups.insert}>
        <ToolbarAction
          icon={<IcTable size={12} />}
          label={d.insertTable}
          onRun={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        />
        <ToolbarAction icon={<IcImage size={12} />} label={d.insertImage} onRun={onImage} />
        <ToolbarAction icon="📎" label={d.embedAsset} onRun={onAsset} />
      </ToolbarGroup>

      {editor.isActive('table') && (
        <>
          <ToolbarSeparator />
          <TableControls editor={editor} />
        </>
      )}
    </ToolbarRoot>
  )
}
