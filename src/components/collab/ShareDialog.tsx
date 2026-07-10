import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { useCollabStore } from '@/lib/collab/collabStore'
import { membersService } from '@/lib/collab/MembersService'
import { inviteService } from '@/lib/collab/InviteService'
import { collabHub } from '@/lib/collab/hub'
import { useMyRole } from '@/lib/collab/useCollab'
import { assignableRoles, can, canManageRole } from '@/lib/collab/permissions'
import { currentIdentity, colorForUser } from '@/lib/collab/CollaborationProvider'
import {
  ROLE_DESCRIPTION,
  ROLE_LABEL,
  type CollabRole,
  type ProjectInvite,
  type ProjectMember,
} from '@/types/collab'
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

function timeAgo(ts: number | undefined): string {
  if (!ts) return 'never'
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

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
  const isSelf = member.userId === identity.userId
  const manageable = !isSelf && canManageRole(myRole, member.role)

  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-panel2/50">
      <MemberAvatar member={member} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[12.5px] font-medium">
          <span className="truncate">{member.name || member.email}</span>
          {isSelf && <span className="text-[10px] text-muted">(you)</span>}
        </div>
        <div className="truncate text-[11px] text-muted">
          {member.email}
          {member.lastActiveAt ? ` · active ${timeAgo(member.lastActiveAt)}` : ''}
        </div>
      </div>
      {member.role === 'owner' || !manageable ? (
        <span className="rounded-full border border-bord px-2 py-0.5 text-[10.5px] font-medium text-muted">
          {ROLE_LABEL[member.role]}
        </span>
      ) : (
        <select
          className="field h-7 w-28 flex-none cursor-pointer px-1.5 py-0 text-[11.5px]"
          value={member.role}
          aria-label={`Role for ${member.name || member.email}`}
          onChange={(e) =>
            membersService.changeRole(projectId, member.userId, e.target.value as CollabRole)
          }
        >
          {assignableRoles(myRole).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      )}
      {manageable && (
        <button
          className="icon-btn h-6 w-6"
          aria-label={`Remove ${member.name || member.email}`}
          title="Remove from project"
          onClick={async () => {
            if (
              await confirmDialog({
                title: `Remove ${member.name || member.email}?`,
                body: 'They lose access to this project. Their comments and activity are kept.',
                confirmLabel: 'Remove',
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
          title="Transfer ownership to this member"
          aria-label={`Transfer ownership to ${member.name || member.email}`}
          onClick={async () => {
            if (
              await confirmDialog({
                title: 'Transfer ownership?',
                body: `${member.name || member.email} becomes the owner; you become an admin. This cannot be undone by you.`,
                confirmLabel: 'Transfer',
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
  const copyLink = () => {
    void navigator.clipboard.writeText(inviteService.linkFor(invite))
    toast.success('Invite link copied', 'Send it to the invitee yourself — Lattice has no email backend.')
  }
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-panel2/50">
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-dashed border-bord text-muted">
        <IcMail size={13} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium">{invite.email}</div>
        <div className="text-[11px] text-muted">
          {ROLE_LABEL[invite.role]} · invited {timeAgo(invite.createdAt)}
          {invite.resentAt ? ` · resent ${timeAgo(invite.resentAt)}` : ''}
        </div>
      </div>
      <span className="rounded-full bg-[#ffa629]/15 px-2 py-0.5 text-[10px] font-medium text-[#ffa629]">
        pending
      </span>
      <button className="icon-btn h-6 w-6" title="Copy invite link" aria-label="Copy invite link" onClick={copyLink}>
        <IcCopy size={12} />
      </button>
      <button
        className="icon-btn h-6 w-6"
        title="Resend (refreshes the invite; copy the link again)"
        aria-label="Resend invite"
        onClick={() => {
          inviteService.resend(projectId, invite.id)
          copyLink()
        }}
      >
        <IcRefresh size={12} />
      </button>
      <button
        className="icon-btn h-6 w-6"
        title="Simulate acceptance (adds a mock member for testing roles)"
        aria-label="Simulate invite acceptance"
        onClick={() => {
          inviteService.acceptAsMock(invite)
          toast.success(`${invite.email} joined (simulated)`)
        }}
      >
        <IcCheck size={12} />
      </button>
      <button
        className="icon-btn h-6 w-6"
        title="Revoke invite"
        aria-label="Revoke invite"
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

  return (
    <div className="max-h-96 overflow-y-auto pr-1">
      <div className="insp-h !mt-1">Preview as role</div>
      <p className="mb-2 text-[11px] leading-relaxed text-muted">
        See the project the way a member with a different role sees it — read-only
        boards, hidden actions, comment-only access. Owner only; affects only you.
      </p>
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
            {r ? ROLE_LABEL[r] : 'Owner (me)'}
          </button>
        ))}
      </div>

      <div className="insp-h">Collaboration transport</div>
      <p className="mb-2 text-[11px] leading-relaxed text-muted">
        Lattice never fakes realtime. What each available transport really delivers:
      </p>
      {providers.map((p) => (
        <div key={p.id} className="mb-1.5 rounded-lg border border-bord p-2.5">
          <div className="flex items-center gap-2 text-[12px] font-semibold">
            {p.label}
            <span className="rounded-full bg-[#14ae5c]/15 px-1.5 py-0.5 text-[9.5px] font-medium text-[#14ae5c]">
              active
            </span>
          </div>
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
          <div className="text-[12px] font-semibold text-muted">
            Cross-device realtime: not configured
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-muted">
            Tabs of this browser already co-edit via CRDT; other devices sync
            through Google Drive. For live cross-device collaboration set
            VITE_REALTIME_BACKEND=liveblocks + LIVEBLOCKS_SECRET_KEY and sign in
            with Google — the status chip in the top bar has the full checklist.
          </div>
        </div>
      )}

      <div className="insp-h">Roles</div>
      {(Object.keys(ROLE_LABEL) as CollabRole[]).map((r) => (
        <div key={r} className="mb-1 flex gap-2 text-[11px]">
          <span className="w-20 flex-none font-medium">{ROLE_LABEL[r]}</span>
          <span className="text-muted">{ROLE_DESCRIPTION[r]}</span>
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
      toast.error('Invalid email address')
      return
    }
    setEmail('')
    void navigator.clipboard.writeText(inviteService.linkFor(invite))
    toast.success(
      `Invite created for ${invite.email}`,
      'Link copied — send it yourself. It works wherever this project’s data is reachable (same browser, or same Drive).',
    )
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
            <div className="text-[14px] font-bold">Share “{project.name}”</div>
            <div className="text-[11px] text-muted">
              You are {ROLE_LABEL[myRole].toLowerCase()} · {activeMembers.length} member
              {activeMembers.length !== 1 ? 's' : ''}
              {pendingInvites.length ? ` · ${pendingInvites.length} pending` : ''}
            </div>
          </div>
          <div className="flex rounded-lg border border-bord bg-panel2 p-0.5">
            {(['members', 'settings'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium capitalize ${
                  tab === t ? 'bg-panel text-ink shadow-sm' : 'text-muted hover:text-ink'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <button className="icon-btn" aria-label="Close share dialog" onClick={() => setOpen(false)}>
            <IcX size={14} />
          </button>
        </div>

        {tab === 'members' ? (
          <>
            {/* invite composer */}
            {mayInvite ? (
              <div className="mt-3 flex gap-2">
                <input
                  className="field flex-1"
                  placeholder="Invite by email…"
                  type="email"
                  value={email}
                  aria-label="Invitee email"
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') sendInvite()
                  }}
                />
                <select
                  className="field h-auto w-28 flex-none cursor-pointer text-[12px]"
                  value={role}
                  aria-label="Role for the invitee"
                  onChange={(e) => setRole(e.target.value as CollabRole)}
                >
                  {assignableRoles(myRole).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
                <button className="btn" onClick={sendInvite} disabled={!email.trim()}>
                  <IcUserPlus size={13} /> Invite
                </button>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-panel2 px-3 py-2 text-[11.5px] text-muted">
                <IcInfo size={13} /> Your role can’t manage members.
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
              <span>
                Live presence works across tabs of this browser today; across devices,
                membership/comments sync through Google Drive when connected. “Simulate
                acceptance” (✓) creates a mock member so you can test roles offline.
              </span>
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
