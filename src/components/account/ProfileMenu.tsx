import { useEffect, useRef, useState } from 'react'
import { useAccount } from '@/lib/auth/AccountProvider'
import { useSyncStore } from '@/lib/sync/syncStore'
import { syncEngine } from '@/lib/sync/SyncEngine'
import { githubProvider } from '@/lib/github/GithubCodeProvider'
import { useUiStore } from '@/store/useUiStore'
import { env } from '@/lib/env'
import {
  IcCheck,
  IcCloud,
  IcDrive,
  IcGithub,
  IcLogOut,
  IcRefresh,
  IcUser,
  IcX,
} from '@/components/Icons'

function timeAgo(ts: number | null): string {
  if (!ts) return 'never'
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

const SYNC_LABEL: Record<string, string> = {
  idle: 'Waiting for changes',
  connecting: 'Connecting to Drive…',
  syncing: 'Syncing…',
  synced: 'Up to date',
  offline: 'Offline — will resume',
  error: 'Sync error',
  disabled: 'Cloud sync off',
}

/** Avatar button + account dropdown: profile, connected services, sync. */
export function ProfileMenu() {
  const { account, authKind, signIn, signOut } = useAccount()
  const sync = useSyncStore()
  const setGithubDialogOpen = useUiStore((s) => s.setGithubDialogOpen)
  const setDriveDialogOpen = useUiStore((s) => s.setDriveDialogOpen)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const githubUser = githubProvider.getCachedUser()

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  if (!account) {
    return (
      <button className="btn" onClick={() => void signIn()} title="Sign in">
        <IcUser size={13} /> Sign in
      </button>
    )
  }

  const driveConnected = authKind === 'google' && sync.provider === 'google-drive'

  return (
    <div className="relative" ref={ref}>
      <button
        className="flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-bord bg-panel2 hover:border-accent"
        onClick={() => setOpen((v) => !v)}
        title={`${account.name} — account`}
      >
        {account.avatarUrl ? (
          <img src={account.avatarUrl} alt={account.name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-[11px] font-bold text-muted">
            {account.name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-9 right-0 z-50 w-72 rounded-xl border border-bord bg-panel p-3 shadow-xl">
          {/* identity */}
          <div className="flex items-center gap-3 border-b border-bord pb-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full border border-bord bg-panel2">
              {account.avatarUrl ? (
                <img src={account.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <IcUser size={18} className="text-muted" />
              )}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold">{account.name}</div>
              <div className="truncate text-[11px] text-muted">{account.email}</div>
              {authKind === 'mock' && (
                <div className="mt-0.5 inline-block rounded bg-panel2 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-[#ffa629] uppercase">
                  local-only account
                </div>
              )}
            </div>
          </div>

          {/* connected services */}
          <div className="insp-h !mt-3">Connected services</div>
          <ServiceRow
            icon={<IcDrive size={13} />}
            name="Google Drive"
            connected={driveConnected}
            detail={
              driveConnected
                ? `folder “${env.driveAppFolder}”`
                : authKind === 'mock'
                  ? 'needs OAuth setup'
                  : sync.status === 'connecting'
                    ? 'connecting…'
                    : 'not connected'
            }
            action={
              <button
                className="cursor-pointer text-[11px] text-accent hover:underline"
                onClick={() => {
                  setOpen(false)
                  setDriveDialogOpen(true)
                }}
              >
                {driveConnected ? 'Manage' : 'Connect'}
              </button>
            }
          />
          <ServiceRow
            icon={<IcGithub size={13} />}
            name="GitHub"
            connected={githubProvider.isConnected()}
            detail={githubUser ? `@${githubUser.login} · code sync` : 'code sync only'}
            action={
              <button
                className="cursor-pointer text-[11px] text-accent hover:underline"
                onClick={() => {
                  setOpen(false)
                  setGithubDialogOpen(true)
                }}
              >
                {githubProvider.isConnected() ? 'Manage' : 'Connect'}
              </button>
            }
          />

          {/* cloud sync */}
          <div className="insp-h">Cloud sync</div>
          <div className="flex items-center gap-2 rounded-md bg-panel2 px-2 py-1.5">
            <IcCloud
              size={13}
              className={
                sync.status === 'synced'
                  ? 'text-[#14ae5c]'
                  : sync.status === 'error'
                    ? 'text-[#f24822]'
                    : 'text-muted'
              }
            />
            <div className="min-w-0 flex-1">
              <div className="text-[12px]">{SYNC_LABEL[sync.status]}</div>
              <div className="text-[10px] text-muted">
                {sync.status === 'error' && sync.error
                  ? sync.error
                  : `last sync ${timeAgo(sync.lastSyncAt)}${sync.pendingChanges ? ` · ${sync.pendingChanges} pending` : ''}`}
              </div>
            </div>
            {driveConnected && (
              <button
                className="icon-btn h-6 w-6"
                title="Sync now"
                onClick={() => void syncEngine.syncNow()}
              >
                <IcRefresh size={12} />
              </button>
            )}
            {!driveConnected && sync.status === 'error' && (
              <button
                className="cursor-pointer text-[11px] text-accent hover:underline"
                onClick={() => {
                  setOpen(false)
                  setDriveDialogOpen(true)
                }}
              >
                Fix
              </button>
            )}
          </div>
          {sync.conflicts.length > 0 && (
            <div className="mt-1.5 rounded-md border border-[#ffa629]/40 bg-[#ffa629]/10 px-2 py-1.5 text-[11px] text-muted">
              {sync.conflicts.length} conflict{sync.conflicts.length > 1 ? 's' : ''} resolved
              (newest won; older copies kept on Drive)
            </div>
          )}

          {/* footer */}
          <div className="mt-3 flex items-center justify-between border-t border-bord pt-2.5">
            <span className="text-[10px] text-muted">
              Lattice v{env.appVersion} · {env.appEnv}
            </span>
            <button
              className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted hover:bg-panel2 hover:text-ink"
              onClick={() => {
                setOpen(false)
                void signOut()
              }}
            >
              <IcLogOut size={12} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ServiceRow({
  icon,
  name,
  connected,
  detail,
  action,
}: {
  icon: React.ReactNode
  name: string
  connected: boolean
  detail: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 px-1 py-1">
      <span className="text-muted">{icon}</span>
      <span className="text-[12px] font-medium">{name}</span>
      <span
        className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
          connected ? 'bg-[#14ae5c]/15 text-[#14ae5c]' : 'bg-panel2 text-muted'
        }`}
      >
        {connected ? <IcCheck size={9} /> : <IcX size={9} />}
        {connected ? 'connected' : 'off'}
      </span>
      <span className="min-w-0 flex-1 truncate text-right text-[10px] text-muted">
        {detail}
      </span>
      {action}
    </div>
  )
}
