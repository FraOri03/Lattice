import { useEffect, useState } from 'react'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { useWorkspaceLayoutStore } from '@/store/workspaceLayoutStore'
import { useSyncStore } from '@/lib/sync/syncStore'
import { syncEngine } from '@/lib/sync/SyncEngine'
import { useCollabStore } from '@/lib/collab/collabStore'
import { useReadOnly } from '@/lib/collab/useCollab'
import { SectionTabs } from '@/components/shell/SectionTabs'
import { JoinCallButton } from '@/components/call/JoinCallButton'
import { ProfileMenu } from '@/components/account/ProfileMenu'
import { PresenceAvatars } from '@/components/collab/PresenceAvatars'
import { RealtimeStatusChip } from '@/components/collab/RealtimeStatusChip'
import { NotificationCenter } from '@/components/collab/NotificationCenter'
import { useCollabMode } from '@/lib/collab/collabPresentation'
import { useI18n } from '@/lib/i18n'
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
  const t = useI18n()
  const setDriveDialogOpen = useUiStore((s) => s.setDriveDialogOpen)

  if (!online) {
    return (
      <span
        className="flex items-center gap-1.5 rounded-full border border-bord bg-panel2 px-2 py-1 text-[10px] font-medium text-[#ffa629]"
        title={t.syncChip.offlineTitle}
      >
        <IcWifiOff size={12} /> {t.syncChip.offline}
      </span>
    )
  }
  if (sync.provider !== 'google-drive') {
    // Drive not (yet) verified: show connecting / a clickable error / local
    if (sync.status === 'connecting') {
      return (
        <span className="flex items-center gap-1.5 rounded-full border border-bord bg-panel2 px-2 py-1 text-[10px] font-medium text-muted">
          <IcRefresh size={12} className="animate-spin" /> {t.syncChip.connecting}
        </span>
      )
    }
    if (sync.status === 'error') {
      const err = sync.error ?? t.syncChip.driveNotConnected
      return (
        <button
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[#f24822]/40 bg-panel2 px-2 py-1 text-[10px] font-medium text-[#f24822]"
          title={t.syncChip.driveErrorTitle(err)}
          aria-label={t.syncChip.driveErrorAria(err)}
          onClick={() => setDriveDialogOpen(true)}
        >
          <IcAlert size={12} /> {t.syncChip.driveError}
        </button>
      )
    }
    return (
      <button
        className="flex cursor-pointer items-center gap-1.5 rounded-full border border-bord bg-panel2 px-2 py-1 text-[10px] font-medium text-muted"
        title={t.syncChip.localTitle}
        onClick={() => setDriveDialogOpen(true)}
      >
        <IcCloudOff size={12} /> {t.syncChip.local}
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
      ? t.syncChip.syncing
      : sync.status === 'synced'
        ? t.syncChip.synced
        : sync.status === 'error'
          ? t.syncChip.syncError
          : sync.pendingChanges > 0
            ? t.syncChip.pending(sync.pendingChanges)
            : t.syncChip.drive
  return (
    <button
      className={`flex cursor-pointer items-center gap-1.5 rounded-full border border-bord bg-panel2 px-2 py-1 text-[10px] font-medium ${color}`}
      title={sync.error ?? t.syncChip.driveTitle}
      aria-label={t.syncChip.driveAria(label, sync.status === 'error')}
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
  const t = useI18n()

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
            title={t.topbar.workspaceTitle(workspace.name)}
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
            <IcGraph size={13} /> {t.topbar.graph}
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
            aria-label={t.topbar.boardName}
            title={readOnly ? t.topbar.renameBoardReadOnly : t.topbar.renameBoard}
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
  const openCount = comments?.filter((c) => !c.resolved).length ?? 0
  const t = useI18n()

  return (
    <>
      <button
        className={`icon-btn relative ${panel === 'comments' ? 'bg-panel2 !text-accent' : ''}`}
        title={t.topbar.comments}
        aria-label={openCount ? t.topbar.commentsOpenAria(openCount) : t.topbar.comments}
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
        title={t.topbar.versionHistory}
        aria-label={t.topbar.versionHistoryAria}
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
  const t = useI18n()

  return (
    <header className="flex h-11 flex-none items-center gap-2 border-b border-bord bg-panel px-3">
      <ContextBreadcrumb />

      <div className="flex-1" />

      {/* Centre: [Split] · [Board · Graph] · [Document · Sheet · Presentation ·
          Code · Photo]. Split stays a layout and Graph a view underneath — see
          SectionTabs. */}
      <SectionTabs />

      <div className="flex-1" />

      {/* presence (who is in the project) and the call (who is talking) are
          deliberately adjacent but distinct states */}
      <PresenceAvatars />
      <RealtimeStatusChip />
      <JoinCallButton />
      <NotificationCenter />
      <button
        className="btn"
        onClick={() => setShareDialogOpen(true)}
        title={
          collabMode.isRealtime
            ? t.topbar.shareTitleRealtime
            : t.topbar.shareTitleScope(collabMode.scopeLabel)
        }
        aria-label={t.topbar.shareAria(collabMode.scopeLabel)}
      >
        <IcUserPlus size={13} />
        <span className="hidden lg:inline">{t.topbar.share}</span>
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
        title={t.topbar.commandPalette}
        aria-label={t.topbar.openCommandPalette}
      >
        <IcCommand size={12} />
        <kbd className="text-[10px] text-muted">Ctrl K</kbd>
      </button>
      <SyncIndicator />
      <button
        className="icon-btn"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        title={theme === 'dark' ? t.topbar.themeToLight : t.topbar.themeToDark}
        aria-label={theme === 'dark' ? t.topbar.themeToLight : t.topbar.themeToDark}
      >
        {theme === 'dark' ? <IcSun size={15} /> : <IcMoon size={15} />}
      </button>
      <ProfileMenu />
    </header>
  )
}
