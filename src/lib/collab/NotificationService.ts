import { nid } from '@/lib/id'
import type { AppNotification, CommentThread, NotificationType } from '@/types/collab'
import { useCrdtStore } from '@/lib/crdt/crdtStore'
import { useSyncStore } from '@/lib/sync/syncStore'
import { useCollabStore } from './collabStore'
import { currentIdentity } from './CollaborationProvider'

/**
 * NotificationService (Phase 8) — the notification center's engine.
 *
 * Notifications are derived on THIS device from synced state, so they
 * work over every transport and read-state stays personal:
 *  - comment diffs → mention / reply / assignment / resolved
 *  - invite diffs  → invite (matched by my e-mail)
 *  - sync stores   → Drive failure, realtime connection failure
 *  - explicit notify() → GitHub sync results, conversion results,
 *    version restores (called by those flows)
 */

class NotificationService {
  private unsubs: (() => void)[] = []
  private started = false
  /** threads as last seen, keyed by id (diff base) */
  private lastThreads = new Map<string, CommentThread>()
  private primedComments = false
  private lastDriveError: string | null = null
  private lastRealtimeStatus = ''

  start(): void {
    if (this.started) return
    this.started = true

    // ---- comments: mention / reply / assignment / resolved ----
    this.unsubs.push(
      useCollabStore.subscribe((state, prev) => {
        if (state.comments === prev.comments) return
        this.diffComments(Object.values(state.comments).flat())
      }),
    )
    // prime the diff base without notifying about history
    this.diffComments(
      Object.values(useCollabStore.getState().comments).flat(),
      true,
    )
    this.primedComments = true

    // ---- invites addressed to me ----
    this.unsubs.push(
      useCollabStore.subscribe((state, prev) => {
        if (state.invites === prev.invites) return
        const me = currentIdentity().email.toLowerCase()
        if (!me) return
        const prevIds = new Set(
          Object.values(prev.invites).flat().map((i) => i.id),
        )
        for (const inv of Object.values(state.invites).flat()) {
          if (prevIds.has(inv.id) || inv.status !== 'pending') continue
          if (inv.email.toLowerCase() !== me) continue
          this.notify(inv.projectId, 'invite', `Invited by ${inv.invitedByName}`, `You were invited as ${inv.role}.`)
        }
      }),
    )

    // ---- Drive sync failures ----
    this.unsubs.push(
      useSyncStore.subscribe((state) => {
        const err = state.status === 'error' ? state.error : null
        if (err && err !== this.lastDriveError) {
          this.notify('', 'drive-failure', 'Google Drive sync failed', err)
        }
        this.lastDriveError = err
      }),
    )

    // ---- realtime connection failures ----
    this.unsubs.push(
      useCrdtStore.subscribe((state) => {
        const key = `${state.status}:${state.detail ?? ''}`
        if (key === this.lastRealtimeStatus) return
        const wasHealthy = !/error|unauthorized/.test(this.lastRealtimeStatus)
        this.lastRealtimeStatus = key
        if ((state.status === 'error' || state.status === 'unauthorized') && wasHealthy) {
          this.notify(
            '',
            'realtime-failure',
            'Realtime connection failed',
            state.detail ?? 'The realtime backend rejected the connection.',
          )
        }
      }),
    )
  }

  stop(): void {
    for (const u of this.unsubs) u()
    this.unsubs = []
    this.lastThreads.clear()
    this.primedComments = false
    this.started = false
  }

  /** Explicit notifications from flows (GitHub sync, conversion, restore). */
  notify(
    projectId: string,
    type: NotificationType,
    title: string,
    body: string,
    link?: AppNotification['link'],
  ): void {
    useCollabStore.getState().pushNotification({
      id: nid('ntf'),
      projectId,
      type,
      title,
      body: body.slice(0, 300),
      createdAt: Date.now(),
      read: false,
      link,
    })
  }

  private diffComments(threads: CommentThread[], prime = false): void {
    const identity = currentIdentity()
    const myId = identity.userId
    const myNames = new Set(
      [identity.name, identity.email.split('@')[0]]
        .filter(Boolean)
        .map((n) => n.toLowerCase()),
    )

    for (const t of threads) {
      const before = this.lastThreads.get(t.id)
      this.lastThreads.set(t.id, t)
      if (prime || !this.primedComments) continue

      const linkFor = (thread: CommentThread): AppNotification['link'] => ({
        kind: 'thread',
        id: thread.targetId,
        threadId: thread.id,
      })

      // new thread by someone else mentioning me
      if (!before && t.authorId !== myId && t.mentions.some((m) => myNames.has(m))) {
        this.notify(t.projectId, 'mention', `${t.authorName} mentioned you`, t.body, linkFor(t))
        continue
      }
      if (!before) continue

      // new replies from others on threads I authored or participate in
      if (t.replies.length > before.replies.length) {
        const fresh = t.replies.slice(before.replies.length)
        const involved =
          t.authorId === myId ||
          t.assigneeId === myId ||
          before.replies.some((r) => r.authorId === myId)
        for (const r of fresh) {
          if (r.authorId === myId) continue
          if (t.mentions.some((m) => myNames.has(m)) || involved) {
            this.notify(t.projectId, 'reply', `${r.authorName} replied`, r.body, linkFor(t))
          }
        }
      }

      // assigned to me by someone else
      if (t.assigneeId === myId && before.assigneeId !== myId) {
        this.notify(
          t.projectId,
          'assignment',
          'Comment assigned to you',
          t.body,
          linkFor(t),
        )
      }

      // my thread resolved/reopened by someone else
      if (t.resolved !== before.resolved && t.authorId === myId && t.resolvedBy !== myId) {
        this.notify(
          t.projectId,
          'comment-resolved',
          t.resolved
            ? `${t.resolvedByName ?? 'Someone'} resolved your comment`
            : 'Your comment was reopened',
          t.body,
          linkFor(t),
        )
      }
    }
  }
}

export const notificationService = new NotificationService()
