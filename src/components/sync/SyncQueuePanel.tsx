import { type RefObject } from 'react'
import { useSyncStore } from '@/lib/sync/syncStore'
import { syncEngine } from '@/lib/sync/SyncEngine'
import {
  jobPercent,
  summarize,
  useSyncQueue,
  type SyncJob,
  type SyncJobStatus,
} from '@/lib/sync/syncQueue'
import { AnchoredPopover } from '@/components/ui/AnchoredPopover'
import { useI18n, useTimeAgo } from '@/lib/i18n'
import { formatBytes } from '@/lib/media'
import {
  IcCheck,
  IcCode,
  IcDoc,
  IcDownload,
  IcFile,
  IcFolder,
  IcGlobe,
  IcHistory,
  IcRefresh,
  IcTable,
  IcUpload,
} from '@/components/Icons'

/**
 * The overlay behind the top bar's sync chip: the queue of files the sync is
 * moving, one row each, with the bytes measured out of the bytes expected.
 *
 * The chip it hangs off used to *start* a sync on click and say nothing else,
 * so the only thing a slow sync could tell you was that it was slow. The
 * button moved in here — a sync is still one click away, it just no longer
 * costs you the ability to look.
 *
 * Nothing in this file computes a percentage: `jobPercent` and `summarize`
 * own that, and both return `null` rather than a guess when a transfer cannot
 * be measured, which is what `<Bar>` renders as an indeterminate stripe.
 */

const GREEN = '#14ae5c'
const RED = '#f24822'
const AMBER = '#ffa629'

const KIND_ICON = {
  project: <IcFolder size={12} />,
  doc: <IcDoc size={12} />,
  companion: <IcGlobe size={12} />,
  sheet: <IcTable size={12} />,
  code: <IcCode size={12} />,
  asset: <IcFile size={12} />,
  backup: <IcHistory size={12} />,
}

/**
 * Reading order, which is not insertion order: a failure is the one row that
 * needs a person, and what is moving now beats what has already finished.
 * Settled rows keep the newest first so the tail of a long run stays visible
 * without scrolling to the bottom.
 */
const RANK: Record<SyncJobStatus, number> = {
  error: 0,
  active: 1,
  queued: 2,
  skipped: 3,
  done: 3,
}

function ordered(jobs: SyncJob[]): SyncJob[] {
  return [...jobs].sort((a, b) => {
    const byRank = RANK[a.status] - RANK[b.status]
    if (byRank) return byRank
    if (RANK[a.status] === 3) return (b.finishedAt ?? 0) - (a.finishedAt ?? 0)
    return a.queuedAt - b.queuedAt
  })
}

/**
 * One progress bar. `percent` is `null` for a transfer whose size nobody can
 * state yet — no number is shown for those, because the point of this panel is
 * that its figures are real.
 *
 * Unmeasured splits two ways, and conflating them was misleading: a transfer
 * still *running* gets the moving stripe, while one that has stopped (failed,
 * or skipped before it began) gets a full dim track. Animating the latter
 * showed a red row pulsing away as if it were still trying.
 */
function Bar({
  percent,
  color = 'var(--accent)',
  label,
  running = false,
}: {
  percent: number | null
  color?: string
  label: string
  running?: boolean
}) {
  return (
    <div
      className="h-1 overflow-hidden rounded-full bg-panel2"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent === null ? undefined : Math.round(percent * 100)}
    >
      {percent === null ? (
        <div
          className={running ? 'h-full w-1/3 animate-pulse rounded-full' : 'h-full w-full rounded-full opacity-40'}
          style={{ background: color }}
        />
      ) : (
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(percent * 100, 2)}%`, background: color }}
        />
      )}
    </div>
  )
}

function JobRow({ job }: { job: SyncJob }) {
  const t = useI18n()
  const percent = jobPercent(job)
  const kind = t.syncQueue.kind[job.kind] ?? job.kind
  const direction = job.direction === 'upload' ? t.syncQueue.upload : t.syncQueue.download

  const color =
    job.status === 'error' ? RED : job.status === 'skipped' ? AMBER : job.status === 'done' ? GREEN : 'var(--accent)'

  // right-hand reading: a percentage while it moves, the outcome once settled
  const readout =
    job.status === 'active' && percent !== null
      ? `${Math.round(percent * 100)}%`
      : t.syncQueue.state[job.status]

  // and underneath it, what that percentage is a percentage OF
  const size =
    job.total !== null
      ? job.status === 'done' || job.status === 'queued'
        ? formatBytes(job.total) || '0 B'
        : t.syncQueue.bytesOf(formatBytes(job.loaded) || '0 B', formatBytes(job.total) || '0 B')
      : job.status === 'active'
        ? t.syncQueue.unmeasured
        : ''

  const note = job.status === 'error' ? job.detail : job.reason ? t.syncQueue.reason[job.reason] : ''

  return (
    <li className="px-3 py-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex-none text-muted" title={kind} aria-hidden>
          {KIND_ICON[job.kind]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium">{job.label}</span>
            <span
              className="flex-none text-[10.5px] font-semibold tabular-nums"
              style={{ color: job.status === 'active' ? undefined : color }}
            >
              {readout}
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-2 text-[10px] text-muted">
            <span className="min-w-0 flex-1 truncate" title={job.file}>
              <span className="inline-flex items-center gap-1 align-[-1px]" aria-hidden>
                {job.direction === 'upload' ? <IcUpload size={9} /> : <IcDownload size={9} />}
              </span>{' '}
              <span className="sr-only">{direction} · </span>
              {job.file}
            </span>
            {size && <span className="flex-none tabular-nums">{size}</span>}
          </div>
          <div className="mt-1.5">
            <Bar
              percent={percent}
              color={color}
              running={job.status === 'active'}
              label={`${job.label} — ${direction}`}
            />
          </div>
          {note && (
            <div
              className="mt-1 text-[10px] leading-snug"
              style={{ color: job.status === 'error' ? RED : 'var(--muted)' }}
            >
              {note}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

/**
 * Mounted only while the popover is open — `AnchoredPopover` renders nothing
 * when shut, so this never subscribes to the queue in the background. That
 * matters here and nowhere else in the app: a running sync writes to this
 * store several times a second.
 */
function QueueBody() {
  const t = useI18n()
  const timeAgo = useTimeAgo()
  const jobs = useSyncQueue((s) => s.jobs)
  const clearSettled = useSyncQueue((s) => s.clearSettled)
  const status = useSyncStore((s) => s.status)
  const error = useSyncStore((s) => s.error)
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt)
  const pendingChanges = useSyncStore((s) => s.pendingChanges)

  const summary = summarize(jobs)
  const running = status === 'syncing'
  const settledOnly = summary.total > 0 && summary.settled === summary.total

  return (
    <>
      <div className="flex flex-none items-center gap-2 border-b border-bord px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-[12px] font-bold">{t.syncQueue.title}</span>
        <button
          className="btn h-6 px-2 py-0 text-[10.5px]"
          onClick={() => void syncEngine.syncNow()}
          disabled={running || status === 'offline'}
          title={t.syncQueue.syncNowTitle}
        >
          <IcRefresh size={11} className={running ? 'animate-spin' : undefined} />
          {running ? t.syncChip.syncing : t.syncQueue.syncNow}
        </button>
      </div>

      {/* the run as a whole, above the files it is made of */}
      <div className="flex-none border-b border-bord px-3 py-2">
        <div className="flex items-baseline gap-2 text-[10.5px]">
          <span className="min-w-0 flex-1 truncate text-muted">
            {summary.total
              ? t.syncQueue.files(summary.settled, summary.total)
              : t.profile.status[status]}
          </span>
          {summary.failed > 0 && (
            <span className="flex-none font-semibold" style={{ color: RED }}>
              {t.syncQueue.failed(summary.failed)}
            </span>
          )}
          {summary.total > 0 && (
            <span className="flex-none font-semibold tabular-nums">
              {Math.round(summary.percent * 100)}%
            </span>
          )}
        </div>
        {summary.total > 0 && (
          <div className="mt-1.5">
            <Bar
              percent={summary.percent}
              color={summary.failed ? RED : settledOnly ? GREEN : 'var(--accent)'}
              label={t.syncQueue.title}
            />
          </div>
        )}
        {status === 'error' && error && (
          <p className="mt-1.5 text-[10px] leading-snug" style={{ color: RED }}>
            {error}
          </p>
        )}
      </div>

      {jobs.length === 0 ? (
        <div className="px-3 py-6 text-center">
          <IcCheck size={18} className="mx-auto mb-1.5 text-muted" aria-hidden />
          <p className="text-[11.5px] font-medium">{t.syncQueue.empty}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">{t.syncQueue.emptyHint}</p>
          {pendingChanges > 0 && (
            <p className="mt-1.5 text-[10px] font-medium" style={{ color: AMBER }}>
              {t.syncQueue.waiting(pendingChanges)}
            </p>
          )}
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-bord overflow-y-auto">
          {ordered(jobs).map((job) => (
            <JobRow key={job.key} job={job} />
          ))}
        </ul>
      )}

      <div className="flex flex-none items-center gap-2 border-t border-bord px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted">
          {t.syncQueue.lastSync(timeAgo(lastSyncAt))}
        </span>
        {summary.settled > 0 && (
          <button
            className="flex-none cursor-pointer text-[10px] text-muted hover:text-ink"
            onClick={clearSettled}
          >
            {t.syncQueue.clear}
          </button>
        )}
      </div>
    </>
  )
}

export function SyncQueuePanel({
  anchorRef,
  open,
  onClose,
}: {
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
}) {
  const t = useI18n()
  return (
    <AnchoredPopover
      anchorRef={anchorRef}
      open={open}
      onClose={onClose}
      role="dialog"
      label={t.syncQueue.title}
      className="flex w-[21rem] flex-col"
    >
      <QueueBody />
    </AnchoredPopover>
  )
}
