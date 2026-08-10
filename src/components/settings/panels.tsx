import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAccount } from '@/lib/auth/AccountProvider'
import { initialsOf, MAX_DISPLAY_NAME } from '@/lib/auth/profile'
import { AvatarError, avatarDataUrlFrom } from '@/lib/auth/avatar'
import { announce } from '@/lib/a11y/announcer'
import { useSyncStore } from '@/lib/sync/syncStore'
import { syncEngine } from '@/lib/sync/SyncEngine'
import { githubProvider } from '@/lib/github/GithubCodeProvider'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { useI18n, useLocale, useTimeAgo } from '@/lib/i18n'
import { setThemeAnimated } from '@/lib/theme/animateTheme'
import { resolveTheme } from '@/lib/theme/appearance'
import type {
  ContrastPreference,
  DensityPreference,
  MotionPreference,
  ThemePreference,
  UiScalePreference,
} from '@/lib/theme/appearance'
import { env } from '@/lib/env'
import type { Account, AuthProviderId, Locale, UsageType } from '@/types/model'
import type { SettingsSection } from '@/lib/settings/sections'
import {
  IcCheck,
  IcCloud,
  IcDrive,
  IcGithub,
  IcKeyboard,
  IcLogOut,
  IcRefresh,
  IcUpload,
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

/**
 * A row of mutually exclusive options. One component so every preference in
 * this screen looks and announces the same way — `aria-pressed` carries the
 * state, and the label is never colour alone.
 */
function Choice<T extends string>({
  value,
  options,
  onPick,
}: {
  value: T | undefined
  options: { value: T; label: string }[]
  onPick: (value: T, event: React.MouseEvent) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          aria-pressed={value === o.value}
          className={`min-h-8 flex-1 cursor-pointer rounded-lg border px-3 py-1.5 text-[12px] font-medium whitespace-nowrap ${
            value === o.value
              ? 'border-accent bg-panel2 text-ink'
              : 'border-bord text-muted hover:text-ink'
          }`}
          onClick={(e) => onPick(o.value, e)}
        >
          {o.label}
        </button>
      ))}
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

/** Avatar with the initials fallback every surface should agree on. */
function Avatar({ account, size }: { account: Account; size: number }) {
  return (
    <span
      className="flex flex-none items-center justify-center overflow-hidden rounded-full border border-bord bg-panel2 font-semibold text-muted"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {account.avatarUrl ? (
        <img src={account.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initialsOf(account.name)
      )}
    </span>
  )
}

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-b border-bord py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-[11px] text-muted">{label}</span>
        <span className="min-w-0 flex-1 text-[12.5px] break-words">{value}</span>
      </div>
      {hint && <p className="mt-1 text-[10.5px] text-muted">{hint}</p>}
    </div>
  )
}

function AccountPanel() {
  const t = useI18n()
  const timeAgo = useTimeAgo()
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

  const METHOD: Record<AuthProviderId, string> = {
    google: t.settings.account.methodGoogle,
    github: t.settings.account.methodGithub,
    mock: t.settings.account.methodLocal,
  }

  return (
    <>
      <Card>
        <div className="flex items-center gap-3">
          <Avatar account={account} size={44} />
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

      <Card>
        <Field
          label={t.settings.account.emailLabel}
          value={account.email || '—'}
          hint={
            authKind === 'google'
              ? t.settings.account.emailFromGoogle
              : t.settings.account.emailLocal
          }
        />
        <Field
          label={t.settings.account.methods}
          value={account.providers.map((p) => METHOD[p]).join(' · ')}
        />
        <Field
          label={t.settings.account.idLabel}
          value={account.id}
          hint={t.settings.account.idHint}
        />
        <Field label={t.settings.account.created} value={timeAgo(account.createdAt)} />
      </Card>

      <Pending>{t.settings.pending.accountMore}</Pending>
    </>
  )
}

function ProfilePanel() {
  const t = useI18n()
  const { account, updateProfile } = useAccount()
  const openSettings = useStore((s) => s.openSettings)
  const fileRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(account?.name ?? '')
  const [error, setError] = useState<string | null>(null)

  // the field follows the account when it changes elsewhere (a fresh sign-in,
  // another tab) but never fights the user mid-edit
  useEffect(() => setDraft(account?.name ?? ''), [account?.name])

  if (!account) {
    return <Pending>{t.settings.pending.profileSignedOut}</Pending>
  }

  const providerName = account.providerProfile?.name
  const commitName = () => {
    if (draft === account.name) return
    updateProfile({ name: draft })
    announce(t.settings.profile.saved)
  }

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      updateProfile({ avatarUrl: await avatarDataUrlFrom(file) })
      announce(t.settings.profile.saved)
    } catch (err) {
      const reason = err instanceof AvatarError ? err.message : 'undecodable'
      setError(
        t.settings.profile.avatarError[reason as keyof typeof t.settings.profile.avatarError] ??
          t.settings.profile.avatarError.undecodable,
      )
    }
  }

  const usageOptions: { value: UsageType; label: string }[] = [
    { value: 'personal', label: t.settings.profile.usagePersonal },
    { value: 'work', label: t.settings.profile.usageWork },
    { value: 'education', label: t.settings.profile.usageEducation },
  ]

  return (
    <>
      <Card title={t.settings.profile.avatar} body={t.settings.profile.avatarHint}>
        <div className="flex flex-wrap items-center gap-3">
          <Avatar account={account} size={56} />
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <IcUpload size={12} /> {t.settings.profile.upload}
          </button>
          {account.avatarOverridden && (
            <button className="btn" onClick={() => updateProfile({ avatarUrl: null })}>
              {t.settings.profile.remove}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void pickAvatar(e.target.files?.[0])
              e.target.value = '' // picking the same file twice must still fire
            }}
          />
        </div>
        {error && <p className="mt-2 text-[11px] text-[#f24822]">{error}</p>}
      </Card>

      <Card title={t.settings.profile.displayName} body={t.settings.profile.displayNameHint}>
        <input
          className="field w-full"
          value={draft}
          maxLength={MAX_DISPLAY_NAME}
          aria-label={t.settings.profile.displayName}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setDraft(account.name)
          }}
        />
        {account.nameOverridden && providerName && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px] text-muted">
            {t.settings.profile.providerSays(providerName)}
            <LinkButton
              label={t.settings.profile.reset}
              onClick={() => {
                updateProfile({ name: '' })
                announce(t.settings.profile.saved)
              }}
            />
          </p>
        )}
      </Card>

      <Card title={t.settings.profile.usage} body={t.settings.profile.usageHint}>
        <Choice<UsageType>
          value={account.usageType}
          onPick={(usageType) => updateProfile({ usageType })}
          options={usageOptions}
        />
      </Card>

      <Card body={t.settings.profile.languageAt}>
        <LinkButton
          label={t.settings.profile.goAppearance}
          onClick={() => openSettings('appearance')}
        />
      </Card>
    </>
  )
}

/* ---------------- appearance ---------------- */

function AppearancePanel() {
  const t = useI18n()
  const a = t.settings.appearance
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const appearance = useStore((s) => s.appearance)
  const setAppearance = useStore((s) => s.setAppearance)
  const locale = useLocale()
  const setLocale = useStore((s) => s.setLocale)

  /**
   * A theme choice is two things: the preference, and the paint. Both run
   * through the reveal — including "System", which resolves the OS answer
   * here so following the system still looks like a decision, not a flicker.
   */
  const pickTheme = (value: ThemePreference, e: React.MouseEvent) => {
    const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
    const next = resolveTheme(value, systemDark)
    if (next !== theme) {
      setThemeAnimated(next, setTheme, { x: e.clientX, y: e.clientY })
    }
    setAppearance({ theme: value })
  }

  return (
    <>
      <Card title={t.settings.theme} body={a.themeHint}>
        <Choice<ThemePreference>
          value={appearance.theme}
          onPick={pickTheme}
          options={[
            { value: 'system', label: a.system },
            { value: 'light', label: t.settings.themeLight },
            { value: 'dark', label: t.settings.themeDark },
          ]}
        />
      </Card>

      <Card title={a.contrast} body={a.contrastHint}>
        <Choice<ContrastPreference>
          value={appearance.contrast}
          onPick={(contrast) => setAppearance({ contrast })}
          options={[
            { value: 'normal', label: a.contrastNormal },
            { value: 'high', label: a.contrastHigh },
          ]}
        />
      </Card>

      <Card title={a.density} body={a.densityHint}>
        <Choice<DensityPreference>
          value={appearance.density}
          onPick={(density) => setAppearance({ density })}
          options={[
            { value: 'comfortable', label: a.densityComfortable },
            { value: 'compact', label: a.densityCompact },
          ]}
        />
      </Card>

      <Card title={a.size} body={a.sizeHint}>
        <Choice<UiScalePreference>
          value={appearance.uiScale}
          onPick={(uiScale) => setAppearance({ uiScale })}
          options={[
            { value: 'small', label: a.sizeSmall },
            { value: 'default', label: a.sizeDefault },
            { value: 'large', label: a.sizeLarge },
          ]}
        />
      </Card>

      <Card title={a.motion} body={a.motionHint}>
        <Choice<MotionPreference>
          value={appearance.motion}
          onPick={(motion) => setAppearance({ motion })}
          options={[
            { value: 'system', label: a.system },
            { value: 'reduce', label: a.motionReduce },
          ]}
        />
      </Card>

      <Card title={t.profile.language}>
        <Choice<Locale>
          value={locale}
          onPick={(value) => setLocale(value)}
          options={[
            { value: 'en', label: t.profile.english },
            { value: 'it', label: t.profile.italian },
          ]}
        />
      </Card>
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
      return <ProfilePanel />
    case 'notifications':
      return <Pending>{t.settings.pending.notifications}</Pending>
    case 'security':
      return <Pending>{t.settings.pending.security}</Pending>
    case 'billing':
      return <Pending>{t.settings.pending.billing}</Pending>
  }
}
