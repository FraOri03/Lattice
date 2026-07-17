import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
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
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'
import { Inspector } from '@/components/Inspector'
import { DocumentInspector } from '@/components/DocumentInspector'
import { CodeInspector } from '@/components/code/CodeInspector'
import { DocumentView } from '@/components/DocumentView'
import { BoardCanvas } from '@/components/board/BoardCanvas'
import { LoginScreen } from '@/components/account/LoginScreen'
import { GithubDialog } from '@/components/github/GithubDialog'
import { DriveDialog } from '@/components/account/DriveDialog'
import { CommandPalette } from '@/components/CommandPalette'
import { Toaster, toast } from '@/components/ui/Toaster'
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
    const invite = inviteService.findByToken(token)
    if (!invite) {
      toast.warning(
        'Invite not found',
        'This invite was revoked, already used, or its project data has not reached this browser yet.',
      )
      return
    }
    void confirmDialog({
      title: 'Join this project?',
      body: `You were invited as ${invite.role} by ${invite.invitedByName}.`,
      confirmLabel: 'Accept invite',
    }).then((ok) => {
      if (!ok) return
      if (inviteService.accept(invite)) {
        useStore.getState().setActiveProject(invite.projectId)
        toast.success('Invite accepted', `You joined as ${invite.role}.`)
      }
    })
  }, [])
}

/** Global shortcuts that aren't tied to a specific pane. */
function useGlobalShortcuts() {
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setShortcutsOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setShortcutsOpen])
}

function Workspace() {
  const theme = useStore((s) => s.theme)
  const viewMode = useStore((s) => s.viewMode)
  const activeDocId = useStore((s) => s.activeDocId)
  const activeCodeId = useStore((s) => s.activeCodeId)
  const activeAssetId = useStore((s) => s.activeAssetId)

  useCollaboration()
  useGlobalShortcuts()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Document mode: sidebar (tree) · editor · matching inspector
  const codeWorkspace = viewMode === 'doc' && !!activeCodeId && !activeAssetId
  const docWorkspace =
    viewMode === 'doc' && !!activeDocId && !activeAssetId && !activeCodeId

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <ReadOnlyBanner />
        <div className="flex min-h-0 flex-1">
          {(viewMode === 'doc' || viewMode === 'split') && <DocumentView />}
          {codeWorkspace && <CodeInspector />}
          {docWorkspace && <DocumentInspector />}
          {viewMode === 'sheet' && <SheetModeWorkspace />}
          {viewMode === 'presentation' && <PresentationModeWorkspace />}
          {viewMode === 'code' && <CodeModeWorkspace />}
          {viewMode === 'photo' && <PhotoModeWorkspace />}
          {(viewMode === 'board' || viewMode === 'split') && (
            <>
              <BoardCanvas />
              <Inspector />
            </>
          )}
          <CollabPanel />
        </div>
      </div>
      <GithubDialog />
      <DriveDialog />
      <CommandPalette />
      <ShareDialog />
      <ShortcutsDialog />
      <ImportProgressToast />
    </div>
  )
}

function Gate() {
  const { account, loginSkipped } = useAccount()
  if (!account && !loginSkipped) return <LoginScreen />
  return <Workspace />
}

export default function App() {
  return (
    <AccountProvider>
      <Gate />
      <DialogHost />
      <Toaster />
    </AccountProvider>
  )
}
