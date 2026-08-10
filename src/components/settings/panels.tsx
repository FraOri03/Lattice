import type { ReactNode } from 'react'
import { useAccount } from '@/lib/auth/AccountProvider'
import { useSyncStore } from '@/lib/sync/syncStore'
import { syncEngine } from '@/lib/sync/SyncEngine'
import { githubProvider } from '@/lib/github/GithubCodeProvider'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { useI18n, useLocale, useTimeAgo } from '@/lib/i18n'
import { nextTheme, setThemeAnimated } from '@/lib/theme/animateTheme'
import { env } from '@/lib/env'
import type { Locale } from '@/types/model'
import type { SettingsSection } from '@/lib/settings/sections'
import {
  IcCheck,
  IcCloud,
  IcDrive,
  IcGithub,
  IcKeyboard,
  IcLogOut,
  IcRefresh,
  IcUser,
  IcX,
} from '@/components/Icons'

/**
 * The settings panels (Phase 14.1).
 *
 * 14.1 is the shell, so what lands here is what ProfileMenu already held —
 * identity, the two connected services, sync and language — moved into the
 * section it belongs to rather than copied. Everything else says what will
 * live there and what it waits on: a panel that promises nothing is honest,
 * a panel that shows an empty control is not.
 */

/* ---------------- shared blocks ---------------- */

export function Card({
  title,
  body,
  children,
}: {
  title?: string
  body?: string
  children?: ReactNode
}) {
  return (
    <div className="mb-3 rounded-xl border border-bord bg-panel p-4">
      {title && <div className="text-[13px] font-semibold">{title}</div>}
      {body && <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{body}</p>}
      {children && <div className={title || body ? 'mt-3' : ''}>{children}</div>}
    </div>
  )
}

/**
 * A section that is not built yet. Dashed rather than solid, and it names the
 * phase that fills it — "coming soon" is a promise nobody is holding.
 */
export function Pending({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-bord p-4 text-[11.5px] leading-relaxed text-muted">
      {children}
    </div>
  )
}

function Row({
  icon,
  name,
  state,
  ok,
  detail,
  action,
}: {
  icon: ReactNode
  name: string
  state: string
  ok: boolean
  detail: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-bord py-2.5 last:border-b-0">
      <span className="text-muted">{icon}</span>
      <span className="text-[12.5px] font-medium">{name}</span>
      {/* state never rests on colour alone: a mark and a word (A11Y-2) */}
      <span
        className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
          ok ? 'bg-[#14ae5c]/15 text-[#14ae5c]' : 'bg-panel2 text-muted'
        }`}
      >
        {ok ? <IcCheck size={9} /> : <IcX size={9} />}
        {state}
      </span>
      <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted">{detail}</span>
      {action}
    </div>
  )
}

function LinkButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="min-h-6 cursor-pointer rounded px-1 text-[11px] text-accent hover:underline"
      onClick={onClick}
    >
      {label}
    </button>
  )
}

/* ---------------- account ---------------- */

function AccountPanel() {
  const t = useI18n()
  const { account, authKind, signIn, signOut } = useAccount()

  if (!account) {
    return (
      <Card title={t.settings.notSignedIn} body={t.settings.notSignedInBody}>
        <button className="btn" onClick={() => void signIn()}>
          <IcUser size={13} /> {t.profile.signIn}
        </button>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 flex-none items-center justify-center overflow-hidden rounded-full border border-bord bg-panel2">
            {account.avatarUrl ? (
              <img src={account.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <IcUser size={20} className="text-muted" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold">{account.name}</div>
            <div className="truncate text-[11.5px] text-muted">{account.email}</div>
            {authKind === 'mock' && (
              <div className="mt-1 inline-block rounded bg-panel2 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-[#ffa629] uppercase">
                {t.profile.localOnlyAccount}
              </div>
            )}
          </div>
          <button className="btn" onClick={() => void signOut()}>
            <IcLogOut size={12} /> {t.profile.signOut}
          </button>
        </div>
      </Card>
      <Pending>{t.settings.pending.accountMore}</Pending>
    </>
  )
}

/* ---------------- appearance ---------------- */

function AppearancePanel() {
  const t = useI18n()
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const locale = useLocale()
  const setLocale = useStore((s) => s.setLocale)
  const locales: { value: Locale; label: string }[] = [
    { value: 'en', label: t.profile.english },
    { value: 'it', label: t.profile.italian },
  ]

  return (
    <>
      <Card title={t.settings.theme}>
        <div className="flex gap-2">
          {(['dark', 'light'] as const).map((value) => (
            <button
              key={value}
              aria-pressed={theme === value}
              className={`min-h-8 flex-1 cursor-pointer rounded-lg border px-3 py-1.5 text-[12px] font-medium ${
                theme === value
                  ? 'border-accent bg-panel2 text-ink'
                  : 'border-bord text-muted hover:text-ink'
              }`}
              onClick={(e) => {
                if (theme === value) return
                // the reveal grows from the control that started it
                setThemeAnimated(nextTheme(theme), setTheme, {
                  x: e.clientX,
                  y: e.clientY,
                })
              }}
            >
              {value === 'dark' ? t.settings.themeDark : t.settings.themeLight}
            </button>
          ))}
        </div>
      </Card>

      <Card title={t.profile.language}>
        <div className="flex gap-2">
          {locales.map((o) => (
            <button
              key={o.value}
              aria-pressed={locale === o.value}
              className={`min-h-8 flex-1 cursor-pointer rounded-lg border px-3 py-1.5 text-[12px] font-medium ${
                locale === o.value
                  ? 'border-accent bg-panel2 text-ink'
                  : 'border-bord text-muted hover:text-ink'
              }`}
              onClick={() => setLocale(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Card>

      <Pending>{t.settings.pending.appearanceMore}</Pending>
    </>
  )
}

/* ---------------- connected apps ---------------- */

function ConnectionsPanel() {
  const t = useI18n()
  const { authKind } = useAccount()
  const sync = useSyncStore()
  const setDriveDialogOpen = useUiStore((s) => s.setDriveDialogOpen)
  const setGithubDialogOpen = useUiStore((s) => s.setGithubDialogOpen)
  const driveConnected = authKind === 'google' && sync.provider === 'google-drive'
  const githubUser = githubProvider.getCachedUser()
  const githubConnected = githubProvider.isConnected()

  return (
    <>
      <Card>
        <Row
          icon={<IcDrive size={14} />}
          name="Google Drive"
          ok={driveConnected}
          state={driveConnected ? t.profile.connected : t.profile.off}
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
            <LinkButton
              label={driveConnected ? t.profile.manage : t.profile.connect}
              onClick={() => setDriveDialogOpen(true)}
            />
          }
        />
        <Row
          icon={<IcGithub size={14} />}
          name="GitHub"
          ok={githubConnected}
          state={githubConnected ? t.profile.connected : t.profile.off}
          detail={
            githubUser ? t.profile.githubDetail(githubUser.login) : t.profile.githubCodeOnly
          }
          action={
            <LinkButton
              label={githubConnected ? t.profile.manage : t.profile.connect}
              onClick={() => setGithubDialogOpen(true)}
            />
          }
        />
      </Card>
      <Pending>{t.settings.pending.connectionsMore}</Pending>
    </>
  )
}

/* ---------------- storage and sync ---------------- */

function StoragePanel() {
  const t = useI18n()
  const timeAgo = useTimeAgo()
  const { authKind } = useAccount()
  const sync = useSyncStore()
  const setDriveDialogOpen = useUiStore((s) => s.setDriveDialogOpen)
  const driveConnected = authKind === 'google' && sync.provider === 'google-drive'

  return (
    <Card title={t.profile.cloudSync}>
      <div className="flex items-center gap-2 rounded-lg bg-panel2 px-2.5 py-2">
        <IcCloud
          size={14}
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
          <div className="text-[10.5px] text-muted">
            {sync.status === 'error' && sync.error
              ? sync.error
              : t.profile.lastSync(timeAgo(sync.lastSyncAt), sync.pendingChanges)}
          </div>
        </div>
        {driveConnected ? (
          <button
            className="icon-btn"
            title={t.profile.syncNow}
            aria-label={t.profile.syncNow}
            onClick={() => void syncEngine.syncNow()}
          >
            <IcRefresh size={13} />
          </button>
        ) : (
          <LinkButton label={t.profile.connect} onClick={() => setDriveDialogOpen(true)} />
        )}
      </div>
      {sync.conflicts.length > 0 && (
        <div className="mt-2 rounded-lg border border-[#ffa629]/40 bg-[#ffa629]/10 px-2.5 py-2 text-[11px] text-muted">
          {t.profile.conflicts(sync.conflicts.length)}
        </div>
      )}
    </Card>
  )
}

/* ---------------- developer ---------------- */

function DeveloperPanel() {
  const t = useI18n()
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen)

  return (
    <>
      <Card title={t.settings.build}>
        {/* the commit is what turns "it's broken on prod" into a diff — the
            version alone only says which build */}
        <code className="text-[11.5px] text-muted">
          v{env.appVersion} · {env.appCommit} · {env.appEnv} · {env.appStage}
        </code>
      </Card>
      <Card>
        <button className="btn" onClick={() => setShortcutsOpen(true)}>
          <IcKeyboard size={13} /> {t.settings.shortcutsOpen}
        </button>
      </Card>
    </>
  )
}

/* ---------------- the map ---------------- */

export function SettingsPanel({ section }: { section: SettingsSection }) {
  const t = useI18n()
  switch (section) {
    case 'account':
      return <AccountPanel />
    case 'appearance':
      return <AppearancePanel />
    case 'connections':
      return <ConnectionsPanel />
    case 'storage':
      return <StoragePanel />
    case 'developer':
      return <DeveloperPanel />
    case 'profile':
      return <Pending>{t.settings.pending.profile}</Pending>
    case 'notifications':
      return <Pending>{t.settings.pending.notifications}</Pending>
    case 'security':
      return <Pending>{t.settings.pending.security}</Pending>
    case 'billing':
      return <Pending>{t.settings.pending.billing}</Pending>
  }
}
