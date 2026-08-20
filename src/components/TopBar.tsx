import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { barFit } from '@/lib/layout/topBarFit'
import { useElementWidth } from '@/lib/layout/useElementWidth'
import { useOpenId } from '@/lib/tabs/openEntity'
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
import { AnchoredPopover } from '@/components/ui/AnchoredPopover'
import { useI18n } from '@/lib/i18n'
import { nextTheme, setThemeAnimated } from '@/lib/theme/animateTheme'
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

/**
 * The modifier the palette's hint should name. `CommandPalette` accepts Ctrl
 * *or* Meta, so this is purely about which one the user's keyboard has — a bar
 * that reads "Ctrl K" beside a ⌘ glyph on a Windows machine names a key that
 * is not on the keyboard it is being read on.
 */
const MOD_KEY = /mac|iphone|ipad/i.test(
  typeof navigator === 'undefined' ? '' : navigator.userAgent,
)
  ? '⌘'
  : 'Ctrl'

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
  const activeDocId = useOpenId('doc')
  const activeCodeId = useOpenId('code')
  const activeSheetId = useOpenId('sheet')
  const activeNoteId = useOpenId('note')
  const activeAssetId = useOpenId('asset')
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
    /**
     * `min-w-24`: the breadcrumb was the only `min-w-0` child of the header,
     * so flexbox drained it to zero before any other control gave up a pixel —
     * at 1680, a width where nothing overflows, it was already 11 px wide
     * (audit F2). It truncates now; it does not vanish.
     */
    <div className="flex min-w-24 items-center gap-1 text-[12px]">
      {workspace && (
        <>
          <span
            className="hidden min-w-0 items-center gap-1 font-medium text-muted @min-[64rem]:flex"
            title={t.topbar.workspaceTitle(workspace.name)}
          >
            <span aria-hidden>{workspace.icon}</span>
            <span className="max-w-24 truncate">{workspace.name}</span>
          </span>
          <IcChevronRight size={11} className="hidden flex-none text-muted @min-[64rem]:block" />
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

/**
 * Whatever did not fit in the bar, in a menu (Phase 12.3).
 *
 * It takes children rather than a list of menu items, because half of what it
 * has to hold — presence, the realtime chip, the call button, notifications —
 * are components with popovers of their own, not actions with a label. They
 * keep working here: nothing clips them, and the panel closes on a click
 * outside it, not on a click inside.
 */
function TopBarOverflow({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])

  return (
    <div className="relative flex-none">
      <button
        ref={trigger}
        className="icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden className="text-[15px] leading-none">
          ···
        </span>
      </button>
      {/* portalled out of the bar: this header is a scroll container in both
          axes, so an `absolute` panel here is clipped to the 43 px row */}
      <AnchoredPopover
        anchorRef={trigger}
        open={open}
        onClose={close}
        className="flex w-max flex-col items-stretch gap-2 overflow-y-auto p-2"
      >
        {children}
      </AnchoredPopover>
    </div>
  )
}

/**
 * The shell's top bar, on either surface.
 *
 * The dashboard variant (15.7) drops what names a project that is not open:
 * the breadcrumb, the section tabs, the panel buttons, presence, the realtime
 * chip and the call. **Share goes too** — it acts on `activeProjectId`, which
 * survives the trip Home, so a Share button on the dashboard would silently
 * share whichever project you happened to open last. That is the same invisible
 * inheritance 13.4 §6 removed from creation.
 *
 * What stays is what is true with no project open: search, notifications, sync,
 * theme, profile. One bar rather than two, so the controls are wired once.
 */
export function TopBar({
  variant = 'project',
  title,
  trailing,
}: {
  variant?: 'project' | 'dashboard'
  /** Replaces the breadcrumb on the dashboard — the destination's name. */
  title?: string
  /** Surface-specific controls, placed before the shared cluster. */
  trailing?: React.ReactNode
} = {}) {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const setShareDialogOpen = useUiStore((s) => s.setShareDialogOpen)
  const collabMode = useCollabMode()
  const bar = useRef<HTMLElement>(null)
  const t = useI18n()

  /**
   * What folds, and when. Two groups leave at two different widths, each
   * rendered ONCE and moved rather than duplicated: mounting
   * `NotificationCenter` twice and hiding one with CSS would give the project
   * two of the same state, which is the failure phase 11.3 spent itself
   * removing.
   *
   * The widths come from measuring THIS element, not the window — the bar is
   * the viewport minus the sidebar, minus more when a pane is split, and the
   * old viewport-tier rule was reading a number ~250px larger than the box it
   * was deciding for. See lib/layout/topBarFit for the measured thresholds.
   */
  const fit = barFit(useElementWidth(bar))
  const foldActions = !fit.showActions
  const foldStatus = !fit.showStatus

  /**
   * A control shows its word when the bar is wide — or whenever it has been
   * folded into the "···" panel, which is roomy and where a column of
   * unlabelled icons would be a menu of guesses. This is why the rule is a
   * prop and not a `@min-[64rem]:` class: the panel is portalled out of the
   * bar, so a container query there measures the popover, or nothing.
   */
  const labelled = (folded: boolean) => folded || fit.showControlLabels

  // presence (who is in the project) and the call (who is talking) are
  // deliberately adjacent but distinct states
  const onDashboard = variant === 'dashboard'

  const status = (
    <>
      {/* presence, the realtime chip and the call all describe an attached
          project room; on the dashboard none is attached */}
      {!onDashboard && (
        <>
          <PresenceAvatars labelled={labelled(foldStatus)} />
          <RealtimeStatusChip labelled={labelled(foldStatus)} />
          <JoinCallButton labelled={labelled(foldStatus)} />
        </>
      )}
      <NotificationCenter />
      <SyncIndicator />
    </>
  )

  const actions = (
    <>
      {!onDashboard && (
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
        {labelled(foldActions) && <span>{t.topbar.share}</span>}
        {!collabMode.isRealtime && (foldActions || fit.showScopeBadge) && (
          <span className="rounded bg-panel px-1 text-[9px] font-semibold text-muted">
            {collabMode.shortLabel}
          </span>
        )}
      </button>
      )}
      {!onDashboard && <PanelButtons />}
      <button
        className="btn"
        onClick={() => setPaletteOpen(true)}
        title={t.topbar.commandPalette}
        aria-label={t.topbar.openCommandPalette}
      >
        <IcCommand size={12} />
        <kbd className="text-[10px] text-muted">{MOD_KEY} K</kbd>
      </button>
      {/* the reveal starts from this button, so the new theme visibly comes
          out of the control the user pressed */}
      <button
        className="icon-btn"
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          setThemeAnimated(nextTheme(theme), setTheme, {
            x: box.left + box.width / 2,
            y: box.top + box.height / 2,
            r: box.width / 2,
          })
        }}
        title={theme === 'dark' ? t.topbar.themeToLight : t.topbar.themeToDark}
        aria-label={theme === 'dark' ? t.topbar.themeToLight : t.topbar.themeToDark}
      >
        {/* keyed on the theme so React remounts it and the swap animation
            actually replays — a reused element would just change children */}
        <span key={theme} className="theme-icon-swap">
          {theme === 'dark' ? <IcSun size={15} /> : <IcMoon size={15} />}
        </span>
      </button>
    </>
  )

  return (
    /**
     * `@container`: everything inside that hides a label asks THIS box how
     * wide it is, not the window. The bar lives in the viewport minus the
     * sidebar — and minus more than that when a pane is split — so `lg:` was
     * showing eight section labels into a 784 px box at a 1024 viewport, which
     * is the row in the audit with ten children hanging outside the bar (F4).
     *
     * `overflow-x-auto` is the floor, not the mechanism: folding is what
     * should keep the bar inside its box, but if some locale or some future
     * control overflows anyway, the bar scrolls and the document does not.
     */
    <header
      ref={bar}
      className="@container flex h-11 max-w-full min-w-0 flex-none items-center gap-2 overflow-x-auto border-b border-bord bg-panel px-3"
    >
      {onDashboard ? (
        <span className="min-w-0 truncate text-[13px] font-bold">{title}</span>
      ) : (
        <ContextBreadcrumb />
      )}

      <div className="flex-1" />

      {/* Centre: [Split] · [Board · Graph] · [Document · Sheet · Presentation ·
          Code] · [ComfyUI · AI dashboard] · [Trace · Forge · Photo · Folio ·
          Flux]. Split stays a layout and Graph a view underneath, and the last
          two clusters are disabled placeholders — see SectionTabs. */}
      {!onDashboard && <SectionTabs />}

      <div className="flex-1" />

      {trailing}

      {!foldStatus && status}
      {!foldActions && actions}
      {(foldStatus || foldActions) && (
        <TopBarOverflow label={t.topbar.more}>
          {foldStatus && status}
          {foldActions && actions}
        </TopBarOverflow>
      )}
      <ProfileMenu />
    </header>
  )
}
