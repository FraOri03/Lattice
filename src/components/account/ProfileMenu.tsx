import { useEffect, useRef, useState } from 'react'
import { useAccount } from '@/lib/auth/AccountProvider'
import { useSyncStore } from '@/lib/sync/syncStore'
import { syncEngine } from '@/lib/sync/SyncEngine'
import { githubProvider } from '@/lib/github/GithubCodeProvider'
import { useUiStore } from '@/store/useUiStore'
import { useStore } from '@/store/useStore'
import { useI18n, useLocale, useTimeAgo } from '@/lib/i18n'
import type { Locale } from '@/types/model'
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

/** Avatar button + account dropdown: profile, connected services, sync. */
export function ProfileMenu() {
  const { account, authKind, signIn, signOut } = useAccount()
  const sync = useSyncStore()
  const t = useI18n()
  const timeAgo = useTimeAgo()
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
      <button className="btn" onClick={() => void signIn()} title={t.profile.signInTitle}>
        <IcUser size={13} /> {t.profile.signIn}
      </button>
    )
  }

  const driveConnected = authKind === 'google' && sync.provider === 'google-drive'

  return (
    <div className="relative" ref={ref}>
      <button
        className="flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-bord bg-panel2 hover:border-accent"
        onClick={() => setOpen((v) => !v)}
        title={t.profile.accountTitle(account.name)}
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
                  {t.profile.localOnlyAccount}
                </div>
              )}
            </div>
          </div>

          {/* connected services */}
          <div className="insp-h !mt-3">{t.profile.connectedServices}</div>
          <ServiceRow
            icon={<IcDrive size={13} />}
            name="Google Drive"
            connected={driveConnected}
            detail={
              driveConnected
                ? t.profile.driveFolder(env.driveAppFolder)
                : authKind === 'mock'
                  ? t.profile.driveNeedsOAuth
                  : sync.status === 'connecting'
                    ? t.profile.driveConnecting
                    : t.profile.driveNotConnected
            }
            action={
              <button
                className="cursor-pointer text-[11px] text-accent hover:underline"
                onClick={() => {
                  setOpen(false)
                  setDriveDialogOpen(true)
                }}
              >
                {driveConnected ? t.profile.manage : t.profile.connect}
              </button>
            }
          />
          <ServiceRow
            icon={<IcGithub size={13} />}
            name="GitHub"
            connected={githubProvider.isConnected()}
            detail={githubUser ? t.profile.githubDetail(githubUser.login) : t.profile.githubCodeOnly}
            action={
              <button
                className="cursor-pointer text-[11px] text-accent hover:underline"
                onClick={() => {
                  setOpen(false)
                  setGithubDialogOpen(true)
                }}
              >
                {githubProvider.isConnected() ? t.profile.manage : t.profile.connect}
              </button>
            }
          />

          {/* cloud sync */}
          <div className="insp-h">{t.profile.cloudSync}</div>
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
              <div className="text-[12px]">{t.profile.status[sync.status]}</div>
              <div className="text-[10px] text-muted">
                {sync.status === 'error' && sync.error
                  ? sync.error
                  : t.profile.lastSync(timeAgo(sync.lastSyncAt), sync.pendingChanges)}
              </div>
            </div>
            {driveConnected && (
              <button
                className="icon-btn h-6 w-6"
                title={t.profile.syncNow}
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
                {t.profile.fix}
              </button>
            )}
          </div>
          {sync.conflicts.length > 0 && (
            <div className="mt-1.5 rounded-md border border-[#ffa629]/40 bg-[#ffa629]/10 px-2 py-1.5 text-[11px] text-muted">
              {t.profile.conflicts(sync.conflicts.length)}
            </div>
          )}

          {/* language */}
          <div className="insp-h">{t.profile.language}</div>
          <LanguageSwitch />

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
              <IcLogOut size={12} /> {t.profile.signOut}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** English ⇄ Italian segmented control, mirrored on the persisted `locale`. */
function LanguageSwitch() {
  const t = useI18n()
  const locale = useLocale()
  const setLocale = useStore((s) => s.setLocale)
  const options: { value: Locale; label: string }[] = [
    { value: 'en', label: t.profile.english },
    { value: 'it', label: t.profile.italian },
  ]
  return (
    <div className="flex rounded-md border border-bord bg-panel2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => setLocale(o.value)}
          aria-pressed={locale === o.value}
          className={`flex-1 cursor-pointer rounded px-2 py-1 text-[12px] font-medium ${
            locale === o.value ? 'bg-panel text-ink shadow-sm' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
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
  const t = useI18n()
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
        {connected ? t.profile.connected : t.profile.off}
      </span>
      <span className="min-w-0 flex-1 truncate text-right text-[10px] text-muted">
        {detail}
      </span>
      {action}
    </div>
  )
}
