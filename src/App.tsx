import { lazy, Suspense, useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { announce } from '@/lib/a11y/announcer'
import { messages } from '@/lib/i18n'
import { tabShortcutFor, useOpenEntity } from '@/lib/tabs/openEntity'
import { useUiStore } from '@/store/useUiStore'
import { useWorkspaceLayoutStore } from '@/store/workspaceLayoutStore'
import type { ViewMode } from '@/types/model'
import { AccountProvider, useAccount } from '@/lib/auth/AccountProvider'
import { collabHub } from '@/lib/collab/hub'
import { yjsManager } from '@/lib/crdt/YjsManager'
import { presenceService } from '@/lib/collab/PresenceService'
import { realtimeBoardSync } from '@/lib/collab/RealtimeBoardSync'
import { realtimeDocumentSync } from '@/lib/collab/RealtimeDocumentSync'
import { notificationService } from '@/lib/collab/NotificationService'
import { autoSnapshot } from '@/lib/collab/AutoSnapshot'
import { membersService } from '@/lib/collab/MembersService'
import { inviteService } from '@/lib/collab/InviteService'
import { Dashboard } from '@/components/dashboard/Dashboard'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'
import { Inspector } from '@/components/Inspector'
import { DocumentInspector } from '@/components/DocumentInspector'
import { DocumentView } from '@/components/DocumentView'
import { documentPaneFor } from '@/lib/nav/activePane'
import { BoardCanvas } from '@/components/board/BoardCanvas'
import { LoginScreen } from '@/components/account/LoginScreen'
import { AuthHandoff, useAuthHandoff } from '@/components/account/AuthHandoff'
import { GithubDialog } from '@/components/github/GithubDialog'
import { DriveDialog } from '@/components/account/DriveDialog'
import { CommandPalette } from '@/components/CommandPalette'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { Toaster, toast } from '@/components/ui/Toaster'
import { LiveRegion } from '@/components/a11y/LiveRegion'
import { useUrlHistory } from '@/lib/nav/useUrlHistory'
import { useTierAttribute } from '@/lib/layout/useTierAttribute'
import { useAppearance } from '@/lib/theme/useAppearance'
import { splitAvailable } from '@/lib/layout/tiers'
import { useViewportTier } from '@/lib/layout/useViewportTier'
import { DialogHost, confirmDialog } from '@/components/ui/ConfirmDialog'
import { ShortcutsDialog } from '@/components/ui/ShortcutsDialog'
import { ShareDialog } from '@/components/collab/ShareDialog'
import { CollabPanel } from '@/components/collab/CollabPanel'
import { ReadOnlyBanner } from '@/components/collab/ReadOnlyBanner'
import {
  CodeModeWorkspace,
  PhotoModeWorkspace,
  PresentationModeWorkspace,
  SheetModeWorkspace,
} from '@/components/workspaces/ModeWorkspaces'
import { activeTab, cycleTab } from '@/lib/tabs/tabSession'
import { EntityTabStrip } from '@/components/shell/EntityTabStrip'
import { SplitResizer } from '@/components/shell/SplitResizer'
import { CallProvider } from '@/components/call/CallProvider'
import { CallIsland } from '@/components/call/CallIsland'

/** Graph mode is lazily loaded: the renderer, worker client and layout code
 * stay out of the main bundle until the user opens Graph. */
const GraphWorkspace = lazy(() => import('@/components/graph/GraphWorkspace'))

/** Floating progress toast while the universal importer is working. */
function ImportProgressToast() {
  const progress = useUiStore((s) => s.importProgress)
  if (!progress) return null
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  return (
    <div className="fixed right-4 bottom-4 z-50 w-72 rounded-xl border border-bord bg-panel p-3 shadow-xl">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-semibold">
          Importing {progress.done + 1}/{progress.total}
        </span>
        <span className="text-muted">{pct}%</span>
      </div>
      <div className="mb-1.5 truncate text-[11px] text-muted">{progress.current}</div>
      <div className="h-1.5 overflow-hidden rounded-full bg-panel2">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>
    </div>
  )
}

/** Boot the collaboration layer once the workspace is visible. */
function useCollaboration() {
  const activeProjectId = useStore((s) => s.activeProjectId)

  useEffect(() => {
    yjsManager.start() // CRDT rooms + optional realtime attach (Phase 8)
    collabHub.start()
    presenceService.start()
    realtimeBoardSync.start()
    realtimeDocumentSync.start()
    notificationService.start()
    autoSnapshot.start()
    return () => {
      autoSnapshot.stop()
      notificationService.stop()
      realtimeDocumentSync.stop()
      realtimeBoardSync.stop()
      presenceService.stop()
      collabHub.stop()
      yjsManager.stop()
    }
  }, [])

  // every project the user opens has an owner (bootstraps pre-Phase-7 projects)
  useEffect(() => {
    membersService.ensureOwner(activeProjectId)
  }, [activeProjectId])

  // invite links: …/#invite=<token>
  useEffect(() => {
    const token = new URLSearchParams(location.hash.slice(1)).get('invite')
    if (!token) return
    history.replaceState(null, '', location.pathname + location.search)
    void inviteService.findByToken(token).then((found) => {
      if (!found) {
        toast.warning(
          'Invite not found',
          'This invite was revoked, has expired, was already used, or its project data has not reached this browser yet.',
        )
        return
      }
      const { invite } = found
      void confirmDialog({
        title: 'Join this project?',
        body: `${invite.invitedByName} invited ${invite.email} as ${invite.role}.`,
        confirmLabel: 'Accept invite',
      }).then(async (confirmed) => {
        if (!confirmed) return
        /**
         * 18.3 — the address is proved before anything is granted, and by
         * the server whenever there is one. A refusal names the mailbox that
         * was invited, because that is the only fact that lets somebody act
         * on it: sign in as that address, or ask the sender to invite the
         * one you actually use.
         */
        const outcome = await inviteService.accept(invite, token)
        if (outcome.ok) {
          useStore.getState().setActiveProject(invite.projectId)
          toast.success('Invite accepted', `You joined as ${invite.role}.`)
          return
        }
        toast.warning(
          'This invitation is not yours to accept',
          outcome.error ??
            (outcome.address
              ? `It was sent to ${outcome.address}. Sign in as that address to accept it.`
              : 'It is no longer open.'),
        )
      })
    })
  }, [])
}

/** Global shortcuts that aren't tied to a specific pane. */
function useGlobalShortcuts() {
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen)
  useEffect(() => {
    let lastG = 0
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setShortcutsOpen(true)
        return
      }
      // Tabs (Phase 11.3.3) — the binding itself lives in `tabShortcutFor`,
      // which is pure and therefore assertable without a keyboard.
      const command = tabShortcutFor(e)
      if (command) {
        const s = useStore.getState()
        const session = s.tabSessions[s.activeProjectId]
        if (!session) return
        const target =
          command === 'close' ? activeTab(session) : cycleTab(session, command === 'next' ? 1 : -1)
        if (target) {
          e.preventDefault()
          if (command === 'close') s.closeEntityTab(target)
          else s.activateEntityTab(target)
        }
        return
      }
      // "G G" chord opens Graph mode — ignored while typing / with modifiers
      const el = e.target as HTMLElement | null
      const typing =
        !!el &&
        (el.isContentEditable ||
          el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT')
      if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'g' || e.key === 'G')) {
        const now = Date.now()
        if (now - lastG < 500) {
          e.preventDefault()
          useStore.getState().setViewMode('graph')
          lastG = 0
        } else {
          lastG = now
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setShortcutsOpen])
}

/** Graph mode fallback, reused by the single and split panes. */
function GraphPane() {
  return (
    <Suspense
      fallback={
        <div className="flex min-w-0 flex-1 items-center justify-center bg-bg text-xs text-muted">
          Loading graph…
        </div>
      }
    >
      <GraphWorkspace />
    </Suspense>
  )
}

/**
 * The content a pane renders for a given section (or the graph view). This is
 * the former single-pane switch, now reusable so it can fill either the whole
 * area or the primary pane of a split.
 */
function SectionContent({ viewMode }: { viewMode: ViewMode }) {
  const open = useOpenEntity()

  // Document section: editor · matching inspector. The inspector follows
  // whatever DocumentView actually mounts, so the two can never disagree —
  // docking the document inspector next to a spreadsheet is what made the
  // two views look stacked. Code files and spreadsheets are owned by their
  // own sections and never render here.
  const docWorkspace = viewMode === 'doc' && documentPaneFor(viewMode, open) === 'doc'

  return (
    <>
      {viewMode === 'doc' && <DocumentView />}
      {docWorkspace && <DocumentInspector />}
      {viewMode === 'sheet' && <SheetModeWorkspace />}
      {viewMode === 'presentation' && <PresentationModeWorkspace />}
      {viewMode === 'code' && <CodeModeWorkspace />}
      {viewMode === 'photo' && <PhotoModeWorkspace />}
      {viewMode === 'graph' && <GraphPane />}
      {viewMode === 'board' && (
        <>
          <BoardCanvas />
          <Inspector />
        </>
      )}
    </>
  )
}

/** The project surface: sidebar, top bar and the editor panes. */
function ProjectSurface() {
  const viewMode = useStore((s) => s.viewMode)
  const split = useWorkspaceLayoutStore((s) => s.split)
  const direction = useWorkspaceLayoutStore((s) => s.direction)
  const ratio = useWorkspaceLayoutStore((s) => s.ratio)
  const secondaryContent = useWorkspaceLayoutStore((s) => s.secondaryContent)
  const setRatio = useWorkspaceLayoutStore((s) => s.setRatio)
  const closeSplit = useWorkspaceLayoutStore((s) => s.closeSplit)

  // A window that stops being wide enough closes the split rather than
  // rendering two unusable panes. It is closed in the STORE, not just hidden:
  // `currentNav` serialises `split` into the URL, so a layout the shell is not
  // showing must not survive in a link (12.2).
  const tier = useViewportTier()
  const fitsSplit = splitAvailable(tier)
  useEffect(() => {
    if (!fitsSplit && split) closeSplit()
  }, [fitsSplit, split, closeSplit])

  // Presentation and Photo are full-page sections that do not split.
  const showSplit =
    split && fitsSplit && viewMode !== 'presentation' && viewMode !== 'photo'

  return (
    // `relative` so the sidebar can leave the flow below the Compact tier and
    // overlay the surface instead of being squeezed out of it (12.2).
    //
    // `overflow-x-clip` because a drawer arrives by sliding in from its edge,
    // and for the length of that slide it sits outside its container — where
    // it extends the document's scrollable width and the page can be dragged
    // sideways, which is the exact thing this phase exists to remove. `clip`
    // rather than `hidden`: it does not create a scroll container, so nothing
    // inside starts scrolling for having been told not to overflow (12.5).
    <div className="relative flex h-full overflow-x-clip">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {/* the project's open entities, above the section they open into */}
        <EntityTabStrip />
        <ReadOnlyBanner />
        {/* the containing block for the inspector and collaboration drawers —
            clipped on the inline axis for the same reason as the surface above */}
        <div className="relative flex min-h-0 flex-1 overflow-x-clip">
          {showSplit ? (
            <div
              className={`flex min-h-0 min-w-0 flex-1 ${
                direction === 'vertical' ? 'flex-col' : 'flex-row'
              }`}
            >
              <div
                className="flex min-h-0 min-w-0 overflow-hidden"
                style={{ flex: `${ratio} 1 0%` }}
              >
                <SectionContent viewMode={viewMode} />
              </div>
              <SplitResizer direction={direction} ratio={ratio} onRatio={setRatio} />
              <div
                className="flex min-h-0 min-w-0 overflow-hidden"
                style={{ flex: `${1 - ratio} 1 0%` }}
              >
                {secondaryContent === 'graph' ? (
                  <GraphPane />
                ) : (
                  <>
                    <BoardCanvas />
                    <Inspector />
                  </>
                )}
              </div>
            </div>
          ) : (
            <SectionContent viewMode={viewMode} />
          )}
          <CallIsland />
          <CollabPanel />
        </div>
      </div>
    </div>
  )
}

/**
 * The shell that outlives every surface.
 *
 * Collaboration, the global shortcuts and the URL binding are mounted HERE,
 * above the surface, and not inside one. `useUrlHistory` is the single writer
 * of browser history: put it inside a surface and it unmounts the moment you
 * leave that surface, so the dashboard would arrive by dropping the very
 * binding that puts it in the URL. `useCollaboration` follows the same rule
 * as `CallProvider` above it — a trip to the dashboard should not tear down
 * and re-attach the CRDT rooms of the project you were just in.
 *
 * The overlays sit here for the same reason: none of them belongs to a
 * surface, each is `fixed inset-0` so it does not need the surface's flex
 * container, and the command palette has to answer on the dashboard too.
 *
 * The surface switch below is the whole of `navSurface`'s effect on what you
 * see: the URL owns which one is showing (bare root = Home), and opening a
 * project is what leaves the dashboard again.
 */
function AppShell() {
  const surface = useStore((s) => s.navSurface)

  useCollaboration()
  useGlobalShortcuts()
  useUrlHistory()
  // the viewport tier, published on :root for CSS and read by the shell. It
  // is mounted here for the same reason as the history binding: one writer,
  // above the surface switch, so it survives the trip to the dashboard.
  useTierAttribute()

  /**
   * The 30-day sweep (15.6). Nothing schedules a purge while the app is shut,
   * so it runs on open — which means a device left closed for two months takes
   * a batch out at once. It says how many rather than quietly shrinking.
   */
  useEffect(() => {
    const removed = useStore.getState().purgeExpired()
    if (removed > 0) announce(messages[useStore.getState().locale].announcements.purgedOnOpen(removed))
  }, [])
  // theme, contrast, density, UI scale and motion, published on :root by the
  // one writer that owns them (14.3) — including the live 'system' theme
  useAppearance()

  return (
    <>
      {surface === 'dashboard' ? <Dashboard /> : <ProjectSurface />}
      {/* settings covers the surface it was opened from, so it mounts beside
          the switch rather than inside either branch (14.1) */}
      <SettingsScreen />
      <GithubDialog />
      <DriveDialog />
      <CommandPalette />
      <ShareDialog />
      <ShortcutsDialog />
      <ImportProgressToast />
    </>
  )
}

function Gate() {
  const { account, loginSkipped } = useAccount()
  const open = !!account || loginSkipped
  const phase = useAuthHandoff(open)
  const wasGated = useRef(!open)

  // Landing: signing in lands on Home, not on whatever project the URL
  // still remembers from last time. This runs AFTER useUrlHistory's restore
  // (child effects fire before the parent's), so it is the last word on the
  // surface — and the URL follows it to the bare root. Only a real
  // transition through the login screen triggers it: someone who is already
  // signed in and opens a deep link keeps their link.
  useEffect(() => {
    if (wasGated.current && open) useStore.getState().openDashboard()
    wasGated.current = !open
  }, [open])

  if (!open) return <LoginScreen />
  // The call provider sits ABOVE the shell: switching section, toggling
  // Split or opening the Graph re-renders the panes, but never remounts the
  // LiveKit room, so a call survives navigation.
  return (
    <>
      {/* while the cover is opaque the login card is still the thing
          underneath — the swap happens behind it, never in front */}
      {phase === 'cover' ? (
        <LoginScreen />
      ) : (
        <CallProvider>
          <AppShell />
        </CallProvider>
      )}
      <AuthHandoff phase={phase} />
    </>
  )
}

export default function App() {
  return (
    <AccountProvider>
      <Gate />
      <DialogHost />
      <Toaster />
      <LiveRegion />
    </AccountProvider>
  )
}
