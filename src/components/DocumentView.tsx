import { lazy, Suspense, useState } from 'react'
import { backlinksToTitle, useStore } from '@/store/useStore'
import { downloadText, slugify } from '@/lib/download'
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
        <div className="flex flex-none rounded-lg border border-bord bg-panel2 p-0.5">
          {(['write', 'preview'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium capitalize ${
                tab === t ? 'bg-panel text-ink shadow-sm' : 'text-muted hover:text-ink'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          className="icon-btn"
          title="Export as .md"
          aria-label="Export note as Markdown"
          onClick={() =>
            downloadText(`${slugify(note.title)}.md`, `# ${note.title}\n\n${note.content}`)
          }
        >
          <ActionIcon.Export size={14} />
        </button>
        {viewMode !== 'board' && (
          <button
            className="icon-btn"
            title="Close editor"
            onClick={() => setViewMode('board')}
          >
            <IcX size={14} />
          </button>
        )}
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
