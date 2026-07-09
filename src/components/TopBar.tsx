import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { useSyncStore } from '@/lib/sync/syncStore'
import { syncEngine } from '@/lib/sync/SyncEngine'
import type { ViewMode } from '@/types/model'
import { ProfileMenu } from '@/components/account/ProfileMenu'
import {
  IcBoard,
  IcChevronDown,
  IcCloud,
  IcCloudOff,
  IcCode,
  IcCommand,
  IcDoc,
  IcMoon,
  IcNote,
  IcPlus,
  IcPresentation,
  IcRefresh,
  IcSplit,
  IcSun,
  IcTable,
  IcWifiOff,
} from '@/components/Icons'

const MODES: { mode: ViewMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'board', label: 'Board', icon: <IcBoard size={13} /> },
  { mode: 'split', label: 'Split', icon: <IcSplit size={13} /> },
  { mode: 'doc', label: 'Document', icon: <IcDoc size={13} /> },
  { mode: 'sheet', label: 'Sheet', icon: <IcTable size={13} /> },
  { mode: 'presentation', label: 'Presentation', icon: <IcPresentation size={13} /> },
  { mode: 'code', label: 'Code', icon: <IcCode size={13} /> },
]

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
    return (
      <span
        className="flex items-center gap-1.5 rounded-full border border-bord bg-panel2 px-2 py-1 text-[10px] font-medium text-muted"
        title="Cloud sync is off — sign in with Google to enable Drive sync"
      >
        <IcCloudOff size={12} /> Local
      </span>
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
      onClick={() => void syncEngine.syncNow()}
    >
      {sync.status === 'syncing' ? (
        <IcRefresh size={12} className="animate-spin" />
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
    { label: 'Code file', icon: <IcCode size={13} />, run: () => s.getState().openCode(s.getState().createCode()) },
    { label: 'Board', icon: <IcBoard size={13} />, run: () => s.getState().addBoard() },
  ]

  return (
    <div className="relative" ref={ref}>
      <button className="btn" onClick={() => setOpen((v) => !v)} title="Quick create">
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

export function TopBar() {
  const board = useStore((s) => s.boards[s.activeBoardId])
  const renameBoard = useStore((s) => s.renameBoard)
  const viewMode = useStore((s) => s.viewMode)
  const setViewMode = useStore((s) => s.setViewMode)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)

  const boardVisible = viewMode === 'board' || viewMode === 'split'

  return (
    <header className="flex h-11 flex-none items-center gap-2 border-b border-bord bg-panel px-3">
      <QuickCreate />
      {boardVisible && board ? (
        <>
          <input
            className="w-44 rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] font-semibold outline-none hover:border-bord focus:border-accent"
            value={board.name}
            onChange={(e) => renameBoard(board.id, e.target.value)}
            title="Board name"
          />
          <span className="hidden text-[11px] text-muted lg:inline">
            {board.nodes.length} cards · {board.edges.length} links
          </span>
        </>
      ) : (
        <span className="w-44" />
      )}

      <div className="flex-1" />

      <div className="flex rounded-lg border border-bord bg-panel2 p-0.5">
        {MODES.map(({ mode, label, icon }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
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

      <button
        className="btn hidden md:inline-flex"
        onClick={() => setPaletteOpen(true)}
        title="Command palette"
      >
        <IcCommand size={12} />
        <kbd className="text-[10px] text-muted">Ctrl K</kbd>
      </button>
      <SyncIndicator />
      <button
        className="icon-btn"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {theme === 'dark' ? <IcSun size={15} /> : <IcMoon size={15} />}
      </button>
      <ProfileMenu />
    </header>
  )
}
