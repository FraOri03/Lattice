import { useEffect, useState } from 'react'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { useWorkspaceLayoutStore } from '@/store/workspaceLayoutStore'
import { useSyncStore } from '@/lib/sync/syncStore'
import { syncEngine } from '@/lib/sync/SyncEngine'
import { useCollabStore } from '@/lib/collab/collabStore'
import { useReadOnly } from '@/lib/collab/useCollab'
import { SectionTabs } from '@/components/shell/SectionTabs'
import { ProfileMenu } from '@/components/account/ProfileMenu'
import { PresenceAvatars } from '@/components/collab/PresenceAvatars'
import { RealtimeStatusChip } from '@/components/collab/RealtimeStatusChip'
import { NotificationCenter } from '@/components/collab/NotificationCenter'
import { useCollabMode } from '@/lib/collab/collabPresentation'
import {
  IcAlert,
  IcChevronRight,
  IcCloud,
  IcCloudOff,
  IcCommand,
  IcGraph,
  IcHistory,
  IcMessage,
  IcMoon,
  IcRefresh,
  IcSun,
  IcUserPlus,
  IcWifiOff,
} from '@/components/Icons'

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
  const split = useWorkspaceLayoutStore((s) => s.split)
  const secondaryContent = useWorkspaceLayoutStore((s) => s.secondaryContent)
  const readOnly = useReadOnly()

  const boardVisible =
    viewMode === 'board' || (split && secondaryContent === 'board')

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
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const setShareDialogOpen = useUiStore((s) => s.setShareDialogOpen)
  const collabMode = useCollabMode()

  return (
    <header className="flex h-11 flex-none items-center gap-2 border-b border-bord bg-panel px-3">
      <ContextBreadcrumb />

      <div className="flex-1" />

      {/* Centre: [Board · Graph] and [Split · Document · Sheet · Presentation ·
          Code · Photo]. Split stays a layout and Graph a view underneath — see
          SectionTabs. */}
      <SectionTabs />

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
