import { lazy, Suspense, useState } from 'react'
import { backlinksToTitle, useStore } from '@/store/useStore'
import { useI18n } from '@/lib/i18n'
import { downloadText, slugify } from '@/lib/download'
import { ToolbarAction, ToolbarGroup, ToolbarRoot, ToolbarToggle } from '@/components/ui/toolbar'
import { MarkdownView } from '@/components/MarkdownView'
import { AssetPreviewPane } from '@/components/preview/AssetPreviewPane'
import { RichDocWorkspacePane } from '@/components/richdoc/RichDocWorkspacePane'
import { IcDoc, IcNote, IcPlus, IcX } from '@/components/Icons'
import { ActionIcon } from '@/components/ActionIcons'

// Monaco and friends load only when a code file is opened
const CodeWorkspacePane = lazy(() => import('@/components/code/CodeWorkspacePane'))
// The grid + SheetJS load only when a spreadsheet is opened
const SpreadsheetWorkspace = lazy(() => import('@/components/sheet/SpreadsheetWorkspace'))

export function DocumentView() {
  const notes = useStore((s) => s.notes)
  const assets = useStore((s) => s.assets)
  const docs = useStore((s) => s.docs)
  const sheetDocs = useStore((s) => s.sheetDocs)
  const activeNoteId = useStore((s) => s.activeNoteId)
  const activeAssetId = useStore((s) => s.activeAssetId)
  const activeDocId = useStore((s) => s.activeDocId)
  const activeCodeId = useStore((s) => s.activeCodeId)
  const activeSheetId = useStore((s) => s.activeSheetId)
  const updateNote = useStore((s) => s.updateNote)
  const openNote = useStore((s) => s.openNote)
  const createNote = useStore((s) => s.createNote)
  const setViewMode = useStore((s) => s.setViewMode)
  const viewMode = useStore((s) => s.viewMode)
  const t = useI18n()
  const [tab, setTab] = useState<'write' | 'preview'>('write')

  // Pane priority: open asset > code file > spreadsheet > rich document > note
  const activeAsset = activeAssetId ? assets[activeAssetId] : undefined
  if (activeAsset) return <AssetPreviewPane asset={activeAsset} />
  if (activeCodeId && useStore.getState().codeDocs[activeCodeId]) {
    return (
      <Suspense
        fallback={
          <section className="flex h-full min-w-0 flex-1 items-center justify-center border-r border-bord bg-panel text-xs text-muted">
            Loading code workspace…
          </section>
        }
      >
        <CodeWorkspacePane />
      </Suspense>
    )
  }
  const activeSheet = activeSheetId ? sheetDocs[activeSheetId] : undefined
  if (activeSheet) {
    return (
      <Suspense
        fallback={
          <section className="flex h-full min-w-0 flex-1 items-center justify-center border-r border-bord bg-panel text-xs text-muted">
            Loading spreadsheet workspace…
          </section>
        }
      >
        <SpreadsheetWorkspace meta={activeSheet} />
      </Suspense>
    )
  }
  const activeDoc = activeDocId ? docs[activeDocId] : undefined
  if (activeDoc) return <RichDocWorkspacePane doc={activeDoc} />

  const note = activeNoteId ? notes[activeNoteId] : undefined

  if (!note) {
    return (
      <section className="flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-3 border-r border-bord bg-panel text-muted">
        <IcDoc size={28} />
        <p className="text-sm">No note open</p>
        <button className="btn" onClick={() => openNote(createNote())}>
          <IcPlus size={13} /> New note
        </button>
      </section>
    )
  }

  const backlinks = backlinksToTitle(
    notes,
    docs,
    useStore.getState().codeDocs,
    note.title,
    note.id,
  )

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col border-r border-bord bg-panel">
      {/* header */}
      <div className="flex flex-none items-center gap-2 border-b border-bord px-4 py-2">
        <IcNote size={15} className="flex-none text-muted" />
        <input
          className="min-w-0 flex-1 bg-transparent text-[15px] font-bold outline-none"
          value={note.title}
          onChange={(e) => updateNote(note.id, { title: e.target.value })}
          placeholder="Untitled"
        />
        {/* Deliberately small: a note is markdown, so it inherits none of the
            Document toolbar's formatting grammar — and it needs no
            `preserveFocus`, because nothing here acts on a text selection. */}
        {/* Two sizes on purpose, both matching what was there before: the icon
            actions come from the .icon-btn family, so `md` (32px) keeps them
            from shrinking below their old 28px, while the segmented view switch
            stays `sm` (24px), exactly its previous height. */}
        <ToolbarRoot label={t.toolbar.note.label} className="flex-none gap-1">
          <ToolbarGroup
            label={t.toolbar.note.viewGroup}
            className="rounded-lg border border-bord bg-panel2 p-0.5"
          >
            <ToolbarToggle
              label={t.toolbar.note.write}
              content="icon-text"
              size="sm"
              // px-2.5 restores this pill's original inset: the compact strips
              // use 5px, but a segmented switch is roomier. Per-instance
              // utilities work because the primitive is layered.
              className="px-2.5"
              pressed={tab === 'write'}
              onRun={() => setTab('write')}
            />
            <ToolbarToggle
              label={t.toolbar.note.preview}
              content="icon-text"
              size="sm"
              // px-2.5 restores this pill's original inset: the compact strips
              // use 5px, but a segmented switch is roomier. Per-instance
              // utilities work because the primitive is layered.
              className="px-2.5"
              pressed={tab === 'preview'}
              onRun={() => setTab('preview')}
            />
          </ToolbarGroup>
          <ToolbarAction
            icon={<ActionIcon.Export size={14} />}
            label={t.toolbar.note.exportMd}
            onRun={() =>
              downloadText(`${slugify(note.title)}.md`, `# ${note.title}\n\n${note.content}`)
            }
          />
          {viewMode !== 'board' && (
            <ToolbarAction
              icon={<IcX size={14} />}
              label={t.toolbar.note.close}
              onRun={() => setViewMode('board')}
            />
          )}
        </ToolbarRoot>
      </div>

      {/* body */}
      {tab === 'write' ? (
        <textarea
          className="min-h-0 flex-1 resize-none bg-transparent p-5 font-mono text-[13px] leading-relaxed outline-none"
          value={note.content}
          onChange={(e) => updateNote(note.id, { content: e.target.value })}
          placeholder={'Write markdown…\n\nLink other notes with [[Note title]].'}
          spellCheck={false}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <MarkdownView content={note.content || '*Nothing here yet.*'} />
        </div>
      )}

      {/* backlinks: notes and rich documents that link here */}
      {(backlinks.notes.length > 0 || backlinks.docs.length > 0) && (
        <div className="flex-none border-t border-bord px-4 py-2">
          <span className="mr-2 text-[10px] font-semibold tracking-widest text-muted uppercase">
            Backlinks
          </span>
          {backlinks.notes.map((b) => (
            <button
              key={b.id}
              className="mr-2 cursor-pointer text-xs text-accent hover:underline"
              onClick={() => openNote(b.id)}
            >
              ← {b.title}
            </button>
          ))}
          {backlinks.docs.map((b) => (
            <button
              key={b.id}
              className="mr-2 cursor-pointer text-xs text-accent hover:underline"
              onClick={() => useStore.getState().openDoc(b.id)}
            >
              ← {b.title} <span className="text-muted">(doc)</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
