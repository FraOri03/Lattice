import type { VersionTargetType } from '@/types/collab'
import { useStore } from '@/store/useStore'
import { versionHistory } from './VersionHistoryService'

/**
 * AutoSnapshot (Phase 8, spec §19) — automatic version snapshots every
 * 10 minutes for entities that were ACTIVELY edited in that window.
 * persist*Content marks targets dirty (via announceEdit); the flush
 * creates one labelled snapshot per dirty target and clears the set.
 * Restore flows and CRDT migrations create their own explicit
 * snapshots; this covers the "I was just working" safety net.
 */

const AUTO_INTERVAL_MS = 10 * 60_000

class AutoSnapshotService {
  private dirty = new Map<string, { kind: VersionTargetType; projectId: string }>()
  private timer: ReturnType<typeof setInterval> | null = null

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.flush(), AUTO_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.dirty.clear()
  }

  markDirty(kind: 'doc' | 'code' | 'sheet' | 'present', id: string): void {
    this.dirty.set(id, {
      kind,
      projectId: useStore.getState().activeProjectId,
    })
  }

  private async flush(): Promise<void> {
    const batch = [...this.dirty.entries()]
    this.dirty.clear()
    for (const [id, { kind, projectId }] of batch) {
      try {
        await versionHistory.create(
          projectId,
          kind,
          id,
          'Auto snapshot',
          'Periodic snapshot during active editing',
        )
      } catch (err) {
        console.warn('[versions] auto snapshot failed', id, err)
      }
    }
  }
}

export const autoSnapshot = new AutoSnapshotService()
