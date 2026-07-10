import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { useCollabStore } from '@/lib/collab/collabStore'
import { focusAreaOnBoard } from './CommentAreas'
import type { AppNotification, NotificationType } from '@/types/collab'
import {
  IcActivity,
  IcAlert,
  IcCheck,
  IcCloudOff,
  IcGithub,
  IcHistory,
  IcMail,
  IcMessage,
  IcUser,
  IcUsers,
  IcX,
} from '@/components/Icons'

/**
 * NotificationCenter (Phase 8) — top-bar bell with unread badge.
 * Clicking a notification deep-links to its target: comment threads
 * focus in the panel (area comments also zoom on the board), documents,
 * sheets and code files open.
 */

const TYPE_ICON: Record<NotificationType, React.ReactNode> = {
  mention: <IcUser size={12} />,
  reply: <IcMessage size={12} />,
  assignment: <IcUsers size={12} />,
  invite: <IcMail size={12} />,
  'comment-resolved': <IcCheck size={12} />,
  'version-restored': <IcHistory size={12} />,
  'drive-failure': <IcCloudOff size={12} />,
  'realtime-failure': <IcAlert size={12} />,
  'github-sync': <IcGithub size={12} />,
  conversion: <IcActivity size={12} />,
}

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function openTarget(n: AppNotification): void {
  const s = useStore.getState()
  const collab = useCollabStore.getState()
  if (n.projectId && s.projects[n.projectId] && s.activeProjectId !== n.projectId) {
    s.setActiveProject(n.projectId)
  }
  const link = n.link
  if (!link) return
  if (link.kind === 'thread' && link.threadId) {
    const thread = collab.comments[n.projectId]?.find((t) => t.id === link.threadId)
    collab.setPanel('comments')
    collab.setFocusedThread(link.threadId)
    if (thread?.area) {
      // let the board mount before asking it to zoom
      setTimeout(() => focusAreaOnBoard(thread), 250)
    } else if (thread) {
      // open the entity the thread hangs on
      if (thread.targetType === 'doc') s.openDoc(thread.targetId)
      else if (thread.targetType === 'code') s.openCode(thread.targetId)
      else if (thread.targetType === 'sheet') s.openSheet(thread.targetId)
    }
    return
  }
  if (link.kind === 'doc') s.openDoc(link.id)
  else if (link.kind === 'code') s.openCode(link.id)
  else if (link.kind === 'sheet') s.openSheet(link.id)
  else if (link.kind === 'board') s.setActiveBoard(link.id)
}

export function NotificationCenter() {
  const notifications = useCollabStore((s) => s.notifications)
  const markRead = useCollabStore((s) => s.markNotificationRead)
  const markAllRead = useCollabStore((s) => s.markAllNotificationsRead)
  const clear = useCollabStore((s) => s.clearNotifications)
  const [open, setOpen] = useState(false)
  const unread = notifications.filter((n) => !n.read).length

  return (
    <div className="relative">
      <button
        className="icon-btn relative"
        aria-label={`Notifications — ${unread} unread`}
        title={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <IcAlertBell />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[8.5px] font-bold text-white"
            aria-hidden
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="Notification center"
            className="absolute right-0 z-50 mt-1.5 flex max-h-[70vh] w-80 flex-col rounded-xl border border-bord bg-panel shadow-xl"
          >
            <div className="flex flex-none items-center gap-2 border-b border-bord px-3 py-2">
              <span className="text-[12px] font-bold">Notifications</span>
              <div className="flex-1" />
              {notifications.length > 0 && (
                <>
                  <button className="text-[10.5px] text-muted hover:text-accent" onClick={markAllRead}>
                    Mark all read
                  </button>
                  <button
                    className="icon-btn h-5 w-5"
                    title="Clear all"
                    aria-label="Clear all notifications"
                    onClick={clear}
                  >
                    <IcX size={10} />
                  </button>
                </>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {notifications.length === 0 && (
                <p className="px-3 py-6 text-center text-[11.5px] text-muted">
                  Nothing yet. Mentions, replies, assignments, invites and sync
                  problems land here.
                </p>
              )}
              {notifications.map((n) => (
                <button
                  key={n.id}
                  className={`mb-1 flex w-full cursor-pointer gap-2 rounded-lg border p-2 text-left ${
                    n.read ? 'border-transparent opacity-70' : 'border-bord bg-panel2/50'
                  } hover:bg-panel2`}
                  onClick={() => {
                    markRead(n.id)
                    openTarget(n)
                    setOpen(false)
                  }}
                >
                  <span className="mt-0.5 flex-none text-muted">{TYPE_ICON[n.type]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold">
                      {n.title}
                    </span>
                    <span className="block truncate text-[11px] text-muted">{n.body}</span>
                  </span>
                  <span className="flex-none text-[9.5px] text-muted">
                    {timeAgo(n.createdAt)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** bell glyph (kept local — it is only used here) */
function IcAlertBell() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  )
}
