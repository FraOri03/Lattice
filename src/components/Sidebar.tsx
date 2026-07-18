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
  PRESENT_DRAG_MIME,
  SHEET_DRAG_MIME,
} from '@/lib/dnd'
import { importFiles, reportErrors } from '@/lib/import/ImportService'
import { labelForLang } from '@/lib/code/languages'
import { FileKindIcon, fileKindForAsset, type FileKind } from '@/lib/registry/fileKinds'
import { ProjectSwitcher } from '@/components/projects/ProjectSwitcher'
import { useCan } from '@/lib/collab/useCollab'
import { toast } from '@/components/ui/Toaster'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { assetRefsOf, describeAssetRefs } from '@/lib/assets/assetRefs'
import { SidebarCategory } from '@/components/sidebar/SidebarCategory'
import { BOARD_DRAG_MIME } from '@/lib/dnd'
import {
  IcBoard,
  IcClock,
  IcSearch,
  IcTag,
  IcTrash,
} from '@/components/Icons'
import { ActionIcon } from '@/components/ActionIcons'

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
  present: 'presentation',
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
  const presentDocs = useStore((s) => s.presentDocs)
  const activeNoteId = useStore((s) => s.activeNoteId)
  const activeAssetId = useStore((s) => s.activeAssetId)
  const activeDocId = useStore((s) => s.activeDocId)
  const activeCodeId = useStore((s) => s.activeCodeId)
  const activeSheetId = useStore((s) => s.activeSheetId)
  const activePresentId = useStore((s) => s.activePresentId)
  const recents = useStore((s) => s.recents)
  const openNote = useStore((s) => s.openNote)
  const openAsset = useStore((s) => s.openAsset)
  const openDoc = useStore((s) => s.openDoc)
  const openCode = useStore((s) => s.openCode)
  const openSheet = useStore((s) => s.openSheet)
  const openPresent = useStore((s) => s.openPresent)
  const createNote = useStore((s) => s.createNote)
  const createDoc = useStore((s) => s.createDoc)
  const createCode = useStore((s) => s.createCode)
  const createSheetDoc = useStore((s) => s.createSheetDoc)
  const createPresentDoc = useStore((s) => s.createPresentDoc)
  const deleteNote = useStore((s) => s.deleteNote)
  const deleteAsset = useStore((s) => s.deleteAsset)
  const deleteDoc = useStore((s) => s.deleteDoc)
  const deleteCode = useStore((s) => s.deleteCode)
  const deleteSheetDoc = useStore((s) => s.deleteSheetDoc)
  const deletePresentDoc = useStore((s) => s.deletePresentDoc)
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
  const mayCreate = useCan('content.create')
  const mayDelete = useCan('content.delete')

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

  const presentList = useMemo(
    () =>
      Object.values(presentDocs)
        .filter(
          (p) =>
            p.projectId === activeProjectId &&
            (!q ||
              p.title.toLowerCase().includes(q) ||
              p.snippet.toLowerCase().includes(q)),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [presentDocs, q, activeProjectId],
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
          : r.kind === 'present' ? presentDocs[r.id]?.title
          : r.kind === 'code' ? codeDocs[r.id] && `${codeDocs[r.id].title}.${codeDocs[r.id].extension}`
          : r.kind === 'asset' ? assets[r.id]?.name
          : boards[r.id]?.name
        return label ? { ...r, label } : null
      })
      .filter((r): r is RecentEntry & { label: string } => !!r)
      .slice(0, 5)
  }, [recents, notes, docs, sheetDocs, presentDocs, codeDocs, assets, boards, q, sidebarFilter])

  const openRecent = (r: RecentEntry) => {
    if (r.kind === 'note') openNote(r.id)
    else if (r.kind === 'doc') openDoc(r.id)
    else if (r.kind === 'sheet') openSheet(r.id)
    else if (r.kind === 'present') openPresent(r.id)
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
      const ok = await confirmDialog({
        title: 'Replace the whole vault?',
        body: 'Importing a project file replaces ALL current boards, notes, documents and assets in this browser.',
        confirmLabel: 'Replace everything',
        danger: true,
      })
      if (!ok) return
      await importVault(data)
      toast.success('Vault imported')
    } catch (err) {
      toast.error(
        'Import failed',
        err instanceof Error ? err.message : 'Could not read that file.',
      )
    }
  }

  const onExportVault = async () => {
    setExporting(true)
    try {
      const vault = await exportVaultFull()
      downloadText('vault.lattice.json', JSON.stringify(vault), 'application/json')
      const { activityLog } = await import('@/lib/collab/ActivityLogService')
      activityLog.log(activeProjectId, 'export', 'Exported the vault as a project file')
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
        <SidebarCategory
          category="boards"
          label="Boards"
          items={projectBoards.map((id) => boards[id]).filter(Boolean)}
          onCreate={mayCreate ? addBoard : undefined}
          createLabel="New board"
          mayEditFolders={mayCreate}
          renderItem={(b) => {
            const active = b.id === activeBoardId
            return (
              <div
                key={b.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(BOARD_DRAG_MIME, b.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                className={`group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${
                  active ? 'bg-panel2 text-ink' : 'text-muted hover:bg-panel2/60'
                }`}
                onClick={() => setActiveBoard(b.id)}
              >
                <IcBoard size={13} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {b.name}
                </span>
                <span className="text-[10px] text-muted">{b.nodes.length}</span>
                {projectBoards.length > 1 && mayDelete && (
                  <button
                    className="icon-btn hidden h-5 w-5 group-hover:flex"
                    title="Delete board"
                    aria-label={`Delete board ${b.name}`}
                    onClick={async (e) => {
                      e.stopPropagation()
                      if (
                        await confirmDialog({
                          title: `Delete board “${b.name}”?`,
                          body: 'Cards on this board are removed; notes, documents and assets are kept.',
                          confirmLabel: 'Delete board',
                          danger: true,
                        })
                      )
                        deleteBoard(b.id)
                    }}
                  >
                    <IcTrash size={11} />
                  </button>
                )}
              </div>
            )
          }}
        />

        {/* documents */}
        {show('docs') && (
          <>
            <SidebarCategory
              category="docs"
              label="Documents"
              items={docList}
              emptyHint="No documents — create one or import a DOCX"
              onCreate={mayCreate ? () => openDoc(createDoc()) : undefined}
              createLabel="New document"
              mayEditFolders={mayCreate}
              renderItem={(d) => (
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
                {mayDelete && (
                  <button
                    className="icon-btn hidden h-5 w-5 group-hover:flex"
                    title="Delete document"
                    aria-label={`Delete document ${d.title}`}
                    onClick={async (e) => {
                      e.stopPropagation()
                      if (
                        await confirmDialog({
                          title: `Delete “${d.title}”?`,
                          body: 'The document and its cards on all boards are removed.',
                          confirmLabel: 'Delete document',
                          danger: true,
                        })
                      )
                        deleteDoc(d.id)
                    }}
                  >
                    <IcTrash size={11} />
                  </button>
                )}
              </div>
            )}
            />
          </>
        )}

        {/* spreadsheets */}
        {show('sheets') && (
          <SidebarCategory
            category="sheets"
            label="Spreadsheets"
            items={sheetList}
            emptyHint="No spreadsheets — create one or import CSV/XLSX/ODS"
            onCreate={mayCreate ? () => openSheet(createSheetDoc()) : undefined}
            createLabel="New spreadsheet"
            mayEditFolders={mayCreate}
            renderItem={(sh) => (
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
                {mayDelete && (
                  <button
                    className="icon-btn hidden h-5 w-5 group-hover:flex"
                    title="Delete spreadsheet"
                    aria-label={`Delete spreadsheet ${sh.title}`}
                    onClick={async (e) => {
                      e.stopPropagation()
                      if (
                        await confirmDialog({
                          title: `Delete “${sh.title}”?`,
                          body: 'The spreadsheet and its cards on all boards are removed.',
                          confirmLabel: 'Delete spreadsheet',
                          danger: true,
                        })
                      )
                        deleteSheetDoc(sh.id)
                    }}
                  >
                    <IcTrash size={11} />
                  </button>
                )}
              </div>
            )}
          />
        )}

        {/* presentations (Phase 8) */}
        {show('all') && (
          <SidebarCategory
            category="presentations"
            label="Presentations"
            items={presentList}
            emptyHint="No presentations — create one or import PPTX/ODP"
            onCreate={mayCreate ? () => openPresent(createPresentDoc()) : undefined}
            createLabel="New presentation"
            mayEditFolders={mayCreate}
            renderItem={(p) => (
              <div
                key={p.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(PRESENT_DRAG_MIME, p.id)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => openPresent(p.id)}
                title="Click to edit slides · drag onto the canvas"
                className={`group flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 active:cursor-grabbing ${
                  p.id === activePresentId ? 'bg-panel2 text-ink' : 'text-muted hover:bg-panel2/60'
                }`}
              >
                <FileKindIcon kind="presentation" size={13} />
                <span className="min-w-0 flex-1 truncate text-xs">{p.title}</span>
                <span className="text-[10px] text-muted">{p.slideCount}s</span>
                {mayDelete && (
                  <button
                    className="icon-btn hidden h-5 w-5 group-hover:flex"
                    title="Delete presentation"
                    aria-label={`Delete presentation ${p.title}`}
                    onClick={async (e) => {
                      e.stopPropagation()
                      if (
                        await confirmDialog({
                          title: `Delete “${p.title}”?`,
                          body: 'The presentation is removed. A preserved source file (if any) stays in Files.',
                          confirmLabel: 'Delete presentation',
                          danger: true,
                        })
                      )
                        deletePresentDoc(p.id)
                    }}
                  >
                    <IcTrash size={11} />
                  </button>
                )}
              </div>
            )}
          />
        )}

        {/* code files */}
        {show('code') && (
          <SidebarCategory
            category="code"
            label="Code"
            items={codeList}
            emptyHint="No code files — create one or import js/ts/py/…"
            onCreate={mayCreate ? () => openCode(createCode()) : undefined}
            createLabel="New code file"
            mayEditFolders={mayCreate}
            renderItem={(c) => (
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
                {mayDelete && (
                  <button
                    className="icon-btn hidden h-5 w-5 group-hover:flex"
                    title="Delete code file"
                    aria-label={`Delete code file ${c.title}.${c.extension}`}
                    onClick={async (e) => {
                      e.stopPropagation()
                      if (
                        await confirmDialog({
                          title: `Delete “${c.title}.${c.extension}”?`,
                          body: 'The file and its cards on all boards are removed.',
                          confirmLabel: 'Delete file',
                          danger: true,
                        })
                      )
                        deleteCode(c.id)
                    }}
                  >
                    <IcTrash size={11} />
                  </button>
                )}
              </div>
            )}
          />
        )}

        {/* notes */}
        {show('notes') && (
          <SidebarCategory
            category="notes"
            label="Notes"
            items={noteList}
            emptyHint="No notes match"
            onCreate={mayCreate ? () => openNote(createNote()) : undefined}
            createLabel="New note"
            mayEditFolders={mayCreate}
            renderItem={(n) => (
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
                {mayDelete && (
                  <button
                    className="icon-btn hidden h-5 w-5 group-hover:flex"
                    title="Delete note"
                    aria-label={`Delete note ${n.title}`}
                    onClick={async (e) => {
                      e.stopPropagation()
                      if (
                        await confirmDialog({
                          title: `Delete note “${n.title}”?`,
                          body: 'The note and its cards on all boards are removed.',
                          confirmLabel: 'Delete note',
                          danger: true,
                        })
                      )
                        deleteNote(n.id)
                    }}
                  >
                    <IcTrash size={11} />
                  </button>
                )}
              </div>
            )}
          />
        )}

        {/* asset library */}
        {show('assets') && (
          <SidebarCategory
            category="assets"
            label="Assets"
            items={assetList}
            emptyHint="No assets yet — import PDFs, Office files, media or 3D models"
            onCreate={mayCreate ? () => filesInput.current?.click() : undefined}
            createLabel="Import files"
            mayEditFolders={mayCreate}
            renderItem={(a) => (
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
                {mayDelete && (
                  <button
                    className="icon-btn hidden h-5 w-5 group-hover:flex"
                    title="Delete asset from the vault"
                    aria-label={`Delete asset ${a.name}`}
                    onClick={async (e) => {
                      e.stopPropagation()
                      // One file can back many cards and documents, so say
                      // exactly what would break before removing the binary.
                      const used = describeAssetRefs(
                        assetRefsOf(a.id, useStore.getState()),
                      )
                      if (
                        await confirmDialog({
                          title: `Delete asset “${a.name}”?`,
                          body: used
                            ? `This file is still used by ${used}. Deleting it removes the file and everything showing it.`
                            : 'Nothing references this file — it will be removed from the vault.',
                          confirmLabel: 'Delete asset',
                          danger: true,
                        })
                      )
                        deleteAsset(a.id)
                    }}
                  >
                    <IcTrash size={11} />
                  </button>
                )}
              </div>
            )}
          />
        )}
        {show('assets') && mayCreate && (
          <button
            className="btn mt-1.5 w-full"
            onClick={() => filesInput.current?.click()}
            title="Import PDF, DOCX, XLSX, PPTX, images, video, audio, GLB/OBJ and more"
          >
            <ActionIcon.Import size={13} /> Import files…
          </button>
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
          title="Export — download the whole vault (all projects, boards, notes, assets) as one file"
          aria-label="Export vault to file"
          onClick={() => void onExportVault()}
        >
          <ActionIcon.Export size={13} /> {exporting ? 'Packing…' : 'Export'}
        </button>
        <button
          className="btn flex-1"
          title="Import — open a .lattice.json project file"
          aria-label="Import vault from file"
          onClick={() => vaultInput.current?.click()}
        >
          <ActionIcon.Import size={13} /> Import
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
