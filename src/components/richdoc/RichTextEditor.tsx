import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { BubbleMenu, EditorContent, FloatingMenu, useEditor } from '@tiptap/react'
import Placeholder from '@tiptap/extension-placeholder'
import Collaboration, { isChangeOrigin } from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import { prosemirrorJSONToYXmlFragment } from 'y-prosemirror'
import { useStore } from '@/store/useStore'
import { storage } from '@/lib/storage/StorageProvider'
import { EMPTY_DOC } from '@/lib/richdoc/docjson'
import { ASSET_DRAG_MIME, DOC_DRAG_MIME, NOTE_DRAG_MIME } from '@/lib/dnd'
import { importFile } from '@/lib/import/ImportService'
import { useReadOnly } from '@/lib/collab/useCollab'
import { presenceService } from '@/lib/collab/PresenceService'
import {
  colorForUser,
  currentIdentity,
} from '@/lib/collab/CollaborationProvider'
import { yjsManager } from '@/lib/crdt/YjsManager'
import { useCrdtStore } from '@/lib/crdt/crdtStore'
import {
  documentFragment,
  documentNeedsSeed,
  seedDocument,
} from '@/lib/crdt/DocumentCRDT'
import { toast } from '@/components/ui/Toaster'
import { collabBaseExtensions } from './extensions'
import { SlashCommands } from './SlashCommandMenu'
import { AssetPickerDialog } from './AssetPickerDialog'
import { DocumentToolbar, setOrUnsetLink, useEditorTick } from './DocumentToolbar'

export interface RichTextEditorProps {
  docId: string
  /** full: workspace editor with toolbar · mini: inline board-card editor */
  variant: 'full' | 'mini'
}

/**
 * The RichTextEditor — CRDT-native since Phase 8.
 *
 * The editor binds to the document's Y.XmlFragment in the project room:
 * every keystroke is a CRDT update that merges deterministically across
 * tabs (BroadcastChannel) and devices (realtime backend). Last-writer-
 * wins is gone as the active editing model.
 *
 * The stored Tiptap JSON body remains the durable representation: it
 * seeds the fragment once (migration, marker-guarded, original preserved)
 * and is re-exported from CRDT state on every save so Drive backup,
 * version history and the digested metadata keep working unchanged.
 */
export function RichTextEditor({ docId, variant }: RichTextEditorProps) {
  const projectIdOfDoc = useStore((s) => s.docs[docId]?.projectId)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const projectId = projectIdOfDoc ?? activeProjectId
  // rebind collaboration (fragment + awareness) when the transport changes
  const attachEpoch = useCrdtStore((s) => s.attachEpoch)
  const [initial, setInitial] = useState<JSONContent | null>(null)

  useEffect(() => {
    let alive = true
    setInitial(null)
    const room = yjsManager.room(projectId)
    void Promise.all([
      room.loaded,
      storage.getDocument(docId).catch(() => undefined),
    ]).then(([, body]) => {
      if (alive) setInitial((body as JSONContent) ?? EMPTY_DOC)
    })
    return () => {
      alive = false
    }
  }, [docId, projectId])

  if (!initial) {
    return <div className="placeholder">Loading document…</div>
  }
  return (
    <EditorInner
      key={`${docId}:${attachEpoch}`}
      docId={docId}
      projectId={projectId}
      initial={initial}
      variant={variant}
    />
  )
}

function EditorInner({
  docId,
  projectId,
  initial,
  variant,
}: {
  docId: string
  projectId: string
  initial: JSONContent
  variant: 'full' | 'mini'
}) {
  const persistDocContent = useStore((s) => s.persistDocContent)
  const readOnly = useReadOnly()
  const saveTimer = useRef<number | undefined>(undefined)
  /** true when at least one local (non-CRDT-remote) edit awaits saving */
  const locallyDirty = useRef(false)
  const insertAtRef = useRef<number | null>(null)
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const imageInput = useRef<HTMLInputElement>(null)

  // CRDT bindings — stable for the lifetime of this mount (keyed above)
  const { room, fragment, cursorProvider, user } = useMemo(() => {
    const room = yjsManager.room(projectId)
    const identity = currentIdentity()
    return {
      room,
      fragment: documentFragment(room, docId),
      cursorProvider: { awareness: yjsManager.contentAwareness(projectId) },
      user: {
        name: identity.name || 'User',
        color: colorForUser(identity.userId),
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, docId])

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      ...collabBaseExtensions,
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
      Collaboration.configure({ fragment }),
      CollaborationCursor.configure({ provider: cursorProvider, user }),
    ],
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
    onUpdate: ({ editor, transaction }) => {
      // export the durable JSON body from the current CRDT state; remote
      // CRDT changes persist silently (the author logs their own edit)
      if (!isChangeOrigin(transaction)) locallyDirty.current = true
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        const silent = !locallyDirty.current
        locallyDirty.current = false
        persistDocContent(docId, editor.getJSON(), { silent })
      }, 700)
    },
    onFocus: () => {
      const meta = useStore.getState().docs[docId]
      presenceService.setEditing({ kind: 'doc', id: docId, title: meta?.title ?? 'document' })
    },
    onBlur: () => presenceService.setEditing(undefined),
  })
  const editorRef = useRef(editor)
  editorRef.current = editor
  useEditorTick(variant === 'mini' ? null : editor)

  // Migration: seed the fragment from the stored body exactly once. Runs
  // after the editor exists because seeding needs its ProseMirror schema.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (documentNeedsSeed(room, docId)) {
      seedDocument(room, docId, (frag) =>
        prosemirrorJSONToYXmlFragment(editor.schema, initial, frag),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, docId])

  // role changes (or "view as" preview) flip editability live
  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  // never leave a stale "editing…" indicator behind
  useEffect(() => () => presenceService.setEditing(undefined), [docId])

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
    else if (outcome.kind === 'error')
      toast.error('Image import failed', `${outcome.fileName}: ${outcome.message}`)
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
