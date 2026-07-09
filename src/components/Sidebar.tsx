import { useMemo, useRef, useState } from 'react'
import { useStore, exportVaultFull, type SidebarFilter } from '@/store/useStore'
import type { RecentEntry, VaultExport } from '@/types/model'
import { downloadText } from '@/lib/download'
import { formatBytes } from '@/lib/media'
import {
  ASSET_DRAG_MIME,
  CODE_DRAG_MIME,
  DOC_DRAG_MIME,
  NOTE_DRAG_MIME,
  SHEET_DRAG_MIME,
} from '@/lib/dnd'
import { importFiles, reportErrors } from '@/lib/import/ImportService'
import { labelForLang } from '@/lib/code/languages'
import { FileKindIcon, fileKindForAsset, type FileKind } from '@/lib/registry/fileKinds'
import { ProjectSwitcher } from '@/components/projects/ProjectSwitcher'
import {
  IcBoard,
  IcClock,
  IcDownload,
  IcPlus,
  IcSearch,
  IcTag,
  IcTrash,
  IcUpload,
} from '@/components/Icons'

const FILTERS: { key: SidebarFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'notes', label: 'Notes' },
  { key: 'docs', label: 'Docs' },
  { key: 'sheets', label: 'Sheets' },
  { key: 'code', label: 'Code' },
  { key: 'assets', label: 'Files' },
]

const RECENT_KIND: Record<RecentEntry['kind'], FileKind> = {
  note: 'note',
  doc: 'richdoc',
  sheet: 'sheet',
  code: 'code',
  asset: 'file',
  board: 'board',
}

export function Sidebar() {
  const boards = useStore((s) => s.boards)
  const boardOrder = useStore((s) => s.boardOrder)
  const activeBoardId = useStore((s) => s.activeBoardId)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const setActiveBoard = useStore((s) => s.setActiveBoard)
  const addBoard = useStore((s) => s.addBoard)
  const deleteBoard = useStore((s) => s.deleteBoard)
  const notes = useStore((s) => s.notes)
  const assets = useStore((s) => s.assets)
  const docs = useStore((s) => s.docs)
  const codeDocs = useStore((s) => s.codeDocs)
  const sheetDocs = useStore((s) => s.sheetDocs)
  const activeNoteId = useStore((s) => s.activeNoteId)
  const activeAssetId = useStore((s) => s.activeAssetId)
  const activeDocId = useStore((s) => s.activeDocId)
  const activeCodeId = useStore((s) => s.activeCodeId)
  const activeSheetId = useStore((s) => s.activeSheetId)
  const recents = useStore((s) => s.recents)
  const openNote = useStore((s) => s.openNote)
  const openAsset = useStore((s) => s.openAsset)
  const openDoc = useStore((s) => s.openDoc)
  const openCode = useStore((s) => s.openCode)
  const openSheet = useStore((s) => s.openSheet)
  const createNote = useStore((s) => s.createNote)
  const createDoc = useStore((s) => s.createDoc)
  const createCode = useStore((s) => s.createCode)
  const createSheetDoc = useStore((s) => s.createSheetDoc)
  const deleteNote = useStore((s) => s.deleteNote)
  const deleteAsset = useStore((s) => s.deleteAsset)
  const deleteDoc = useStore((s) => s.deleteDoc)
  const deleteCode = useStore((s) => s.deleteCode)
  const deleteSheetDoc = useStore((s) => s.deleteSheetDoc)
  const search = useStore((s) => s.search)
  const setSearch = useStore((s) => s.setSearch)
  const tagFilter = useStore((s) => s.tagFilter)
  const setTagFilter = useStore((s) => s.setTagFilter)
  const sidebarFilter = useStore((s) => s.sidebarFilter)
  const setSidebarFilter = useStore((s) => s.setSidebarFilter)
  const importVault = useStore((s) => s.importVault)

  const vaultInput = useRef<HTMLInputElement>(null)
  const filesInput = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)

  const q = search.trim().toLowerCase()
  const show = (f: SidebarFilter) => sidebarFilter === 'all' || sidebarFilter === f

  const projectBoards = useMemo(
    () => boardOrder.filter((id) => boards[id]?.projectId === activeProjectId),
    [boardOrder, boards, activeProjectId],
  )

  const noteList = useMemo(
    () =>
      Object.values(notes)
        .filter(
          (n) =>
            n.projectId === activeProjectId &&
            (!q ||
              n.title.toLowerCase().includes(q) ||
              n.content.toLowerCase().includes(q)) &&
            (!tagFilter || n.tags.includes(tagFilter)),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [notes, q, tagFilter, activeProjectId],
  )

  const assetList = useMemo(
    () =>
      Object.values(assets)
        .filter(
          (a) =>
            a.projectId === activeProjectId &&
            (!q ||
              a.name.toLowerCase().includes(q) ||
              a.originalName.toLowerCase().includes(q)),
        )
        .sort((a, b) => b.importedAt - a.importedAt),
    [assets, q, activeProjectId],
  )

  const docList = useMemo(
    () =>
      Object.values(docs)
        .filter(
          (d) =>
            d.projectId === activeProjectId &&
            (!q ||
              d.title.toLowerCase().includes(q) ||
              d.snippet.toLowerCase().includes(q)),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [docs, q, activeProjectId],
  )

  const codeList = useMemo(
    () =>
      Object.values(codeDocs)
        .filter(
          (c) =>
            c.projectId === activeProjectId &&
            (!q ||
              c.title.toLowerCase().includes(q) ||
              c.snippet.toLowerCase().includes(q)),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [codeDocs, q, activeProjectId],
  )

  const sheetList = useMemo(
    () =>
      Object.values(sheetDocs)
        .filter(
          (sh) =>
            sh.projectId === activeProjectId &&
            (!q ||
              sh.title.toLowerCase().includes(q) ||
              sh.snippet.toLowerCase().includes(q) ||
              sh.sheetNames.some((n) => n.toLowerCase().includes(q))),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [sheetDocs, q, activeProjectId],
  )

  const allTags = useMemo(
    () =>
      [
        ...new Set(
          Object.values(notes)
            .filter((n) => n.projectId === activeProjectId)
            .flatMap((n) => n.tags),
        ),
      ].sort(),
    [notes, activeProjectId],
  )

  const recentRows = useMemo(() => {
    if (q || sidebarFilter !== 'all') return []
    return recents
      .map((r) => {
        const label =
          r.kind === 'note' ? notes[r.id]?.title
          : r.kind === 'doc' ? docs[r.id]?.title
          : r.kind === 'sheet' ? sheetDocs[r.id]?.title
          : r.kind === 'code' ? codeDocs[r.id] && `${codeDocs[r.id].title}.${codeDocs[r.id].extension}`
          : r.kind === 'asset' ? assets[r.id]?.name
          : boards[r.id]?.name
        return label ? { ...r, label } : null
      })
      .filter((r): r is RecentEntry & { label: string } => !!r)
      .slice(0, 5)
  }, [recents, notes, docs, sheetDocs, codeDocs, assets, boards, q, sidebarFilter])

  const openRecent = (r: RecentEntry) => {
    if (r.kind === 'note') openNote(r.id)
    else if (r.kind === 'doc') openDoc(r.id)
    else if (r.kind === 'sheet') openSheet(r.id)
    else if (r.kind === 'code') openCode(r.id)
    else if (r.kind === 'asset') openAsset(r.id)
    else setActiveBoard(r.id)
  }

  /** Universal import: any file type, from the sidebar. */
  const onImportFiles = async (list: FileList | null) => {
    const outcomes = await importFiles(Array.from(list ?? []))
    reportErrors(outcomes)
    const firstDoc = outcomes.find((o) => o.kind === 'richdoc')
    const firstSheet = outcomes.find((o) => o.kind === 'sheet')
    const firstCode = outcomes.find((o) => o.kind === 'code')
    const firstAsset = outcomes.find((o) => o.kind === 'asset')
    const firstNote = outcomes.find((o) => o.kind === 'note')
    if (firstDoc?.kind === 'richdoc') openDoc(firstDoc.docId)
    else if (firstSheet?.kind === 'sheet') openSheet(firstSheet.sheetId)
    else if (firstCode?.kind === 'code') openCode(firstCode.codeId)
    else if (firstAsset?.kind === 'asset') openAsset(firstAsset.asset.id)
    else if (firstNote?.kind === 'note') openNote(firstNote.noteId)
  }

  const onImportVaultFile = async (file: File | null) => {
    if (!file) return
    try {
      const data = JSON.parse(await file.text()) as VaultExport
      if (
        !confirm(
          'Importing a project replaces all current boards, notes and assets. Continue?',
        )
      )
        return
      await importVault(data)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not read that file.')
    }
  }

  const onExportVault = async () => {
    setExporting(true)
    try {
      const vault = await exportVaultFull()
      downloadText('vault.lattice.json', JSON.stringify(vault), 'application/json')
    } finally {
      setExporting(false)
    }
  }

  return (
    <aside className="flex w-60 flex-none flex-col border-r border-bord bg-panel">
      {/* logo */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <span className="h-6 w-6 flex-none rounded-md bg-gradient-to-br from-[#0d99ff] to-[#9747ff]" />
        <span className="text-[15px] font-bold tracking-tight">Lattice</span>
        <span className="mt-0.5 rounded bg-panel2 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-muted uppercase">
          beta
        </span>
      </div>

      {/* project switcher */}
      <ProjectSwitcher />

      {/* search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted">
            <IcSearch size={13} />
          </span>
          <input
            className="field pl-8"
            placeholder="Search this project…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* file type filters */}
      <div className="flex flex-wrap gap-1 px-3 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setSidebarFilter(f.key)}
            className={`cursor-pointer rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${
              sidebarFilter === f.key
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-bord text-muted hover:text-ink'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {/* recents */}
        {recentRows.length > 0 && (
          <>
            <div className="insp-h flex items-center gap-1.5">
              <IcClock size={10} /> Recent
            </div>
            {recentRows.map((r) => (
              <div
                key={`${r.kind}:${r.id}`}
                className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-muted hover:bg-panel2/60"
                onClick={() => openRecent(r)}
              >
                <FileKindIcon kind={RECENT_KIND[r.kind]} size={13} />
                <span className="min-w-0 flex-1 truncate text-xs">{r.label}</span>
              </div>
            ))}
          </>
        )}

        {/* boards */}
        <div className="insp-h flex items-center justify-between">
          <span>Boards</span>
          <button className="icon-btn h-5 w-5" onClick={addBoard} title="New board">
            <IcPlus size={12} />
          </button>
        </div>
        {projectBoards.map((id) => {
          const b = boards[id]
          if (!b) return null
          const active = id === activeBoardId
          return (
            <div
              key={id}
              className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${
                active ? 'bg-panel2 text-ink' : 'text-muted hover:bg-panel2/60'
              }`}
              onClick={() => setActiveBoard(id)}
            >
              <IcBoard size={13} />
              <span className="min-w-0 flex-1 truncate text-xs font-medium">
                {b.name}
              </span>
              <span className="text-[10px] text-muted">{b.nodes.length}</span>
              {projectBoards.length > 1 && (
                <button
                  className="icon-btn hidden h-5 w-5 group-hover:flex"
                  title="Delete board"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Delete board "${b.name}"? Notes are kept.`))
                      deleteBoard(id)
                  }}
                >
                  <IcTrash size={11} />
                </button>
              )}
            </div>
          )
        })}

        {/* documents */}
        {show('docs') && (
          <>
            <div className="insp-h flex items-center justify-between">
              <span>Documents</span>
              <button
                className="icon-btn h-5 w-5"
                title="New document"
                onClick={() => openDoc(createDoc())}
              >
                <IcPlus size={12} />
              </button>
            </div>
            {docList.length === 0 && (
              <div className="px-2 py-1 text-[11px] text-muted italic">
                No documents — create one or import a DOCX
              </div>
            )}
            {docList.map((d) => (
              <div
                key={d.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DOC_DRAG_MIME, d.id)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => openDoc(d.id)}
                title="Click to edit · drag onto the canvas or into a document"
                className={`group flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 active:cursor-grabbing ${
                  d.id === activeDocId ? 'bg-panel2 text-ink' : 'text-muted hover:bg-panel2/60'
                }`}
              >
                <FileKindIcon kind="richdoc" size={13} />
                <span className="min-w-0 flex-1 truncate text-xs">{d.title}</span>
                <span className="text-[10px] text-muted">{d.wordCount}w</span>
                <button
                  className="icon-btn hidden h-5 w-5 group-hover:flex"
                  title="Delete document"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (
                      confirm(`Delete document "${d.title}" and its cards on all boards?`)
                    )
                      deleteDoc(d.id)
                  }}
                >
                  <IcTrash size={11} />
                </button>
              </div>
            ))}
          </>
        )}

        {/* spreadsheets */}
        {show('sheets') && (
          <>
            <div className="insp-h flex items-center justify-between">
              <span>Spreadsheets</span>
              <button
                className="icon-btn h-5 w-5"
                title="New spreadsheet"
                onClick={() => openSheet(createSheetDoc())}
              >
                <IcPlus size={12} />
              </button>
            </div>
            {sheetList.length === 0 && (
              <div className="px-2 py-1 text-[11px] text-muted italic">
                No spreadsheets — create one or import CSV/XLSX/ODS
              </div>
            )}
            {sheetList.map((sh) => (
              <div
                key={sh.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(SHEET_DRAG_MIME, sh.id)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => openSheet(sh.id)}
                title="Click to edit · drag onto the canvas"
                className={`group flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 active:cursor-grabbing ${
                  sh.id === activeSheetId ? 'bg-panel2 text-ink' : 'text-muted hover:bg-panel2/60'
                }`}
              >
                <FileKindIcon kind="sheet" size={13} />
                <span className="min-w-0 flex-1 truncate text-xs">{sh.title}</span>
                <span className="text-[10px] text-muted">{sh.cellCount}c</span>
                <button
                  className="icon-btn hidden h-5 w-5 group-hover:flex"
                  title="Delete spreadsheet"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (
                      confirm(
                        `Delete spreadsheet "${sh.title}" and its cards on all boards?`,
                      )
                    )
                      deleteSheetDoc(sh.id)
                  }}
                >
                  <IcTrash size={11} />
                </button>
              </div>
            ))}
          </>
        )}

        {/* code files */}
        {show('code') && (
          <>
            <div className="insp-h flex items-center justify-between">
              <span>Code</span>
              <button
                className="icon-btn h-5 w-5"
                title="New code file"
                onClick={() => openCode(createCode())}
              >
                <IcPlus size={12} />
              </button>
            </div>
            {codeList.length === 0 && (
              <div className="px-2 py-1 text-[11px] text-muted italic">
                No code files — create one or import js/ts/py/…
              </div>
            )}
            {codeList.map((c) => (
              <div
                key={c.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(CODE_DRAG_MIME, c.id)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => openCode(c.id)}
                title={`${labelForLang(c.language)} · click to edit · drag onto the canvas`}
                className={`group flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 active:cursor-grabbing ${
                  c.id === activeCodeId ? 'bg-panel2 text-ink' : 'text-muted hover:bg-panel2/60'
                }`}
              >
                <FileKindIcon kind="code" size={13} />
                <span className="min-w-0 flex-1 truncate text-xs">
                  {c.title}.{c.extension}
                </span>
                <span className="text-[10px] text-muted">{c.lineCount}L</span>
                <button
                  className="icon-btn hidden h-5 w-5 group-hover:flex"
                  title="Delete code file"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (
                      confirm(
                        `Delete "${c.title}.${c.extension}" and its cards on all boards?`,
                      )
                    )
                      deleteCode(c.id)
                  }}
                >
                  <IcTrash size={11} />
                </button>
              </div>
            ))}
          </>
        )}

        {/* notes */}
        {show('notes') && (
          <>
            <div className="insp-h flex items-center justify-between">
              <span>Notes</span>
              <button
                className="icon-btn h-5 w-5"
                title="New note"
                onClick={() => openNote(createNote())}
              >
                <IcPlus size={12} />
              </button>
            </div>
            {noteList.length === 0 && (
              <div className="px-2 py-1 text-[11px] text-muted italic">No notes match</div>
            )}
            {noteList.map((n) => (
              <div
                key={n.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(NOTE_DRAG_MIME, n.id)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => openNote(n.id)}
                title="Click to edit · drag onto the canvas to place"
                className={`group flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 active:cursor-grabbing ${
                  n.id === activeNoteId ? 'bg-panel2 text-ink' : 'text-muted hover:bg-panel2/60'
                }`}
              >
                <FileKindIcon kind="note" size={13} />
                <span className="min-w-0 flex-1 truncate text-xs">{n.title}</span>
                <button
                  className="icon-btn hidden h-5 w-5 group-hover:flex"
                  title="Delete note"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Delete note "${n.title}" and its cards on all boards?`))
                      deleteNote(n.id)
                  }}
                >
                  <IcTrash size={11} />
                </button>
              </div>
            ))}
          </>
        )}

        {/* asset library */}
        {show('assets') && (
          <>
            <div className="insp-h flex items-center justify-between">
              <span>Assets</span>
              <button
                className="icon-btn h-5 w-5"
                title="Import files"
                onClick={() => filesInput.current?.click()}
              >
                <IcPlus size={12} />
              </button>
            </div>
            {assetList.length === 0 && (
              <div className="px-2 py-1 text-[11px] text-muted italic">
                No assets yet — import PDFs, Office files, media or 3D models
              </div>
            )}
            {assetList.map((a) => (
              <div
                key={a.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(ASSET_DRAG_MIME, a.id)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => openAsset(a.id)}
                title={`${a.originalName} · click to preview · drag onto the canvas`}
                className={`group flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 active:cursor-grabbing ${
                  a.id === activeAssetId
                    ? 'bg-panel2 text-ink'
                    : 'text-muted hover:bg-panel2/60'
                }`}
              >
                <FileKindIcon kind={fileKindForAsset(a.kind)} size={13} />
                <span className="min-w-0 flex-1 truncate text-xs">{a.name}</span>
                <span className="text-[10px] text-muted">{formatBytes(a.size)}</span>
                <button
                  className="icon-btn hidden h-5 w-5 group-hover:flex"
                  title="Delete asset from the vault"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (
                      confirm(`Delete asset "${a.name}" and its cards on all boards?`)
                    )
                      deleteAsset(a.id)
                  }}
                >
                  <IcTrash size={11} />
                </button>
              </div>
            ))}
            <button
              className="btn mt-1.5 w-full"
              onClick={() => filesInput.current?.click()}
              title="Import PDF, DOCX, XLSX, PPTX, images, video, audio, GLB/OBJ and more"
            >
              <IcUpload size={13} /> Import files…
            </button>
          </>
        )}
        <input
          ref={filesInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            void onImportFiles(e.target.files)
            e.target.value = ''
          }}
        />

        {/* tags */}
        {allTags.length > 0 && show('notes') && (
          <>
            <div className="insp-h">Tags</div>
            <div className="flex flex-wrap gap-1.5 px-1">
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => setTagFilter(tagFilter === t ? null : t)}
                  className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                    tagFilter === t
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-bord text-muted hover:text-ink'
                  }`}
                >
                  <IcTag size={10} />
                  {t}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* footer: project file export/import */}
      <div className="flex gap-2 border-t border-bord p-3">
        <button
          className="btn flex-1"
          disabled={exporting}
          title="Download the whole vault (all projects, boards, notes, assets) as one file"
          onClick={() => void onExportVault()}
        >
          <IcDownload size={13} /> {exporting ? 'Packing…' : 'Export'}
        </button>
        <button
          className="btn flex-1"
          title="Open a .lattice.json project file"
          onClick={() => vaultInput.current?.click()}
        >
          <IcUpload size={13} /> Import
        </button>
        <input
          ref={vaultInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            void onImportVaultFile(e.target.files?.[0] ?? null)
            e.target.value = ''
          }}
        />
      </div>
    </aside>
  )
}
