import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { useStore } from '@/store/useStore'
import { useOpenId } from '@/lib/tabs/openEntity'
import { useUiStore } from '@/store/useUiStore'
import { CodeInspector } from '@/components/code/CodeInspector'
import { FileKindIcon, type FileKind } from '@/lib/registry/fileKinds'
import { formatBytes } from '@/lib/media'
import { IcGithub, IcPlus, IcPresentation } from '@/components/Icons'
import { capabilityAt } from '@/lib/layout/tiers'
import { useViewportTier } from '@/lib/layout/useViewportTier'
import { DesktopOnly } from '@/components/shell/DesktopOnly'
import { storage } from '@/lib/storage/StorageProvider'
import { yjsManager } from '@/lib/crdt/YjsManager'
import { reconciledCode } from '@/lib/crdt/CodeCRDT'
import { labelForLang } from '@/lib/code/languages'

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

/**
 * The first lines of a code file, read-only (12.5).
 *
 * Cheap in the literal sense: this is the same text `CodeInspector`'s download
 * already reads — the reconciled CRDT state when a room holds one, storage
 * otherwise — so showing it costs a read, not a Monaco. The grid and the slide
 * stage have no equivalent, which is why only Code gets a preview and the
 * other two say what they hold instead of pretending to show it.
 */
function CodePreview({ id, projectId }: { id: string; projectId?: string }) {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const pid = projectId ?? useStore.getState().activeProjectId
    const merged = reconciledCode(yjsManager.room(pid), id)
    if (merged != null) {
      setText(merged)
      return
    }
    void storage.getDocument(id).then((content) => {
      if (alive) setText(typeof content === 'string' ? content : '')
    })
    return () => {
      alive = false
    }
  }, [id, projectId])

  if (!text) return null
  const lines = text.split('\n')
  const head = lines.slice(0, 40)
  return (
    <div className="w-full max-w-md text-left">
      <div className="mb-1 text-[10px] font-semibold tracking-widest text-muted uppercase">
        First {head.length} line{head.length === 1 ? '' : 's'}
      </div>
      <pre className="max-h-72 overflow-auto rounded-lg border border-bord bg-panel2 p-3 text-[11px] leading-relaxed">
        <code>{head.join('\n')}</code>
      </pre>
      {lines.length > head.length && (
        <p className="mt-1 text-[10.5px] text-muted">
          …and {lines.length - head.length} more lines.
        </p>
      )}
    </div>
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

/**
 * Does this section step aside at this tier? The rule lives in the tier model
 * (`capabilityAt`), so the four sections that step aside — and the two that do
 * not — are decided in one place rather than by four copies of a breakpoint.
 */
function desktopOnly(mode: Parameters<typeof capabilityAt>[0], tier: ReturnType<typeof useViewportTier>) {
  return capabilityAt(mode, tier) === 'desktop-only'
}

export function SheetModeWorkspace() {
  const tier = useViewportTier()
  const activeSheetId = useOpenId('sheet')
  const sheetDocs = useStore((s) => s.sheetDocs)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const openSheet = useStore((s) => s.openSheet)
  const createSheetDoc = useStore((s) => s.createSheetDoc)

  const meta = activeSheetId ? sheetDocs[activeSheetId] : undefined
  if (meta) {
    if (desktopOnly('sheet', tier)) {
      return (
        <DesktopOnly
          kind="sheet"
          title={meta.title}
          stats={`${meta.cellCount} cells`}
          reason="A spreadsheet is a grid you scroll in two directions at once, with a formula bar, a selection and a cell inspector. None of that survives a 390px column, so it is not offered here rather than offered broken."
        />
      )
    }
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
  const tier = useViewportTier()
  const activeCodeId = useOpenId('code')
  const codeDocs = useStore((s) => s.codeDocs)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const openCode = useStore((s) => s.openCode)
  const createCode = useStore((s) => s.createCode)
  const setGithubDialogOpen = useUiStore((s) => s.setGithubDialogOpen)

  const meta = activeCodeId ? codeDocs[activeCodeId] : undefined
  if (meta) {
    if (desktopOnly('code', tier)) {
      return (
        <DesktopOnly
          kind="code"
          title={`${meta.title}.${meta.extension}`}
          stats={`${meta.lineCount} lines · ${labelForLang(meta.language)}`}
          reason="Monaco brings its own scrolling, minimap, multi-cursor and keybindings, and a phone keyboard has none of the keys they are built around. The file is here to read; editing it wants a desktop."
          preview={<CodePreview id={meta.id} projectId={meta.projectId} />}
        />
      )
    }
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
  const tier = useViewportTier()
  if (desktopOnly('photo', tier)) {
    return (
      <DesktopOnly
        kind="image"
        title="Photo studio"
        reason="The studio planner is three docked panels around a stage — library, timeline and inspector. It is a planning surface, and planning a shot on a 390px column is not a smaller version of the job."
      />
    )
  }
  return (
    <Suspense fallback={<Loading label="Loading photo workspaceâ€¦" />}>
      <PhotoWorkspace />
    </Suspense>
  )
}

export function PresentationModeWorkspace() {
  const tier = useViewportTier()
  const activePresentId = useOpenId('present')
  const presentDocs = useStore((s) => s.presentDocs)
  const assets = useStore((s) => s.assets)
  const activeProjectId = useStore((s) => s.activeProjectId)
  const openPresent = useStore((s) => s.openPresent)
  const openAsset = useStore((s) => s.openAsset)
  const createPresentDoc = useStore((s) => s.createPresentDoc)

  const meta = activePresentId ? presentDocs[activePresentId] : undefined
  if (meta) {
    if (desktopOnly('presentation', tier)) {
      return (
        <DesktopOnly
          kind="presentation"
          title={meta.title}
          stats={`${meta.slideCount} slide${meta.slideCount === 1 ? '' : 's'}`}
          reason="Slides are laid out on a fixed 960×540 stage with a navigator beside it. Shown at a third of its size the stage is not an editor, and scaled to fit the column it is a picture of one."
        />
      )
    }
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
