import { useCallback, useRef, useState } from 'react'
import { useAccount } from '@/lib/auth/AccountProvider'
import { displayAddress } from '@/lib/auth/addressAlias'
import { useSyncStore } from '@/lib/sync/syncStore'
import { useStore } from '@/store/useStore'
import { useI18n, useTimeAgo } from '@/lib/i18n'
import { env } from '@/lib/env'
import { AnchoredPopover } from '@/components/ui/AnchoredPopover'
import { AdminMark, marksAsAdmin } from '@/components/collab/AdminMark'
import { useMyRole } from '@/lib/collab/useCollab'
import { IcCloud, IcLogOut, IcSettings, IcShield, IcUser } from '@/components/Icons'

/**
 * Avatar button + account dropdown.
 *
 * Since 14.1 this is a way IN, not a second settings surface: identity, the
 * sync line and the route to Settings. The connected services, the sync
 * controls and the language switch live in the Settings sections that own
 * them, so there is exactly one place to change each of them.
 *
 * ## The admin mark, and why it is not always on
 *
 * `admin` is a project role, not an account flag — the same person
 * administers one project and reads another. The mark therefore appears only
 * where there is a project for it to be about: `inProject` is false on the
 * dashboard, where `activeProjectId` still points at whatever was open last
 * and a badge would be a claim about a project nobody is looking at.
 */
export function ProfileMenu({ inProject = true }: { inProject?: boolean }) {
  const { account, authKind, loginSkipped, signIn, signOut, exitGuest } = useAccount()
  const sync = useSyncStore()
  const t = useI18n()
  const timeAgo = useTimeAgo()
  const openSettings = useStore((s) => s.openSettings)
  const myRole = useMyRole()
  const projectName = useStore((s) => s.projects[s.activeProjectId]?.name ?? '')
  const markedRole = inProject ? myRole : undefined
  const markLabel = markedRole
    ? t.share.adminMarkMine(t.roles[markedRole], projectName)
    : ''
  const [open, setOpen] = useState(false)
  const avatar = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])

  if (!account) {
    return (
      <div className="flex flex-none items-center gap-1">
        <button className="btn" onClick={() => void signIn()} title={t.profile.signInTitle}>
          <IcUser size={13} /> {t.profile.signIn}
        </button>
        {/* the way out of "continue without an account" (#257). Until this
            existed the only control here was "Sign in", so a browser that had
            once skipped the login screen never showed it again — and every
            later visitor landed in the same guest vault. */}
        {loginSkipped && (
          <button
            className="icon-btn"
            onClick={exitGuest}
            title={t.profile.exitGuestTitle}
            aria-label={t.profile.exitGuest}
          >
            <IcLogOut size={13} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="relative flex-none">
      <AdminMark role={markedRole} size={28} label={markLabel}>
        <button
          ref={avatar}
          className="flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-bord bg-panel2 hover:border-accent"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
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
      </AdminMark>

      {/* portalled out of the top bar, which clips vertically at 43 px —
          see AnchoredPopover */}
      <AnchoredPopover
        anchorRef={avatar}
        open={open}
        onClose={close}
        role="menu"
        label={t.profile.accountTitle(account.name)}
        className="w-72 overflow-y-auto p-3"
      >
          {/* identity */}
          <div className="flex items-center gap-3 border-b border-bord pb-3">
            <AdminMark role={markedRole} size={40} label={markLabel}>
              <span className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full border border-bord bg-panel2">
                {account.avatarUrl ? (
                  <img src={account.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <IcUser size={18} className="text-muted" />
                )}
              </span>
            </AdminMark>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold">{account.name}</div>
              <div className="truncate text-[11px] text-muted">{displayAddress(account.email)}</div>
              {/* the mark's meaning in words: which role, in which project */}
              {markedRole && marksAsAdmin(markedRole) && (
                <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-accent uppercase">
                  <IcShield size={9} /> {t.roles[markedRole]}
                  {projectName ? ` · ${projectName}` : ''}
                </div>
              )}
              {authKind === 'mock' && (
                <div className="mt-0.5 inline-block rounded bg-panel2 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-[#ffa629] uppercase">
                  {t.profile.localOnlyAccount}
                </div>
              )}
            </div>
          </div>

          {/* Connected services, sync and language moved into Settings in
              14.1 — the menu points at the section that owns each of them
              instead of holding a second copy of the controls. Sync keeps a
              one-line summary here because it is a status, not a setting, and
              it is the reason people opened this menu. */}
          <button
            className="mt-3 flex w-full cursor-pointer items-center gap-2 rounded-md bg-panel2 px-2 py-1.5 text-left hover:bg-panel2/70"
            onClick={() => {
              setOpen(false)
              openSettings('storage')
            }}
          >
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
              <div className="truncate text-[10px] text-muted">
                {sync.status === 'error' && sync.error
                  ? sync.error
                  : t.profile.lastSync(timeAgo(sync.lastSyncAt), sync.pendingChanges)}
              </div>
            </div>
          </button>

          <button
            className="mt-1.5 flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-muted hover:bg-panel2 hover:text-ink"
            onClick={() => {
              setOpen(false)
              openSettings()
            }}
          >
            <IcSettings size={13} /> {t.settings.open}
          </button>

          {/* footer */}
          <div className="mt-3 flex items-center justify-between border-t border-bord pt-2.5">
            {/* the commit is what turns "it's broken on prod" into a
                diff — the version alone only says which build */}
            <span className="text-[10px] text-muted">
              Lattice v{env.appVersion} · {env.appCommit} · {env.appEnv}
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
      </AnchoredPopover>
    </div>
  )
}

