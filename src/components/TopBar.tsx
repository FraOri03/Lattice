import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { useSyncStore } from '@/lib/sync/syncStore'
import { syncEngine } from '@/lib/sync/SyncEngine'
import { useCollabStore } from '@/lib/collab/collabStore'
import { useCan, useReadOnly } from '@/lib/collab/useCollab'
import type { ViewMode } from '@/types/model'
import { MODE_METAS } from '@/components/topbarModes'
import { ProfileMenu } from '@/components/account/ProfileMenu'
import { PresenceAvatars } from '@/components/collab/PresenceAvatars'
import { RealtimeStatusChip } from '@/components/collab/RealtimeStatusChip'
import { NotificationCenter } from '@/components/collab/NotificationCenter'
import { useCollabMode } from '@/lib/collab/collabPresentation'
import {
  IcAlert,
  IcBoard,
  IcChevronRight,
  IcCloud,
  IcCloudOff,
  IcCode,
  IcCommand,
  IcDoc,
  IcGraph,
  IcHistory,
  IcMessage,
  IcMoon,
  IcNote,
  IcPlus,
  IcPresentation,
  IcRefresh,
  IcSplit,
  IcSun,
  IcTable,
  IcUserPlus,
  IcWifiOff,
  IcChevronDown,
} from '@/components/Icons'

const MODE_ICONS: Record<ViewMode, React.ReactNode> = {
  board: <IcBoard size={13} />,
  graph: <IcGraph size={13} />,
  split: <IcSplit size={13} />,
  doc: <IcDoc size={13} />,
  sheet: <IcTable size={13} />,
  presentation: <IcPresentation size={13} />,
  code: <IcCode size={13} />,
}

// order (Board · Graph · Split · Document · Sheet · Presentation · Code)
// comes from the shared MODE_METAS so it stays testable without a DOM
const MODES = MODE_METAS.map((m) => ({ ...m, icon: MODE_ICONS[m.mode] }))

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

/** Cloud sync status dot for the top bar. */
function SyncIndicator() {
  const sync = useSyncStore()
  const online = useOnline()
  const setDriveDialogOpen = useUiStore((s) => s.setDriveDialogOpen)

  if (!online) {
    return (
      <span
        className="flex items-center gap-1.5 rounded-full border border-bord bg-panel2 px-2 py-1 text-[10px] font-medium text-[#ffa629]"
        title="You are offline — changes stay local and sync when you reconnect"
      >
        <IcWifiOff size={12} /> Offline
      </span>
    )
  }
  if (sync.provider !== 'google-drive') {
    // Drive not (yet) verified: show connecting / a clickable error / local
    if (sync.status === 'connecting') {
      return (
        <span className="flex items-center gap-1.5 rounded-full border border-bord bg-panel2 px-2 py-1 text-[10px] font-medium text-muted">
          <IcRefresh size={12} className="animate-spin" /> Connecting…
        </span>
      )
    }
    if (sync.status === 'error') {
      return (
        <button
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[#f24822]/40 bg-panel2 px-2 py-1 text-[10px] font-medium text-[#f24822]"
          title={`${sync.error ?? 'Google Drive is not connected'} — click for diagnostics`}
          aria-label={`Drive sync error: ${sync.error ?? 'Google Drive is not connected'}. Click for diagnostics.`}
          onClick={() => setDriveDialogOpen(true)}
        >
          <IcAlert size={12} /> Drive error
        </button>
      )
    }
    return (
      <button
        className="flex cursor-pointer items-center gap-1.5 rounded-full border border-bord bg-panel2 px-2 py-1 text-[10px] font-medium text-muted"
        title="Cloud sync is off — click to connect Google Drive"
        onClick={() => setDriveDialogOpen(true)}
      >
        <IcCloudOff size={12} /> Local
      </button>
    )
  }
  const color =
    sync.status === 'synced'
      ? 'text-[#14ae5c]'
      : sync.status === 'error'
        ? 'text-[#f24822]'
        : 'text-muted'
  const label =
    sync.status === 'syncing'
      ? 'Syncing…'
      : sync.status === 'synced'
        ? 'Synced'
        : sync.status === 'error'
          ? 'Sync error'
          : sync.pendingChanges > 0
            ? `${sync.pendingChanges} pending`
            : 'Drive'
  return (
    <button
      className={`flex cursor-pointer items-center gap-1.5 rounded-full border border-bord bg-panel2 px-2 py-1 text-[10px] font-medium ${color}`}
      title={sync.error ?? 'Google Drive sync — click to sync now'}
      aria-label={`Google Drive: ${label}${sync.status === 'error' ? ' — click for diagnostics' : ' — click to sync now'}`}
      onClick={() =>
        sync.status === 'error' ? setDriveDialogOpen(true) : void syncEngine.syncNow()
      }
    >
      {sync.status === 'syncing' ? (
        <IcRefresh size={12} className="animate-spin" />
      ) : sync.status === 'error' ? (
        <IcAlert size={12} />
      ) : (
        <IcCloud size={12} />
      )}
      {label}
    </button>
  )
}

/** "+ New" dropdown: quick create for every document kind. */
function QuickCreate() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const s = useStore

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const entries: { label: string; icon: React.ReactNode; run: () => void }[] = [
    { label: 'Note', icon: <IcNote size={13} />, run: () => s.getState().openNote(s.getState().createNote()) },
    { label: 'Document', icon: <IcDoc size={13} />, run: () => s.getState().openDoc(s.getState().createDoc()) },
    { label: 'Spreadsheet', icon: <IcTable size={13} />, run: () => s.getState().openSheet(s.getState().createSheetDoc()) },
    { label: 'Presentation', icon: <IcPresentation size={13} />, run: () => s.getState().openPresent(s.getState().createPresentDoc()) },
    { label: 'Code file', icon: <IcCode size={13} />, run: () => s.getState().openCode(s.getState().createCode()) },
    { label: 'Board', icon: <IcBoard size={13} />, run: () => s.getState().addBoard() },
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        className="btn"
        onClick={() => setOpen((v) => !v)}
        title="Quick create"
        aria-label="Create new item"
        aria-expanded={open}
      >
        <IcPlus size={13} /> New <IcChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute top-9 left-0 z-50 w-44 rounded-xl border border-bord bg-panel p-1 shadow-xl">
          {entries.map((e) => (
            <button
              key={e.label}
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-muted hover:bg-panel2 hover:text-ink"
              onClick={() => {
                setOpen(false)
                e.run()
              }}
            >
              {e.icon} {e.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Breadcrumb: project → current context. Present in EVERY mode, so the
 * user always knows where they are (the old bar went blank outside Board).
 */
function ContextBreadcrumb() {
  const project = useStore((s) => s.projects[s.activeProjectId])
  const workspace = useStore((s) => s.workspaces[s.activeWorkspaceId])
  const viewMode = useStore((s) => s.viewMode)
  const board = useStore((s) => s.boards[s.activeBoardId])
  const renameBoard = useStore((s) => s.renameBoard)
  const docs = useStore((s) => s.docs)
  const codeDocs = useStore((s) => s.codeDocs)
  const sheetDocs = useStore((s) => s.sheetDocs)
  const notes = useStore((s) => s.notes)
  const assets = useStore((s) => s.assets)
  const activeDocId = useStore((s) => s.activeDocId)
  const activeCodeId = useStore((s) => s.activeCodeId)
  const activeSheetId = useStore((s) => s.activeSheetId)
  const activeNoteId = useStore((s) => s.activeNoteId)
  const activeAssetId = useStore((s) => s.activeAssetId)
  const readOnly = useReadOnly()

  const boardVisible = viewMode === 'board' || viewMode === 'split'

  let entity: string | null = null
  if (activeAssetId && assets[activeAssetId]) entity = assets[activeAssetId].name
  else if (activeCodeId && codeDocs[activeCodeId])
    entity = `${codeDocs[activeCodeId].title}.${codeDocs[activeCodeId].extension}`
  else if (activeSheetId && sheetDocs[activeSheetId]) entity = sheetDocs[activeSheetId].title
  else if (activeDocId && docs[activeDocId]) entity = docs[activeDocId].title
  else if (activeNoteId && notes[activeNoteId]) entity = notes[activeNoteId].title

  return (
    <div className="flex min-w-0 items-center gap-1 text-[12px]">
      {workspace && (
        <>
          <span
            className="hidden min-w-0 items-center gap-1 font-medium text-muted lg:flex"
            title={`Workspace: ${workspace.name}`}
          >
            <span aria-hidden>{workspace.icon}</span>
            <span className="max-w-24 truncate">{workspace.name}</span>
          </span>
          <IcChevronRight size={11} className="hidden flex-none text-muted lg:block" />
        </>
      )}
      {project && (
        <span className="flex min-w-0 items-center gap-1.5 font-medium text-muted" title={project.name}>
          <span aria-hidden>{project.icon}</span>
          <span className="max-w-28 truncate">{project.name}</span>
        </span>
      )}
      {viewMode === 'graph' ? (
        <>
          <IcChevronRight size={11} className="flex-none text-muted" />
          <span className="flex items-center gap-1.5 font-semibold">
            <IcGraph size={13} /> Graph
          </span>
        </>
      ) : boardVisible && board ? (
        <>
          <IcChevronRight size={11} className="flex-none text-muted" />
          <input
            className="w-36 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[12.5px] font-semibold outline-none hover:border-bord focus:border-accent disabled:hover:border-transparent"
            value={board.name}
            disabled={readOnly}
            onChange={(e) => renameBoard(board.id, e.target.value)}
            aria-label="Board name"
            title={readOnly ? 'Read-only — your role cannot rename boards' : 'Rename board'}
          />
        </>
      ) : entity ? (
        <>
          <IcChevronRight size={11} className="flex-none text-muted" />
          <span className="max-w-44 truncate font-semibold" title={entity}>
            {entity}
          </span>
        </>
      ) : null}
    </div>
  )
}

/** Comments / Versions toggles with unresolved badge. */
function PanelButtons() {
  const panel = useCollabStore((s) => s.panel)
  const setPanel = useCollabStore((s) => s.setPanel)
  const projectId = useStore((s) => s.activeProjectId)
  const comments = useCollabStore((s) => s.comments[projectId])
  const openCount = comments?.filter((t) => !t.resolved).length ?? 0

  return (
    <>
      <button
        className={`icon-btn relative ${panel === 'comments' ? 'bg-panel2 !text-accent' : ''}`}
        title="Comments"
        aria-label={`Comments${openCount ? ` (${openCount} open)` : ''}`}
        onClick={() => setPanel(panel === 'comments' ? null : 'comments')}
      >
        <IcMessage size={15} />
        {openCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[8.5px] font-bold text-white">
            {openCount > 9 ? '9+' : openCount}
          </span>
        )}
      </button>
      <button
        className={`icon-btn ${panel === 'versions' || panel === 'activity' ? 'bg-panel2 !text-accent' : ''}`}
        title="Version history & activity"
        aria-label="Version history and activity"
        onClick={() => setPanel(panel === 'versions' ? null : 'versions')}
      >
        <IcHistory size={15} />
      </button>
    </>
  )
}

export function TopBar() {
  const viewMode = useStore((s) => s.viewMode)
  const setViewMode = useStore((s) => s.setViewMode)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const setShareDialogOpen = useUiStore((s) => s.setShareDialogOpen)
  const mayCreate = useCan('content.create')
  const collabMode = useCollabMode()

  return (
    <header className="flex h-11 flex-none items-center gap-2 border-b border-bord bg-panel px-3">
      {mayCreate && <QuickCreate />}
      <ContextBreadcrumb />

      <div className="flex-1" />

      <div className="flex rounded-lg border border-bord bg-panel2 p-0.5" role="tablist" aria-label="View mode">
        {MODES.map(({ mode, label, icon }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            role="tab"
            aria-selected={viewMode === mode}
            aria-label={`${label} view`}
            title={`${label} view`}
            className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
              viewMode === mode
                ? 'bg-panel text-ink shadow-sm'
                : 'text-muted hover:text-ink'
            }`}
          >
            {icon}
            <span className="hidden xl:inline">{label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <PresenceAvatars />
      <RealtimeStatusChip />
      <NotificationCenter />
      <button
        className="btn"
        onClick={() => setShareDialogOpen(true)}
        title={
          collabMode.isRealtime
            ? 'Share — members, roles & invites · realtime multiplayer is active'
            : `Share — members, roles & invites · collaboration reaches ${collabMode.scopeLabel}`
        }
        aria-label={`Share project — collaboration reaches ${collabMode.scopeLabel}`}
      >
        <IcUserPlus size={13} />
        <span className="hidden lg:inline">Share</span>
        {!collabMode.isRealtime && (
          <span className="hidden rounded bg-panel px-1 text-[9px] font-semibold text-muted xl:inline">
            {collabMode.shortLabel}
          </span>
        )}
      </button>
      <PanelButtons />
      <button
        className="btn hidden md:inline-flex"
        onClick={() => setPaletteOpen(true)}
        title="Command palette"
        aria-label="Open command palette"
      >
        <IcCommand size={12} />
        <kbd className="text-[10px] text-muted">Ctrl K</kbd>
      </button>
      <SyncIndicator />
      <button
        className="icon-btn"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {theme === 'dark' ? <IcSun size={15} /> : <IcMoon size={15} />}
      </button>
      <ProfileMenu />
    </header>
  )
}
