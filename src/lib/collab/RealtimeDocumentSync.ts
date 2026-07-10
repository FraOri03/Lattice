import { useStore } from '@/store/useStore'
import type { FileLock } from '@/types/collab'
import { LOCK_TTL_MS } from '@/types/collab'
import { useCollabStore, isLockFresh } from './collabStore'
import { currentIdentity, SESSION_ID } from './CollaborationProvider'
import { membersService } from './MembersService'
import { can } from './permissions'
import { collabHub } from './hub'
import { toast } from '@/components/ui/Toaster'

/**
 * RealtimeDocumentSync — collaborative editing for documents and code,
 * within what the available transport can honestly deliver.
 *
 * Documents (rich text / sheets):
 *  - every save broadcasts a 'doc-update'; sessions with that document
 *    open refresh from shared storage (tabs share IndexedDB, so the body
 *    is already there — no payload travels)
 *  - an editor with unsaved focus is never clobbered: it gets a toast
 *    with an explicit reload action instead (conflict-safe by refusal)
 *
 * Code files — soft locking instead of character merging:
 *  - first editor takes the lock; heartbeat renews it, TTL releases it
 *  - others see "‹name› is editing" and a read-only Monaco
 *  - "request edit" pings the holder; owner/admin may force-unlock
 *
 * True keystroke-level co-editing (Yjs CRDT) is deliberately NOT wired
 * up: without a realtime backend it would only ever work between tabs
 * that already share storage, which this simpler scheme covers. The
 * provider seam is where a y-websocket integration lands in Phase 8.
 */

interface DocUpdatePayload {
  docId: string
  kind: 'doc' | 'code' | 'sheet'
  updatedAt: number
}

type RemoteUpdateListener = (payload: DocUpdatePayload) => void

const LOCK_RENEW_MS = 15_000

class RealtimeDocumentSync {
  private listeners = new Map<string, Set<RemoteUpdateListener>>()
  private offHub: (() => void)[] = []
  private renewTimer: ReturnType<typeof setInterval> | null = null
  /** file ids whose lock this session holds */
  private heldLocks = new Set<string>()
  private started = false

  start(): void {
    if (this.started) return
    this.started = true

    this.offHub.push(
      collabHub.on('doc-update', (msg) => {
        const payload = msg.payload as DocUpdatePayload
        const subs = this.listeners.get(payload.docId)
        if (subs) for (const cb of subs) cb(payload)
      }),
      collabHub.on('lock', (msg) => {
        const lock = msg.payload as FileLock
        if (lock?.fileId) useCollabStore.getState().setLock(lock)
      }),
      collabHub.on('unlock', (msg) => {
        const { fileId } = msg.payload as { fileId: string }
        if (!fileId) return
        useCollabStore.getState().removeLock(fileId)
        this.heldLocks.delete(fileId)
      }),
      collabHub.on('lock-request', (msg) => {
        const { fileId, requesterName } = msg.payload as {
          fileId: string
          requesterName: string
        }
        if (!this.heldLocks.has(fileId)) return
        const meta = useStore.getState().codeDocs[fileId]
        toast.info(
          `${requesterName} asked to edit ${meta ? `${meta.title}.${meta.extension}` : 'a file'}`,
          'Release your lock when you are done.',
          { label: 'Release now', run: () => this.releaseLock(fileId) },
        )
      }),
    )

    this.renewTimer = setInterval(() => this.renewHeldLocks(), LOCK_RENEW_MS)
    window.addEventListener('beforeunload', this.releaseAll)
  }

  stop(): void {
    this.releaseAll()
    for (const off of this.offHub) off()
    this.offHub = []
    if (this.renewTimer) clearInterval(this.renewTimer)
    this.renewTimer = null
    window.removeEventListener('beforeunload', this.releaseAll)
    this.started = false
  }

  /* ---------------- document updates ---------------- */

  /** Broadcast that a body was saved (call after persist*Content). */
  announceSave(docId: string, kind: DocUpdatePayload['kind']): void {
    collabHub.send('doc-update', useStore.getState().activeProjectId, {
      docId,
      kind,
      updatedAt: Date.now(),
    } satisfies DocUpdatePayload)
  }

  /** Editors subscribe to hear about saves from other sessions. */
  onRemoteUpdate(docId: string, cb: RemoteUpdateListener): () => void {
    if (!this.listeners.has(docId)) this.listeners.set(docId, new Set())
    this.listeners.get(docId)!.add(cb)
    return () => {
      this.listeners.get(docId)?.delete(cb)
      if (this.listeners.get(docId)?.size === 0) this.listeners.delete(docId)
    }
  }

  /* ---------------- code file locks ---------------- */

  /** Current fresh lock on a file, if any. */
  lockOn(fileId: string): FileLock | null {
    const lock = useCollabStore.getState().locks[fileId]
    return isLockFresh(lock) ? lock : null
  }

  /** True when THIS session holds the fresh lock. */
  iHoldLock(fileId: string): boolean {
    const lock = this.lockOn(fileId)
    return !!lock && lock.sessionId === SESSION_ID
  }

  /**
   * Try to take (or keep) the edit lock. Returns true when this session
   * may edit the file.
   */
  acquireLock(fileId: string): boolean {
    const existing = this.lockOn(fileId)
    if (existing && existing.sessionId !== SESSION_ID) return false
    const identity = currentIdentity()
    const now = Date.now()
    const lock: FileLock = {
      fileId,
      projectId: useStore.getState().activeProjectId,
      userId: identity.userId,
      userName: identity.name,
      sessionId: SESSION_ID,
      acquiredAt: existing?.acquiredAt ?? now,
      renewedAt: now,
    }
    useCollabStore.getState().setLock(lock)
    this.heldLocks.add(fileId)
    collabHub.send('lock', lock.projectId, lock)
    return true
  }

  releaseLock(fileId: string): void {
    if (!this.heldLocks.has(fileId)) return
    this.heldLocks.delete(fileId)
    useCollabStore.getState().removeLock(fileId)
    collabHub.send('unlock', useStore.getState().activeProjectId, { fileId })
  }

  /** Ask the current holder to hand the file over. */
  requestEditControl(fileId: string): void {
    const identity = currentIdentity()
    collabHub.send('lock-request', useStore.getState().activeProjectId, {
      fileId,
      requesterName: identity.name,
    })
    toast.info('Edit request sent', 'The current editor was asked to release the file.')
  }

  /** Owner/admin only: break a stuck lock. */
  forceUnlock(fileId: string): boolean {
    const role = membersService.effectiveRole(useStore.getState().activeProjectId)
    if (!can(role, 'locks.force-unlock')) return false
    useCollabStore.getState().removeLock(fileId)
    this.heldLocks.delete(fileId)
    collabHub.send('unlock', useStore.getState().activeProjectId, { fileId })
    return true
  }

  private renewHeldLocks(): void {
    const now = Date.now()
    for (const fileId of this.heldLocks) {
      const lock = useCollabStore.getState().locks[fileId]
      if (!lock || lock.sessionId !== SESSION_ID) {
        this.heldLocks.delete(fileId)
        continue
      }
      const renewed = { ...lock, renewedAt: now }
      useCollabStore.getState().setLock(renewed)
      collabHub.send('lock', lock.projectId, renewed)
    }
  }

  private releaseAll = (): void => {
    for (const fileId of [...this.heldLocks]) this.releaseLock(fileId)
  }
}

export const realtimeDocumentSync = new RealtimeDocumentSync()

/** Re-exported so callers can show "lock expires in …" if they want. */
export { LOCK_TTL_MS }
