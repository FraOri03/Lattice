import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { AccountProvider, useAccount } from '@/lib/auth/AccountProvider'
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
import {
  CodeModeWorkspace,
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

function Workspace() {
  const theme = useStore((s) => s.theme)
  const viewMode = useStore((s) => s.viewMode)
  const activeDocId = useStore((s) => s.activeDocId)
  const activeCodeId = useStore((s) => s.activeCodeId)
  const activeAssetId = useStore((s) => s.activeAssetId)

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
        <div className="flex min-h-0 flex-1">
          {(viewMode === 'doc' || viewMode === 'split') && <DocumentView />}
          {codeWorkspace && <CodeInspector />}
          {docWorkspace && <DocumentInspector />}
          {viewMode === 'sheet' && <SheetModeWorkspace />}
          {viewMode === 'presentation' && <PresentationModeWorkspace />}
          {viewMode === 'code' && <CodeModeWorkspace />}
          {(viewMode === 'board' || viewMode === 'split') && (
            <>
              <BoardCanvas />
              <Inspector />
            </>
          )}
        </div>
      </div>
      <GithubDialog />
      <DriveDialog />
      <CommandPalette />
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
    </AccountProvider>
  )
}
