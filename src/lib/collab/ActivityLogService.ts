import { nid } from '@/lib/id'
import type { ActivityEvent, ActivityType } from '@/types/collab'
import { useCollabStore } from './collabStore'
import { currentIdentity } from './CollaborationProvider'
import { collabHub } from './hub'

/**
 * ActivityLogService — append-only project history ("Ada invited Bob",
 * "Roadmap board card moved", "Drive sync completed"). Capped per
 * project; merged set-union across devices so histories interleave
 * instead of clobbering.
 */

const CAP = 500

/** Events deduped within this window (e.g. continuous typing in a doc). */
const DEDUPE_MS = 5 * 60_000

const DEDUPED_TYPES: ReadonlySet<ActivityType> = new Set([
  'doc.edited',
  'code.edited',
  'sheet.edited',
  'board.card-moved',
  'drive.sync',
])

class ActivityLogService {
  log(
    projectId: string,
    type: ActivityType,
    message: string,
    targetId?: string,
  ): void {
    const s = useCollabStore.getState()
    const list = s.activity[projectId] ?? []

    if (DEDUPED_TYPES.has(type)) {
      const recent = list.find(
        (e) =>
          e.type === type &&
          e.targetId === targetId &&
          Date.now() - e.at < DEDUPE_MS,
      )
      if (recent) {
        // refresh the timestamp instead of spamming the log
        const next = list.map((e) =>
          e.id === recent.id ? { ...e, at: Date.now(), message } : e,
        )
        s.setActivity(
          projectId,
          next.sort((a, b) => b.at - a.at),
        )
        collabHub.broadcastState(projectId)
        return
      }
    }

    const identity = currentIdentity()
    const event: ActivityEvent = {
      id: nid('act'),
      projectId,
      type,
      actorId: identity.userId,
      actorName: identity.name,
      at: Date.now(),
      message,
      targetId,
    }
    s.setActivity(projectId, [event, ...list].slice(0, CAP))
    collabHub.broadcastState(projectId)
  }

  eventsFor(projectId: string): ActivityEvent[] {
    return useCollabStore.getState().activity[projectId] ?? []
  }
}

export const activityLog = new ActivityLogService()
