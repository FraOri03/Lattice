import { authService } from '@/lib/auth/AuthService'
import { GoogleDriveStorageProvider } from '@/lib/storage/GoogleDriveStorageProvider'
import { useStore } from '@/store/useStore'
import type { CollabCapabilities, CollabMessage } from '@/types/collab'
import type { CollaborationProvider } from './CollaborationProvider'
import { SESSION_ID } from './CollaborationProvider'
import type { CollabStateSlice } from './ConflictResolverV2'

/**
 * DrivePollingCollaborationProvider — durable collaboration state through
 * the project's Google Drive folder, no realtime backend required.
 *
 * Each project stores one file:
 *   /Lattice/projects/<id>/collab.json   { members, invites, comments,
 *                                          activity, versions, savedAt }
 *
 * Loop (active project only, every POLL_MS):
 *   1. download remote collab.json → deliver as a 'collab-state' message
 *      (the hub merges it with ConflictResolverV2 — never overwrites)
 *   2. if local state changed since the last upload, push the merged state
 *
 * Honest limits (also shown in the collaboration settings UI): latency is
 * the polling interval, presence is only "last active" timestamps, and
 * everyone must have access to the same Drive folder. Live cursors and
 * keystroke-level co-editing need the realtime provider (Phase 8).
 */

const POLL_MS = 20_000

interface CollabFile extends CollabStateSlice {
  app: 'lattice-collab'
  version: 1
  savedAt: number
}

export class DrivePollingCollaborationProvider implements CollaborationProvider {
  readonly id = 'drive-polling' as const
  readonly label = 'Google Drive (polling)'
  readonly capabilities: CollabCapabilities = {
    presence: false,
    liveCursors: false,
    liveBoardOps: false,
    liveDocuments: false,
    latency: 'seconds',
    scope: 'same Google Drive',
    // polling moves durable state only — none of this is realtime/CRDT
    boardRealtime: false,
    documentCRDT: false,
    codeCRDT: false,
    commentsRealtime: false,
    serverPermissions: false,
    offlineRecovery: false,
  }

  private drive: GoogleDriveStorageProvider | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private onMessage: ((msg: CollabMessage) => void) | null = null
  /** project ids whose local state changed since the last upload */
  private dirty = new Set<string>()
  private busy = false
  /** collect fresh local state at upload time (set by the hub) */
  getLocalState: ((projectId: string) => CollabStateSlice) | null = null

  isAvailable(): boolean {
    return authService.kind === 'google' && authService.restore() !== null
  }

  start(onMessage: (msg: CollabMessage) => void): void {
    if (!this.isAvailable() || this.timer) return
    this.onMessage = onMessage
    this.drive = new GoogleDriveStorageProvider(() => authService.getAccessToken())
    this.timer = setInterval(() => void this.tick(), POLL_MS)
    void this.tick()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.drive = null
    this.onMessage = null
  }

  send(msg: CollabMessage): void {
    // Only durable state travels over Drive; ephemeral traffic
    // (cursors, presence heartbeats, board ops) is out of scope here.
    if (msg.type === 'collab-state') this.dirty.add(msg.projectId)
  }

  private async tick(): Promise<void> {
    if (!this.drive || this.busy || !navigator.onLine) return
    this.busy = true
    try {
      const projectId = useStore.getState().activeProjectId
      await this.pull(projectId)
      if (this.dirty.has(projectId)) await this.push(projectId)
    } catch (err) {
      // polling is best-effort; Drive hiccups must never break the app
      console.warn('[collab/drive] poll failed', err)
    } finally {
      this.busy = false
    }
  }

  private async pull(projectId: string): Promise<void> {
    const drive = this.drive!
    const meta = await drive.findFile(['projects', projectId], 'collab.json')
    if (!meta) return
    const remote = await drive.downloadJson<CollabFile>(meta.id)
    if (remote?.app !== 'lattice-collab') return
    this.onMessage?.({
      type: 'collab-state',
      projectId,
      senderId: `drive:${SESSION_ID}`,
      at: remote.savedAt,
      payload: remote,
    })
  }

  private async push(projectId: string): Promise<void> {
    const drive = this.drive!
    const local = this.getLocalState?.(projectId)
    if (!local) return
    const file: CollabFile = {
      app: 'lattice-collab',
      version: 1,
      savedAt: Date.now(),
      ...local,
    }
    await drive.putFile(
      ['projects', projectId],
      'collab.json',
      JSON.stringify(file),
      'application/json',
    )
    this.dirty.delete(projectId)
  }
}
