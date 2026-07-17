import { lazy, Suspense, type ReactNode } from 'react'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { CodeInspector } from '@/components/code/CodeInspector'
import { FileKindIcon, type FileKind } from '@/lib/registry/fileKinds'
import { formatBytes } from '@/lib/media'
import { IcGithub, IcPlus, IcPresentation } from '@/components/Icons'

const CodeWorkspacePane = lazy(() => import('@/components/code/CodeWorkspacePane'))
const SpreadsheetWorkspace = lazy(() => import('@/components/sheet/SpreadsheetWorkspace'))
const PresentationWorkspace = lazy(
  () => import('@/components/present/PresentationWorkspace'),
)
const PhotoWorkspace = lazy(() => import('@/components/photo/PhotoWorkspace'))

/**
 * Full-page workspaces behind the Phase 6 top navigation: Sheet,
 * Presentation and Code get dedicated modes with proper empty states.
 * (Board/Split/Document reuse the existing panes in App.tsx.)
 */

function Loading({ label }: { label: string }) {
  return (
    <section className="flex h-full min-w-0 flex-1 items-center justify-center border-r border-bord bg-panel text-xs text-muted">
      {label}
    </section>
  )
}

function EmptyMode({
  kind,
  headline,
  hint,
  action,
  children,
}: {
  kind: FileKind
  headline: string
  hint: string
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-panel px-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-bord bg-panel2 text-muted">
        <FileKindIcon kind={kind} size={26} />
      </span>
      <p className="text-[14px] font-semibold">{headline}</p>
      <p className="max-w-sm text-[12px] leading-relaxed text-muted">{hint}</p>
      {action}
      {children}
    </section>
  )
}

/** Recently updated entities of one type, for empty-state jump lists. */
function JumpList<T extends { id: string }>({
  items,
  kind,
  label,
  onOpen,
  detail,
}: {
  items: T[]
  kind: FileKind
  label: (item: T) => string
  onOpen: (id: string) => void
  detail?: (item: T) => string
}) {
  if (!items.length) return null
  return (
    <div className="mt-2 w-full max-w-sm">
      <div className="mb-1 text-[10px] font-semibold tracking-widest text-muted uppercase">
        In this project
      </div>
      <div className="overflow-hidden rounded-lg border border-bord text-left">
        {items.slice(0, 6).map((item) => (
          <button
            key={item.id}
            className="flex w-full cursor-pointer items-center gap-2 border-b border-bord px-3 py-2 text-[12px] last:border-b-0 hover:bg-panel2"
            onClick={() => onOpen(item.id)}
          >
            <FileKindIcon kind={kind} size={13} />
            <span className="min-w-0 flex-1 truncate">{label(item)}</span>
            {detail && <span className="text-[10px] text-muted">{detail(item)}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SheetModeWorkspace() {
  const activeSheetId = useStore((s) => s.activeSheetId)
  const sheetDocs = useStore((s) => s.sheetDocs)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const openSheet = useStore((s) => s.openSheet)
  const createSheetDoc = useStore((s) => s.createSheetDoc)

  const meta = activeSheetId ? sheetDocs[activeSheetId] : undefined
  if (meta) {
    return (
      <Suspense fallback={<Loading label="Loading spreadsheet workspace…" />}>
        <SpreadsheetWorkspace meta={meta} />
      </Suspense>
    )
  }
  const list = Object.values(sheetDocs)
    .filter((sh) => sh.projectId === activeProjectId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
  return (
    <EmptyMode
      kind="sheet"
      headline="No spreadsheet open"
      hint="Create a workbook or import CSV/XLSX/ODS — formulas, formatting and multi-sheet workbooks included."
      action={
        <button className="btn" onClick={() => openSheet(createSheetDoc())}>
          <IcPlus size={13} /> New spreadsheet
        </button>
      }
    >
      <JumpList
        items={list}
        kind="sheet"
        label={(sh) => sh.title}
        detail={(sh) => `${sh.cellCount} cells`}
        onOpen={openSheet}
      />
    </EmptyMode>
  )
}

export function CodeModeWorkspace() {
  const activeCodeId = useStore((s) => s.activeCodeId)
  const codeDocs = useStore((s) => s.codeDocs)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const openCode = useStore((s) => s.openCode)
  const createCode = useStore((s) => s.createCode)
  const setGithubDialogOpen = useUiStore((s) => s.setGithubDialogOpen)

  const meta = activeCodeId ? codeDocs[activeCodeId] : undefined
  if (meta) {
    return (
      <>
        <Suspense fallback={<Loading label="Loading code workspace…" />}>
          <CodeWorkspacePane />
        </Suspense>
        <CodeInspector />
      </>
    )
  }
  const list = Object.values(codeDocs)
    .filter((c) => c.projectId === activeProjectId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
  return (
    <EmptyMode
      kind="code"
      headline="No code file open"
      hint="A VS Code-style Monaco workspace. Create a file, import source files, or pull code from a linked GitHub repository."
      action={
        <div className="flex gap-2">
          <button className="btn" onClick={() => openCode(createCode())}>
            <IcPlus size={13} /> New code file
          </button>
          <button className="btn" onClick={() => setGithubDialogOpen(true)}>
            <IcGithub size={13} /> GitHub sync
          </button>
        </div>
      }
    >
      <JumpList
        items={list}
        kind="code"
        label={(c) => `${c.title}.${c.extension}`}
        detail={(c) => `${c.lineCount}L`}
        onOpen={openCode}
      />
    </EmptyMode>
  )
}

/**
 * Photo mode: the project's studio/set scene always exists (it is seeded
 * on first open), so unlike the other modes there is no empty state.
 */
export function PhotoModeWorkspace() {
  return (
    <Suspense fallback={<Loading label="Loading photo workspaceâ€¦" />}>
      <PhotoWorkspace />
    </Suspense>
  )
}

export function PresentationModeWorkspace() {
  const activePresentId = useStore((s) => s.activePresentId)
  const presentDocs = useStore((s) => s.presentDocs)
  const assets = useStore((s) => s.assets)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const openPresent = useStore((s) => s.openPresent)
  const openAsset = useStore((s) => s.openAsset)
  const createPresentDoc = useStore((s) => s.createPresentDoc)

  const meta = activePresentId ? presentDocs[activePresentId] : undefined
  if (meta) {
    return (
      <Suspense fallback={<Loading label="Loading presentation workspace…" />}>
        <PresentationWorkspace meta={meta} />
      </Suspense>
    )
  }

  const decks = Object.values(presentDocs)
    .filter((p) => p.projectId === activeProjectId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const rawDecks = Object.values(assets)
    .filter((a) => a.kind === 'presentation' && a.projectId === activeProjectId)
    .sort((a, b) => b.importedAt - a.importedAt)

  return (
    <EmptyMode
      kind="presentation"
      headline="No presentation open"
      hint="Slides on a 960×540 canvas: text boxes, images, shapes, themes, speaker notes, PDF and PPTX export. Import a PPTX/ODP to convert it into an editable deck — the original file is always preserved."
      action={
        <button className="btn" onClick={() => openPresent(createPresentDoc())}>
          <IcPlus size={13} /> New presentation
        </button>
      }
    >
      <JumpList
        items={decks}
        kind="presentation"
        label={(p) => p.title}
        detail={(p) => `${p.slideCount} slide${p.slideCount === 1 ? '' : 's'}`}
        onOpen={openPresent}
      />
      {rawDecks.length > 0 && (
        <>
          <p className="mt-2 flex items-center gap-2 text-[11px] text-muted">
            <IcPresentation size={13} /> Preserved originals (preview as assets)
          </p>
          <JumpList
            items={rawDecks}
            kind="presentation"
            label={(a) => a.name}
            detail={(a) => formatBytes(a.size)}
            onOpen={openAsset}
          />
        </>
      )}
    </EmptyMode>
  )
}
