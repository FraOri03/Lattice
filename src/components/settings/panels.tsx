import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAccount } from '@/lib/auth/AccountProvider'
import { authService } from '@/lib/auth/AuthService'
import {
  deriveConnections,
  type ServiceAction,
  type ServiceId,
} from '@/lib/settings/connections'
import { initialsOf, MAX_DISPLAY_NAME } from '@/lib/auth/profile'
import { displayAddress } from '@/lib/auth/addressAlias'
import { AvatarError, avatarDataUrlFrom } from '@/lib/auth/avatar'
import { announce } from '@/lib/a11y/announcer'
import { useSyncStore } from '@/lib/sync/syncStore'
import { syncEngine } from '@/lib/sync/SyncEngine'
import { githubProvider } from '@/lib/github/GithubCodeProvider'
import { useCollabStore } from '@/lib/collab/collabStore'
import { NOTIFICATION_EVENTS } from '@/lib/collab/notificationPrefs'
import {
  foreignGrants,
  grantAddresses,
  revokeForeignAccess,
} from '@/lib/collab/revokeSharing'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { useI18n, useLocale, useTimeAgo } from '@/lib/i18n'
import { forgetThisDevice } from '@/lib/storage/forgetDevice'
import { hasAnyByokKey } from '@/lib/ai/byok'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { toast } from '@/components/ui/Toaster'
import { setThemeAnimated } from '@/lib/theme/animateTheme'
import { resolveTheme } from '@/lib/theme/appearance'
import type {
  ContrastPreference,
  DensityPreference,
  MotionPreference,
  ThemePreference,
  UiScalePreference,
} from '@/lib/theme/appearance'
import {
  env,
  hasAiBackend,
  hasConversionBackend,
  hasGoogleAuth,
  hasMediaCalls,
  hasRealtimeBackend,
} from '@/lib/env'
import type { Account, AuthProviderId, Locale, UsageType } from '@/types/model'
import type { SettingsSection } from '@/lib/settings/sections'
import {
  IcCheck,
  IcCloud,
  IcDrive,
  IcGithub,
  IcKeyboard,
  IcLock,
  IcLogOut,
  IcMic,
  IcRefresh,
  IcSparkles,
  IcTrash,
  IcUpload,
  IcUser,
  IcUsers,
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
    email: t.settings.account.methodEmail,
  }

  return (
    <>
      <Card>
        <div className="flex items-center gap-3">
          <Avatar account={account} size={44} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold">{account.name}</div>
            <div className="truncate text-[11.5px] text-muted">{displayAddress(account.email)}</div>
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
          value={displayAddress(account.email) || '—'}
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

/**
 * The AI row's keys and consent records.
 *
 * Lazy for the same reason the AI panel is: the settings screen is mounted
 * on every page load, and five other connection rows do not need the AI
 * seam's strings, cost tables and job model in order to render.
 */
const AiConnectionDetails = lazy(() => import('@/components/ai/AiConnectionDetails'))

const SERVICE_ICON: Record<ServiceId, typeof IcDrive> = {
  drive: IcDrive,
  github: IcGithub,
  realtime: IcUsers,
  livekit: IcMic,
  conversion: IcRefresh,
  ai: IcSparkles,
}

/**
 * The three answers the interface has been collapsing into one. Signed in with
 * Google says who you are; a connected folder says where files may go; a
 * running sync says whether they are going there now. Three rows, because a
 * single "connected" badge has been answering for all three.
 */
function IdentityFacts() {
  const t = useI18n()
  const c = t.settings.connections
  const timeAgo = useTimeAgo()
  const { account, authKind } = useAccount()
  const sync = useSyncStore()
  const driveConnected = authKind === 'google' && sync.provider === 'google-drive'

  const facts: { key: string; label: string; value: string; ok: boolean }[] = [
    {
      key: 'identity',
      label: c.identity,
      value: !account
        ? c.identityNone
        : authKind === 'google'
          ? c.identityGoogle(displayAddress(account.email))
          : c.identityLocal,
      ok: !!account,
    },
    {
      key: 'storage',
      label: c.storage,
      value: driveConnected ? c.storageDrive(env.driveAppFolder) : c.storageLocal,
      ok: driveConnected,
    },
    {
      key: 'sync',
      label: c.sync,
      value: !driveConnected
        ? c.syncOff
        : sync.status === 'error'
          ? (sync.error ?? t.profile.status.error)
          : t.profile.lastSync(timeAgo(sync.lastSyncAt), sync.pendingChanges),
      ok: driveConnected && sync.status !== 'error',
    },
  ]

  return (
    <Card title={c.factsTitle} body={c.factsBody}>
      {facts.map((f) => (
        <div key={f.key} className="flex flex-wrap items-baseline gap-x-3 border-b border-bord py-2 last:border-b-0">
          <span className="w-20 flex-none text-[11px] text-muted">{f.label}</span>
          <span className="min-w-0 flex-1 text-[12.5px]">{f.value}</span>
          <span
            className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              f.ok ? 'bg-[#14ae5c]/15 text-[#14ae5c]' : 'bg-panel2 text-muted'
            }`}
          >
            {f.ok ? <IcCheck size={9} /> : <IcX size={9} />}
            {f.ok ? c.on : c.offLabel}
          </span>
        </div>
      ))}
    </Card>
  )
}

function ConnectionsPanel() {
  const t = useI18n()
  const c = t.settings.connections
  const { account, authKind } = useAccount()
  const sync = useSyncStore()
  const setDriveDialogOpen = useUiStore((s) => s.setDriveDialogOpen)
  const setGithubDialogOpen = useUiStore((s) => s.setGithubDialogOpen)
  const [, force] = useState(0)
  const driveConnected = authKind === 'google' && sync.provider === 'google-drive'
  const githubUser = githubProvider.getCachedUser()

  const services = deriveConnections({
    googleSignedIn: !!account && account.providers.includes('google'),
    driveConnected,
    githubConnected: githubProvider.isConnected(),
    hasGoogleAuth,
    hasRealtimeBackend,
    hasMediaCalls,
    hasConversionBackend,
    hasAiBackend,
    // the user's own key is a different answer from the build's backend, and
    // the row shows a different state for it
    hasAiKey: hasAnyByokKey(),
  })

  const act = (id: ServiceId, action: ServiceAction) => {
    if (id === 'drive') {
      // disconnecting revokes the Google token as well as dropping it, which
      // is the only revocation this build can actually perform
      if (action === 'disconnect') void authService.disconnectDrive().then(() => force((n) => n + 1))
      else setDriveDialogOpen(true)
      return
    }
    if (id === 'github') {
      if (action === 'disconnect') {
        githubProvider.disconnect()
        force((n) => n + 1)
      } else setGithubDialogOpen(true)
    }
  }

  return (
    <>
      <IdentityFacts />

      <Card title={c.servicesTitle}>
        {services.map((s) => {
          const Icon = SERVICE_ICON[s.id]
          const connected = s.state === 'connected'
          return (
            <div key={s.id} className="border-b border-bord py-2.5 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted">
                  <Icon size={14} />
                </span>
                <span className="text-[12.5px] font-medium">{c.services[s.id]}</span>
                <span
                  className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    connected ? 'bg-[#14ae5c]/15 text-[#14ae5c]' : 'bg-panel2 text-muted'
                  }`}
                >
                  {connected ? <IcCheck size={9} /> : <IcX size={9} />}
                  {c.states[s.state]}
                </span>
                <span className="flex-1" />
                {s.action !== 'none' && (
                  <LinkButton
                    label={s.action === 'disconnect' ? c.disconnect : c.connect}
                    onClick={() => act(s.id, s.action)}
                  />
                )}
              </div>
              {/* what it gets is the part a connection screen usually leaves out */}
              <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
                {c.gets[s.id]}
                {s.id === 'github' && githubUser ? ` — ${githubUser.login}` : ''}
              </p>
              {s.state === 'unconfigured' && s.configuredBy && (
                <p className="mt-1 text-[10.5px] text-muted">
                  {c.configuredBy(s.configuredBy)}
                </p>
              )}
              {s.state === 'blocked' && (
                <p className="mt-1 text-[10.5px] text-muted">{c.blocked}</p>
              )}
              {s.id === 'ai' && (
                <Suspense fallback={null}>
                  <AiConnectionDetails />
                </Suspense>
              )}
            </div>
          )
        })}
      </Card>
    </>
  )
}

/* ---------------- security ---------------- */

/**
 * Everyone who holds access to something in this vault, and the one control
 * that takes it back in bulk.
 *
 * It lists before it revokes, because "who can reach my projects" is a
 * question the Share dialog can only answer one project at a time — and the
 * vaults that need this are precisely the ones with grants in projects the
 * user has not opened in months. The addresses are shown; the button is the
 * second half of the same card, not a separate leap of faith.
 */
function SharingCard({ account }: { account: Account | null }) {
  const t = useI18n()
  const sec = t.settings.security
  // named as dependencies rather than passed: `foreignGrants` reads the store
  // itself (it also walks records for projects the vault no longer holds), so
  // these two are what makes the count re-derive when membership changes
  const members = useCollabStore((s) => s.members)
  const invites = useCollabStore((s) => s.invites)
  const [running, setRunning] = useState(false)
  const keepEmail = account?.email.trim().toLowerCase() ?? ''

  const grants = useMemo(
    () => (keepEmail ? foreignGrants(keepEmail) : []),
    [keepEmail, members, invites],
  )
  const addresses = grantAddresses(grants)
  const projects = new Set(grants.map((g) => g.projectId)).size

  const run = async () => {
    const ok = await confirmDialog({
      title: sec.sharingConfirmTitle,
      body: sec.sharingConfirmBody(addresses.map(displayAddress).join(', ')),
      confirmLabel: sec.sharingConfirm,
      danger: true,
    })
    if (!ok) return
    setRunning(true)
    try {
      const report = await revokeForeignAccess(keepEmail)
      const headline = sec.sharingDone(report.members, report.invites, report.projects)
      const detail = [
        report.reclaimed.length ? sec.sharingReclaimed(report.reclaimed.length) : '',
        report.refused.length ? sec.sharingRefused(report.refused.length) : '',
      ]
        .filter(Boolean)
        .join(' ')
      // a server that refused is not a success, however much went through
      if (report.refused.length) toast.warning(headline, detail)
      else toast.success(headline, detail || undefined)
      announce(headline)
    } catch (err) {
      toast.error(sec.sharingTitle, err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card title={sec.sharingTitle} body={sec.sharingBody}>
      <div className="flex flex-col gap-3">
        <span className="text-[12px]">
          {keepEmail ? sec.sharingKept(displayAddress(keepEmail)) : sec.sharingUnavailable}
        </span>
        {keepEmail &&
          (addresses.length ? (
            <>
              <span className="text-[11.5px] text-muted">
                {sec.sharingFound(addresses.length, projects)}
              </span>
              <ul className="flex flex-wrap gap-1.5">
                {addresses.map((address) => (
                  <li
                    key={address}
                    className="rounded-full border border-bord bg-panel2 px-2 py-0.5 text-[11px]"
                  >
                    {displayAddress(address)}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <span className="text-[11.5px] text-muted">{sec.sharingNone}</span>
          ))}
        <div>
          <button
            className="btn"
            disabled={!keepEmail || !grants.length || running}
            title={keepEmail ? undefined : sec.sharingUnavailable}
            onClick={() => void run()}
          >
            <IcUsers size={12} /> {sec.sharingRevoke}
          </button>
        </div>
      </div>
    </Card>
  )
}

function SecurityPanel() {
  const t = useI18n()
  const sec = t.settings.security
  const { account, authKind, loginSkipped, signOut, exitGuest } = useAccount()
  const sync = useSyncStore()
  const [forgetting, setForgetting] = useState(false)
  const driveConnected = authKind === 'google' && sync.provider === 'google-drive'

  /**
   * The delete that had never existed (#257): scoping stopped one account
   * READING another's vault and left every byte of it on the machine.
   *
   * Signing out first is not politeness. The wipe closes the IndexedDB
   * connections it is about to delete, and a sync engine still running would
   * reopen them — and then push an empty vault at a Drive that is not empty.
   */
  const forget = async () => {
    const ok = await confirmDialog({
      title: sec.forgetConfirmTitle,
      body: sec.forgetConfirmBody,
      confirmLabel: sec.forgetConfirm,
      danger: true,
    })
    if (!ok) return
    setForgetting(true)
    try {
      syncEngine.stop()
      const result = await forgetThisDevice()
      if (result.blocked.length) {
        // the only outcome with a reader still on the page to tell
        toast.warning(sec.forgetTitle, sec.forgetBlocked(result.blocked.length))
        setForgetting(false)
        return
      }
      /**
       * End the session as well, whichever kind it is. Forgetting the device
       * means the machine stops remembering this person, and a signed-in shell
       * over a vault that no longer exists is neither state.
       *
       * No success toast: everything in memory belongs to the deleted vault and
       * the scope resolves once per page load (`vaultScope`), so this reloads —
       * which would take the message with it. The login screen is the evidence.
       */
      if (account) {
        await authService.signOut()
        window.location.reload()
      } else {
        exitGuest() // clears the guest flag, then reloads for the same reason
      }
    } catch (err) {
      setForgetting(false)
      toast.error(sec.forgetTitle, err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <Card title={sec.sessionTitle} body={sec.sessionBody}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 text-[12px]">
            {account
              ? authKind === 'google'
                ? sec.signedInGoogle(displayAddress(account.email))
                : sec.signedInLocal
              : sec.signedOut}
          </span>
          {account && (
            <button className="btn" onClick={() => void signOut()}>
              <IcLogOut size={12} /> {t.profile.signOut}
            </button>
          )}
        </div>
      </Card>

      {/* guest mode used to have no exit at all: one click of "Continue
          without an account" and the login screen never came back (#257) */}
      {!account && loginSkipped && (
        <Card title={sec.guestTitle} body={sec.guestBody}>
          <button className="btn" onClick={exitGuest}>
            <IcLogOut size={12} /> {sec.exitGuest}
          </button>
        </Card>
      )}

      {/* the one revocation this build can really perform */}
      <Card title={sec.revokeTitle} body={sec.revokeBody}>
        <button
          className="btn"
          disabled={!driveConnected}
          title={driveConnected ? undefined : sec.revokeUnavailable}
          onClick={() => void authService.disconnectDrive()}
        >
          <IcLock size={12} /> {sec.revoke}
        </button>
      </Card>

      <SharingCard account={account} />

      <Card title={sec.forgetTitle} body={sec.forgetBody}>
        <button className="btn" disabled={forgetting} onClick={() => void forget()}>
          <IcTrash size={12} /> {sec.forget}
        </button>
      </Card>

      <Card title={sec.protectionTitle}>
        <ul className="flex flex-col gap-2 text-[11.5px] leading-relaxed text-muted">
          <li>{sec.protectionVault}</li>
          <li>{sec.protectionDrive}</li>
          <li>{sec.protectionServer}</li>
        </ul>
      </Card>

      <Pending>{t.settings.pending.security}</Pending>
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

/* ---------------- notifications ---------------- */

/**
 * A switch. `role="switch"` rather than a checkbox because that is what it is
 * — on or off, applied immediately, with no form to submit.
 */
function Toggle({
  on,
  label,
  disabled,
  title,
  onToggle,
}: {
  on: boolean
  label: string
  disabled?: boolean
  title?: string
  onToggle: () => void
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-6 w-10 flex-none rounded-full border transition-colors ${
        disabled
          ? 'cursor-not-allowed border-bord bg-panel2 opacity-50'
          : on
            ? 'cursor-pointer border-accent bg-accent'
            : 'cursor-pointer border-bord bg-panel2'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-panel transition-[left] ${
          on ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}

function NotificationsPanel() {
  const t = useI18n()
  const n = t.settings.notifications
  const prefs = useCollabStore((s) => s.notificationPrefs)
  const setPref = useCollabStore((s) => s.setNotificationPref)

  return (
    <>
      <Card body={n.intro}>
        <div className="mt-1">
          {/* the channel header, so a row of two switches is readable */}
          <div className="flex items-center gap-3 border-b border-bord pb-1.5">
            <span className="min-w-0 flex-1 text-[10px] font-semibold tracking-widest text-muted uppercase">
              {n.event}
            </span>
            <span className="w-10 flex-none text-center text-[10px] font-semibold tracking-widest text-muted uppercase">
              {n.inApp}
            </span>
            <span className="w-10 flex-none text-center text-[10px] font-semibold tracking-widest text-muted uppercase">
              {n.email}
            </span>
          </div>

          {NOTIFICATION_EVENTS.map((event) => (
            <div key={event} className="flex items-center gap-3 border-b border-bord py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px]">{n.events[event]}</span>
                <span className="block text-[10.5px] text-muted">{n.eventHints[event]}</span>
              </span>
              <Toggle
                on={prefs.inApp[event]}
                label={`${n.events[event]} — ${n.inApp}`}
                onToggle={() => setPref('inApp', event, !prefs.inApp[event])}
              />
              {/* e-mail is a preference before it is a route: phase 18 gives it
                  somewhere to go, and until then the switch says so instead of
                  storing a consent against an unverified address */}
              <Toggle
                on={prefs.email[event]}
                label={`${n.events[event]} — ${n.email}`}
                disabled
                title={n.emailDisabled}
                onToggle={() => {}}
              />
            </div>
          ))}
        </div>
      </Card>

      <Pending>{n.emailDisabled}</Pending>
      <Pending>{n.noProducer}</Pending>
    </>
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
      return <NotificationsPanel />
    case 'security':
      return <SecurityPanel />
    case 'billing':
      return <Pending>{t.settings.pending.billing}</Pending>
  }
}
