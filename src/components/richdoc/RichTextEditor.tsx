import { useEffect, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { BubbleMenu, EditorContent, FloatingMenu, useEditor } from '@tiptap/react'
import Placeholder from '@tiptap/extension-placeholder'
import { useStore } from '@/store/useStore'
import { storage } from '@/lib/storage/StorageProvider'
import { EMPTY_DOC } from '@/lib/richdoc/docjson'
import { ASSET_DRAG_MIME, DOC_DRAG_MIME, NOTE_DRAG_MIME } from '@/lib/dnd'
import { importFile } from '@/lib/import/ImportService'
import { baseExtensions } from './extensions'
import { SlashCommands } from './SlashCommandMenu'
import { AssetPickerDialog } from './AssetPickerDialog'
import { DocumentToolbar, setOrUnsetLink, useEditorTick } from './DocumentToolbar'

export interface RichTextEditorProps {
  docId: string
  /** full: workspace editor with toolbar · mini: inline board-card editor */
  variant: 'full' | 'mini'
}

/**
 * The RichTextEditor. Loads the document body lazily from the
 * StorageProvider, then debounce-saves JSON back on every change,
 * refreshing the digested metadata (snippet, outline, link graph).
 */
export function RichTextEditor({ docId, variant }: RichTextEditorProps) {
  const [initial, setInitial] = useState<JSONContent | null>(null)

  useEffect(() => {
    let alive = true
    setInitial(null)
    void storage
      .getDocument(docId)
      .then((body) => {
        if (alive) setInitial((body as JSONContent) ?? EMPTY_DOC)
      })
      .catch(() => {
        if (alive) setInitial(EMPTY_DOC)
      })
    return () => {
      alive = false
    }
  }, [docId])

  if (!initial) {
    return <div className="placeholder">Loading document…</div>
  }
  return <EditorInner key={docId} docId={docId} initial={initial} variant={variant} />
}

function EditorInner({
  docId,
  initial,
  variant,
}: {
  docId: string
  initial: JSONContent
  variant: 'full' | 'mini'
}) {
  const persistDocContent = useStore((s) => s.persistDocContent)
  const saveTimer = useRef<number | undefined>(undefined)
  const insertAtRef = useRef<number | null>(null)
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const imageInput = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [
      ...baseExtensions,
      Placeholder.configure({
        placeholder: variant === 'full' ? "Type '/' for commands…" : 'Write…',
      }),
      SlashCommands({
        openImagePicker: (at) => {
          insertAtRef.current = at
          imageInput.current?.click()
        },
        openAssetPicker: (at) => {
          insertAtRef.current = at
          setAssetPickerOpen(true)
        },
      }),
    ],
    content: initial,
    editorProps: {
      attributes: { class: 'richdoc-content' },
      handleClickOn(_view, _pos, node) {
        if (node.type.name === 'wikilink') {
          useStore.getState().openWikilink(String(node.attrs.target))
          return true
        }
        return false
      },
      // Dropping sidebar items into the text: assets embed, notes/docs
      // become wikilinks — the document joins the knowledge graph.
      handleDrop(view, event) {
        const dt = event.dataTransfer
        if (!dt) return false
        const assetId = dt.getData(ASSET_DRAG_MIME)
        const noteId = dt.getData(NOTE_DRAG_MIME)
        const droppedDocId = dt.getData(DOC_DRAG_MIME)
        if (!assetId && !noteId && !droppedDocId) return false
        event.preventDefault()
        const pos =
          view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ??
          view.state.selection.from
        const s = useStore.getState()
        if (assetId && s.assets[assetId]) {
          editorRef.current
            ?.chain()
            .focus()
            .insertContentAt(pos, { type: 'assetEmbed', attrs: { assetId } })
            .run()
        } else {
          const title = noteId
            ? s.notes[noteId]?.title
            : s.docs[droppedDocId]?.title
          if (title) {
            editorRef.current
              ?.chain()
              .focus()
              .insertContentAt(pos, [
                { type: 'wikilink', attrs: { target: title } },
                { type: 'text', text: ' ' },
              ])
              .run()
          }
        }
        return true
      },
    },
    onUpdate: ({ editor }) => {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(
        () => persistDocContent(docId, editor.getJSON()),
        700,
      )
    },
  })
  const editorRef = useRef(editor)
  editorRef.current = editor
  useEditorTick(variant === 'mini' ? null : editor)

  // Flush pending changes when the editor unmounts (tab switch, card close…)
  useEffect(() => {
    return () => {
      if (saveTimer.current !== undefined) {
        window.clearTimeout(saveTimer.current)
        const ed = editorRef.current
        if (ed && !ed.isDestroyed) persistDocContent(docId, ed.getJSON())
      }
    }
  }, [docId, persistDocContent])

  const insertEmbed = (assetId: string) => {
    const at = insertAtRef.current
    insertAtRef.current = null
    const chain = editorRef.current?.chain().focus()
    if (!chain) return
    if (at != null) {
      chain.insertContentAt(at, { type: 'assetEmbed', attrs: { assetId } }).run()
    } else {
      chain.insertContent({ type: 'assetEmbed', attrs: { assetId } }).run()
    }
  }

  const onPickImageFile = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    const outcome = await importFile(file)
    if (outcome.kind === 'asset') insertEmbed(outcome.asset.id)
    else if (outcome.kind === 'error') alert(`${outcome.fileName}: ${outcome.message}`)
  }

  return (
    <div className={`richdoc richdoc-${variant} flex h-full min-h-0 flex-col`}>
      {variant === 'full' && editor && (
        <DocumentToolbar
          editor={editor}
          onImage={() => {
            insertAtRef.current = null
            imageInput.current?.click()
          }}
          onAsset={() => {
            insertAtRef.current = null
            setAssetPickerOpen(true)
          }}
        />
      )}

      {editor && (
        <BubbleMenu
          editor={editor}
          tippyOptions={{ duration: 120, maxWidth: 'none' }}
          shouldShow={({ editor, state }) =>
            editor.isEditable &&
            !state.selection.empty &&
            !(state.selection instanceof NodeSelection) &&
            !editor.isActive('codeBlock')
          }
        >
          <div className="bubble-menu">
            <button
              className={`tbtn ${editor.isActive('bold') ? 'is-active' : ''}`}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <b>B</b>
            </button>
            <button
              className={`tbtn ${editor.isActive('italic') ? 'is-active' : ''}`}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <i>I</i>
            </button>
            <button
              className={`tbtn ${editor.isActive('underline') ? 'is-active' : ''}`}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <u>U</u>
            </button>
            <button
              className={`tbtn ${editor.isActive('strike') ? 'is-active' : ''}`}
              onClick={() => editor.chain().focus().toggleStrike().run()}
            >
              <s>S</s>
            </button>
            <button
              className={`tbtn ${editor.isActive('code') ? 'is-active' : ''}`}
              onClick={() => editor.chain().focus().toggleCode().run()}
            >
              {'<>'}
            </button>
            <button
              className={`tbtn ${editor.isActive('link') ? 'is-active' : ''}`}
              onClick={() => setOrUnsetLink(editor)}
            >
              Link
            </button>
          </div>
        </BubbleMenu>
      )}

      {variant === 'full' && editor && (
        <FloatingMenu editor={editor} tippyOptions={{ duration: 120, placement: 'left' }}>
          {/* BlockMenu: quick block picker on empty lines */}
          <div className="block-menu">
            <button className="tbtn" title="Heading 1" onClick={() => editor.chain().focus().setHeading({ level: 1 }).run()}>H1</button>
            <button className="tbtn" title="Heading 2" onClick={() => editor.chain().focus().setHeading({ level: 2 }).run()}>H2</button>
            <button className="tbtn" title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>•≡</button>
            <button className="tbtn" title="Checklist" onClick={() => editor.chain().focus().toggleTaskList().run()}>☑</button>
            <span className="px-1 text-[10px] text-muted">/ for more</span>
          </div>
        </FloatingMenu>
      )}

      <div
        className={`min-h-0 flex-1 overflow-y-auto ${variant === 'mini' ? 'nowheel nodrag' : ''}`}
      >
        <EditorContent editor={editor} className="h-full" />
      </div>

      <AssetPickerDialog
        open={assetPickerOpen}
        onClose={() => setAssetPickerOpen(false)}
        onPick={(asset) => {
          setAssetPickerOpen(false)
          insertEmbed(asset.id)
        }}
      />
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void onPickImageFile(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
