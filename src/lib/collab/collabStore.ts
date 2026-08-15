import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ActivityEvent,
  AppNotification,
  CollabRole,
  CommentThread,
  FileLock,
  PresencePeer,
  ProjectInvite,
  ProjectMember,
  VersionEntry,
} from '@/types/collab'
import { LOCK_TTL_MS } from '@/types/collab'
import {
  DEFAULT_NOTIFICATION_PREFS,
  withPref,
  type NotificationChannel,
  type NotificationEvent,
  type NotificationPrefs,
} from './notificationPrefs'

/**
 * Collaboration store (Phase 7).
 *
 * Persisted (localStorage, synced across devices by the collaboration
 * provider): members, invites, comments, activity, version index.
 * Ephemeral (never persisted): presence peers, file locks, panel UI state.
 *
 * All records are keyed by project id. Writes go through the services in
 * src/lib/collab/ — components should not mutate this store directly.
 */

export type CollabPanel = 'comments' | 'activity' | 'versions' | null

interface CollabState {
  /* persisted, per project */
  members: Record<string, ProjectMember[]>
  invites: Record<string, ProjectInvite[]>
  comments: Record<string, CommentThread[]>
  activity: Record<string, ActivityEvent[]>
  versions: Record<string, VersionEntry[]>

  /* persisted, per device (never synced — read state is personal) */
  notifications: AppNotification[]
  /**
   * Which events may reach you, and on which channel (14.4). Personal like
   * read state, so it stays beside it rather than travelling with the project.
   */
  notificationPrefs: NotificationPrefs

  /* ephemeral */
  peers: Record<string, PresencePeer> // sessionId → peer
  locks: Record<string, FileLock> // fileId → lock
  /** role preview — lets the owner test what other roles see */
  viewAsRole: CollabRole | null
  panel: CollabPanel
  commentFilter: 'open' | 'resolved' | 'all'
  /** thread highlighted in the comments panel (e.g. after clicking a pin) */
  focusedThreadId: string | null
  /** board comment-placement mode (click canvas to drop a pin) */
  commentMode: boolean

  pushNotification: (n: AppNotification) => void
  setNotificationPref: (
    channel: NotificationChannel,
    event: NotificationEvent,
    on: boolean,
  ) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  clearNotifications: () => void

  setMembers: (projectId: string, members: ProjectMember[]) => void
  setInvites: (projectId: string, invites: ProjectInvite[]) => void
  setComments: (projectId: string, comments: CommentThread[]) => void
  setActivity: (projectId: string, events: ActivityEvent[]) => void
  setVersions: (projectId: string, versions: VersionEntry[]) => void
  /**
   * Drop everything this store holds about a project. Called by
   * `purgeProject` — "delete forever" has to reach here too.
   */
  forgetProject: (projectId: string) => void

  upsertPeer: (peer: PresencePeer) => void
  removePeer: (sessionId: string) => void
  prunePeers: (olderThanMs: number) => void
  setLock: (lock: FileLock) => void
  removeLock: (fileId: string) => void

  setViewAsRole: (role: CollabRole | null) => void
  setPanel: (panel: CollabPanel) => void
  setCommentFilter: (f: 'open' | 'resolved' | 'all') => void
  setFocusedThread: (id: string | null) => void
  setCommentMode: (on: boolean) => void
}

export const useCollabStore = create<CollabState>()(
  persist(
    (set) => ({
      members: {},
      invites: {},
      comments: {},
      activity: {},
      versions: {},
      notifications: [],
      notificationPrefs: DEFAULT_NOTIFICATION_PREFS,

      peers: {},
      locks: {},
      viewAsRole: null,
      panel: null,
      commentFilter: 'open',
      focusedThreadId: null,
      commentMode: false,

      pushNotification: (n) =>
        set((s) => ({ notifications: [n, ...s.notifications].slice(0, 100) })),
      setNotificationPref: (channel, event, on) =>
        set((s) => ({
          notificationPrefs: withPref(s.notificationPrefs, channel, event, on),
        })),
      markNotificationRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n,
          ),
        })),
      markAllNotificationsRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) => (n.read ? n : { ...n, read: true })),
        })),
      clearNotifications: () => set({ notifications: [] }),

      setMembers: (projectId, list) =>
        set((s) => ({ members: { ...s.members, [projectId]: list } })),
      setInvites: (projectId, list) =>
        set((s) => ({ invites: { ...s.invites, [projectId]: list } })),
      setComments: (projectId, list) =>
        set((s) => ({ comments: { ...s.comments, [projectId]: list } })),
      setActivity: (projectId, list) =>
        set((s) => ({ activity: { ...s.activity, [projectId]: list } })),
      setVersions: (projectId, list) =>
        set((s) => ({ versions: { ...s.versions, [projectId]: list } })),

      /**
       * Every persisted map is keyed by project id, and none of them was
       * ever emptied: purging a project removed it from the vault and left
       * its member list, its invitations — addresses included — its comments,
       * its activity trail and its version index here for good. Unbounded
       * growth, and personal data outliving the "delete forever" that was
       * supposed to have taken it.
       *
       * Only the durable, project-keyed maps: `notifications` is a per-device
       * read trail, and peers and locks are ephemeral and die with the tab.
       */
      forgetProject: (projectId) =>
        set((s) => {
          const drop = <T>(rec: Record<string, T>): Record<string, T> => {
            if (!(projectId in rec)) return rec
            const next = { ...rec }
            delete next[projectId]
            return next
          }
          return {
            members: drop(s.members),
            invites: drop(s.invites),
            comments: drop(s.comments),
            activity: drop(s.activity),
            versions: drop(s.versions),
          }
        }),

      upsertPeer: (peer) =>
        set((s) => ({ peers: { ...s.peers, [peer.sessionId]: peer } })),
      removePeer: (sessionId) =>
        set((s) => {
          const peers = { ...s.peers }
          delete peers[sessionId]
          return { peers }
        }),
      prunePeers: (olderThanMs) =>
        set((s) => {
          const cutoff = Date.now() - olderThanMs
          const peers = Object.fromEntries(
            Object.entries(s.peers).filter(([, p]) => p.lastSeenAt >= cutoff),
          )
          return Object.keys(peers).length === Object.keys(s.peers).length
            ? {}
            : { peers }
        }),
      setLock: (lock) => set((s) => ({ locks: { ...s.locks, [lock.fileId]: lock } })),
      removeLock: (fileId) =>
        set((s) => {
          const locks = { ...s.locks }
          delete locks[fileId]
          return { locks }
        }),

      setViewAsRole: (viewAsRole) => set({ viewAsRole }),
      setPanel: (panel) => set({ panel }),
      setCommentFilter: (commentFilter) => set({ commentFilter }),
      setFocusedThread: (focusedThreadId) => set({ focusedThreadId }),
      setCommentMode: (commentMode) => set({ commentMode }),
    }),
    {
      name: 'lattice-collab-v1',
      version: 1,
      partialize: (s) => ({
        members: s.members,
        invites: s.invites,
        comments: s.comments,
        activity: s.activity,
        versions: s.versions,
        notifications: s.notifications,
        // a whitelist: a preference not listed here is a preference that
        // silently resets on every reload
        notificationPrefs: s.notificationPrefs,
      }),
    },
  ),
)

/** A lock is only real while its heartbeat is fresh. */
export function isLockFresh(lock: FileLock | undefined): lock is FileLock {
  return !!lock && Date.now() - lock.renewedAt < LOCK_TTL_MS
}
