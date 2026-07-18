import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { useCollabStore } from '@/lib/collab/collabStore'
import { membersService } from '@/lib/collab/MembersService'
import { inviteService } from '@/lib/collab/InviteService'
import { collabHub } from '@/lib/collab/hub'
import { useMyRole } from '@/lib/collab/useCollab'
import { useCollabMode } from '@/lib/collab/collabPresentation'
import { assignableRoles, can, canManageRole } from '@/lib/collab/permissions'
import { currentIdentity, colorForUser } from '@/lib/collab/CollaborationProvider'
import { useI18n, useTimeAgo } from '@/lib/i18n'
import { type CollabRole, type ProjectInvite, type ProjectMember } from '@/types/collab'
import { toast } from '@/components/ui/Toaster'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import {
  IcCheck,
  IcCopy,
  IcEye,
  IcInfo,
  IcMail,
  IcRefresh,
  IcTrash,
  IcUserPlus,
  IcUsers,
  IcX,
} from '@/components/Icons'

/**
 * ShareDialog — members, invitations and collaboration settings for the
 * active project. Opened from the top bar "Share" button.
 */

function MemberAvatar({ member }: { member: ProjectMember }) {
  return (
    <span
      className="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-full border border-bord bg-panel2 text-[12px] font-bold"
      style={{ color: colorForUser(member.userId) }}
    >
      {member.avatarUrl ? (
        <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        (member.name || member.email).slice(0, 1).toUpperCase()
      )}
    </span>
  )
}

function MemberRow({ member, projectId }: { member: ProjectMember; projectId: string }) {
  const myRole = useMyRole()
  const identity = currentIdentity()
  const t = useI18n()
  const timeAgo = useTimeAgo()
  const isSelf = member.userId === identity.userId
  const manageable = !isSelf && canManageRole(myRole, member.role)
  const displayName = member.name || member.email

  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-panel2/50">
      <MemberAvatar member={member} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[12.5px] font-medium">
          <span className="truncate">{displayName}</span>
          {isSelf && <span className="text-[10px] text-muted">{t.share.you}</span>}
        </div>
        <div className="truncate text-[11px] text-muted">
          {member.email}
          {member.lastActiveAt ? ` · ${t.share.activeAgo(timeAgo(member.lastActiveAt))}` : ''}
        </div>
      </div>
      {member.role === 'owner' || !manageable ? (
        <span className="rounded-full border border-bord px-2 py-0.5 text-[10.5px] font-medium text-muted">
          {t.roles[member.role]}
        </span>
      ) : (
        <select
          className="field h-7 w-28 flex-none cursor-pointer px-1.5 py-0 text-[11.5px]"
          value={member.role}
          aria-label={t.share.roleForAria(displayName)}
          onChange={(e) =>
            membersService.changeRole(projectId, member.userId, e.target.value as CollabRole)
          }
        >
          {assignableRoles(myRole).map((r) => (
            <option key={r} value={r}>
              {t.roles[r]}
            </option>
          ))}
        </select>
      )}
      {manageable && (
        <button
          className="icon-btn h-6 w-6"
          aria-label={t.share.removeAria(displayName)}
          title={t.share.removeFromProject}
          onClick={async () => {
            if (
              await confirmDialog({
                title: t.share.removeTitle(displayName),
                body: t.share.removeBody,
                confirmLabel: t.share.remove,
                danger: true,
              })
            )
              membersService.removeMember(projectId, member.userId)
          }}
        >
          <IcTrash size={12} />
        </button>
      )}
      {myRole === 'owner' && !isSelf && member.role !== 'owner' && (
        <button
          className="icon-btn h-6 w-6"
          title={t.share.transferToMember}
          aria-label={t.share.transferTitleFor(displayName)}
          onClick={async () => {
            if (
              await confirmDialog({
                title: t.share.transferTitle,
                body: t.share.transferBody(displayName),
                confirmLabel: t.share.transfer,
                danger: true,
              })
            )
              membersService.transferOwnership(projectId, member.userId)
          }}
        >
          <IcUsers size={12} />
        </button>
      )}
    </div>
  )
}

function InviteRow({ invite, projectId }: { invite: ProjectInvite; projectId: string }) {
  const t = useI18n()
  const timeAgo = useTimeAgo()
  const copyLink = () => {
    void navigator.clipboard.writeText(inviteService.linkFor(invite))
    toast.success(t.share.copiedTitle, t.share.copiedBody)
  }
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-panel2/50">
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-dashed border-bord text-muted">
        <IcMail size={13} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium">{invite.email}</div>
        <div className="text-[11px] text-muted">
          {t.share.invitedLine(
            t.roles[invite.role],
            timeAgo(invite.createdAt),
            invite.resentAt ? timeAgo(invite.resentAt) : null,
          )}
        </div>
      </div>
      <span className="rounded-full bg-[#ffa629]/15 px-2 py-0.5 text-[10px] font-medium text-[#ffa629]">
        {t.share.pending}
      </span>
      <button className="icon-btn h-6 w-6" title={t.share.copyLink} aria-label={t.share.copyLink} onClick={copyLink}>
        <IcCopy size={12} />
      </button>
      <button
        className="icon-btn h-6 w-6"
        title={t.share.resendTitle}
        aria-label={t.share.resendAria}
        onClick={() => {
          inviteService.resend(projectId, invite.id)
          copyLink()
        }}
      >
        <IcRefresh size={12} />
      </button>
      <button
        className="icon-btn h-6 w-6"
        title={t.share.simulateTitle}
        aria-label={t.share.simulateAria}
        onClick={() => {
          inviteService.acceptAsMock(invite)
          toast.success(t.share.simulateJoined(invite.email))
        }}
      >
        <IcCheck size={12} />
      </button>
      <button
        className="icon-btn h-6 w-6"
        title={t.share.revoke}
        aria-label={t.share.revoke}
        onClick={() => inviteService.revoke(projectId, invite.id)}
      >
        <IcX size={12} />
      </button>
    </div>
  )
}

function SettingsTab() {
  const viewAsRole = useCollabStore((s) => s.viewAsRole)
  const setViewAsRole = useCollabStore((s) => s.setViewAsRole)
  const providers = collabHub.activeProviders()
  const t = useI18n()

  return (
    <div className="max-h-96 overflow-y-auto pr-1">
      <div className="insp-h !mt-1">{t.share.previewAsRole}</div>
      <p className="mb-2 text-[11px] leading-relaxed text-muted">{t.share.previewAsRoleBody}</p>
      <div className="flex flex-wrap gap-1.5">
        {([null, 'admin', 'editor', 'commenter', 'viewer'] as const).map((r) => (
          <button
            key={r ?? 'owner'}
            onClick={() => setViewAsRole(r)}
            className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              viewAsRole === r
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-bord text-muted hover:text-ink'
            }`}
          >
            {r ? t.roles[r] : t.share.ownerMe}
          </button>
        ))}
      </div>

      <div className="insp-h">{t.share.transport}</div>
      <p className="mb-2 text-[11px] leading-relaxed text-muted">{t.share.transportBody}</p>
      {providers.map((p) => (
        <div key={p.id} className="mb-1.5 rounded-lg border border-bord p-2.5">
          <div className="flex items-center gap-2 text-[12px] font-semibold">
            {p.label}
            <span className="rounded-full bg-[#14ae5c]/15 px-1.5 py-0.5 text-[9.5px] font-medium text-[#14ae5c]">
              {t.share.active}
            </span>
          </div>
          {/* Capability sentence is built from provider enum values (scope,
              latency, …) that originate outside these three components — a
              later i18n slice; kept in English for now. */}
          <div className="mt-1 text-[11px] text-muted">
            scope: {p.capabilities.scope} · latency: {p.capabilities.latency} ·{' '}
            {p.capabilities.liveCursors ? 'live cursors' : 'no live cursors'} ·{' '}
            {p.capabilities.documentCRDT && p.capabilities.codeCRDT
              ? 'CRDT docs & code'
              : 'no CRDT merge'}{' '}
            · {p.capabilities.boardRealtime ? 'live board ops' : 'durable state only'} ·{' '}
            {p.capabilities.serverPermissions
              ? 'server-enforced permissions'
              : 'UI-level permissions'}
          </div>
        </div>
      ))}
      {!providers.some((p) => p.id === 'realtime') && (
        <div className="rounded-lg border border-dashed border-bord p-2.5">
          <div className="text-[12px] font-semibold text-muted">{t.share.realtimeNotConfigured}</div>
          <div className="mt-1 text-[11px] leading-relaxed text-muted">
            {t.share.realtimeNotConfiguredBody}
          </div>
        </div>
      )}

      <div className="insp-h">{t.share.publicLinks}</div>
      <div className="rounded-lg border border-dashed border-bord p-2.5 text-[11px] leading-relaxed text-muted">
        {t.share.publicLinksBody}
      </div>

      <div className="insp-h">{t.share.rolesHeading}</div>
      {(Object.keys(t.roles) as CollabRole[]).map((r) => (
        <div key={r} className="mb-1 flex gap-2 text-[11px]">
          <span className="w-20 flex-none font-medium">{t.roles[r]}</span>
          <span className="text-muted">{t.roleDesc[r]}</span>
        </div>
      ))}
    </div>
  )
}

export function ShareDialog() {
  const open = useUiStore((s) => s.shareDialogOpen)
  const setOpen = useUiStore((s) => s.setShareDialogOpen)
  const projectId = useStore((s) => s.activeProjectId)
  const project = useStore((s) => s.projects[s.activeProjectId])
  const members = useCollabStore((s) => s.members[projectId]) ?? []
  const invites = useCollabStore((s) => s.invites[projectId]) ?? []
  const myRole = useMyRole()
  const mode = useCollabMode()
  const t = useI18n()
  const [tab, setTab] = useState<'members' | 'settings'>('members')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<CollabRole>('editor')

  if (!open || !project) return null

  const activeMembers = members.filter((m) => m.status === 'active')
  const pendingInvites = invites.filter((i) => i.status === 'pending')
  const mayInvite = can(myRole, 'members.manage')

  const sendInvite = () => {
    const invite = inviteService.create(projectId, email, role)
    if (!invite) {
      toast.error(t.share.invalidEmail)
      return
    }
    setEmail('')
    void navigator.clipboard.writeText(inviteService.linkFor(invite))
    toast.success(t.share.inviteCreated(invite.email), t.share.inviteCreatedBody)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 pt-[10vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Share project"
    >
      <div className="w-full max-w-lg rounded-xl border border-bord bg-panel p-4 shadow-xl">
        {/* header */}
        <div className="flex items-center gap-2.5">
          <span className="text-lg">{project.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold">{t.share.title(project.name)}</div>
            <div className="text-[11px] text-muted">
              {t.share.subtitle(
                t.roles[myRole].toLowerCase(),
                activeMembers.length,
                pendingInvites.length,
              )}
            </div>
          </div>
          <div className="flex rounded-lg border border-bord bg-panel2 p-0.5">
            {(['members', 'settings'] as const).map((tabKey) => (
              <button
                key={tabKey}
                onClick={() => setTab(tabKey)}
                className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium ${
                  tab === tabKey ? 'bg-panel text-ink shadow-sm' : 'text-muted hover:text-ink'
                }`}
              >
                {tabKey === 'members' ? t.share.tabMembers : t.share.tabSettings}
              </button>
            ))}
          </div>
          <button className="icon-btn" aria-label={t.share.close} onClick={() => setOpen(false)}>
            <IcX size={14} />
          </button>
        </div>

        {/* One honest banner about what "collaborate" means right now — the
            same source of truth the top-bar chip and presence badge use.
            The blurb (mode.description / scopeLabel) still comes from
            collabPresentation and is a later i18n slice. */}
        <div
          className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
            mode.isRealtime
              ? 'border-[#14ae5c]/40 bg-[#14ae5c]/10 text-ink'
              : 'border-bord bg-panel2 text-muted'
          }`}
        >
          {mode.isRealtime ? (
            <IcUsers size={13} className="mt-0.5 flex-none" />
          ) : (
            <IcInfo size={13} className="mt-0.5 flex-none" />
          )}
          <span>
            <span className="font-semibold">
              {mode.isRealtime ? t.share.bannerRealtime : t.share.bannerScope(mode.scopeLabel)}
            </span>{' '}
            — {mode.description}
          </span>
        </div>

        {tab === 'members' ? (
          <>
            {/* invite composer */}
            {mayInvite ? (
              <div className="mt-3 flex gap-2">
                <input
                  className="field flex-1"
                  placeholder={t.share.invitePlaceholder}
                  type="email"
                  value={email}
                  aria-label={t.share.inviteeEmail}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') sendInvite()
                  }}
                />
                <select
                  className="field h-auto w-28 flex-none cursor-pointer text-[12px]"
                  value={role}
                  aria-label={t.share.inviteeRole}
                  onChange={(e) => setRole(e.target.value as CollabRole)}
                >
                  {assignableRoles(myRole).map((r) => (
                    <option key={r} value={r}>
                      {t.roles[r]}
                    </option>
                  ))}
                </select>
                <button className="btn" onClick={sendInvite} disabled={!email.trim()}>
                  <IcUserPlus size={13} /> {t.share.invite}
                </button>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-panel2 px-3 py-2 text-[11.5px] text-muted">
                <IcInfo size={13} /> {t.share.cannotManage}
              </div>
            )}

            {/* members + invites */}
            <div className="mt-2 max-h-80 overflow-y-auto pr-1">
              {activeMembers
                .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.name.localeCompare(b.name)))
                .map((m) => (
                  <MemberRow key={m.userId} member={m} projectId={projectId} />
                ))}
              {pendingInvites.map((i) => (
                <InviteRow key={i.id} invite={i} projectId={projectId} />
              ))}
            </div>

            <div className="mt-2 flex items-start gap-2 rounded-lg bg-panel2 px-3 py-2 text-[10.5px] leading-relaxed text-muted">
              <IcEye size={12} className="mt-0.5 flex-none" />
              <span>{t.share.footerNote}</span>
            </div>
          </>
        ) : (
          <div className="mt-3">
            <SettingsTab />
          </div>
        )}
      </div>
    </div>
  )
}
