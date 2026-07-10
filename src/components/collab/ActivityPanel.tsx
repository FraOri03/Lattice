import { useMemo, useState } from 'react'
import { useStore } from '@/store/useStore'
import { useCollabStore } from '@/lib/collab/collabStore'
import { colorForUser } from '@/lib/collab/CollaborationProvider'
import type { ActivityEvent, ActivityType } from '@/types/collab'
import {
  IcActivity,
  IcBoard,
  IcCloud,
  IcDoc,
  IcGithub,
  IcHistory,
  IcMessage,
  IcUsers,
} from '@/components/Icons'
import { ActionIcon } from '@/components/ActionIcons'

/** ActivityPanel — chronological project history with light filtering. */

const TYPE_ICON = (type: ActivityType): React.ReactNode => {
  if (type.startsWith('member.')) return <IcUsers size={12} />
  if (type.startsWith('comment.')) return <IcMessage size={12} />
  if (type.startsWith('version.')) return <IcHistory size={12} />
  if (type.startsWith('board.')) return <IcBoard size={12} />
  if (type === 'github.sync') return <IcGithub size={12} />
  if (type === 'drive.sync') return <IcCloud size={12} />
  if (type === 'file.imported') return <ActionIcon.Import size={12} />
  return <IcDoc size={12} />
}

type Bucket = 'all' | 'members' | 'comments' | 'content' | 'sync'

const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'members', label: 'Members' },
  { key: 'comments', label: 'Comments' },
  { key: 'content', label: 'Content' },
  { key: 'sync', label: 'Sync' },
]

function bucketOf(type: ActivityType): Bucket {
  if (type.startsWith('member.')) return 'members'
  if (type.startsWith('comment.')) return 'comments'
  if (type === 'github.sync' || type === 'drive.sync' || type === 'export') return 'sync'
  return 'content'
}

function dayLabel(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86400_000)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function ActivityPanel() {
  const projectId = useStore((s) => s.activeProjectId)
  const events = useCollabStore((s) => s.activity[projectId]) ?? []
  const [bucket, setBucket] = useState<Bucket>('all')

  const groups = useMemo(() => {
    const visible = events.filter((e) => bucket === 'all' || bucketOf(e.type) === bucket)
    const byDay = new Map<string, ActivityEvent[]>()
    for (const e of visible) {
      const key = dayLabel(e.at)
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key)!.push(e)
    }
    return [...byDay.entries()]
  }, [events, bucket])

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1.5 px-3 pt-2 pb-1">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            onClick={() => setBucket(b.key)}
            className={`cursor-pointer rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${
              bucket === b.key
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-bord text-muted hover:text-ink'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {groups.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted">
            <IcActivity size={22} />
            <p className="text-[12px]">No activity yet</p>
            <p className="max-w-52 text-[11px]">
              Edits, comments, invites, versions and sync events show up here.
            </p>
          </div>
        )}
        {groups.map(([day, list]) => (
          <div key={day}>
            <div className="insp-h !mt-2">{day}</div>
            {list.map((e) => (
              <div key={e.id} className="mb-0.5 flex items-start gap-2 rounded-md px-1.5 py-1.5 hover:bg-panel2/50">
                <span
                  className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-panel2"
                  style={{ color: colorForUser(e.actorId) }}
                >
                  {TYPE_ICON(e.type)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] leading-snug break-words">
                    <span className="font-semibold">{e.actorName}</span>{' '}
                    <span className="text-muted">·</span> {e.message}
                  </p>
                  <span className="text-[10px] text-muted">
                    {new Date(e.at).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
