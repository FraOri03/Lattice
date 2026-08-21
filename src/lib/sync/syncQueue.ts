import { create } from 'zustand'

/**
 * The transfer queue behind the top bar's sync chip: one entry per FILE the
 * SyncEngine is moving, with the bytes actually moved so far.
 *
 * It exists because `syncStore` answers a different question. That store has
 * a status ("syncing") and a count of dirty entities, which says that work is
 * happening and roughly how much — never *what*. A sync that stalls on one
 * 400 MB asset and a sync that is quietly re-uploading forty documents look
 * identical from there, and the spinner is the only thing the user gets.
 *
 * The two stay separate rather than merging: `syncStore` is the durable
 * summary the whole app reads (chip, profile menu, storage panel), this is
 * per-run detail with a high update rate, and only the open overlay
 * subscribes to it.
 *
 * **Percentages here are measured, never staged.** `loaded`/`total` come from
 * the transfer itself — `xhr.upload.onprogress` on the way out, the response
 * stream against `Content-Length` on the way back. When neither side can be
 * measured, `jobPercent` returns `null` and the row renders an indeterminate
 * bar: an invented number would defeat the purpose of a panel whose whole job
 * is to say where the sync actually is.
 */

/** Which of the vault's file families a queued transfer belongs to. */
export type SyncJobKind =
  | 'project' // project.json — the project's metadata snapshot
  | 'doc' // rich document body (JSON)
  | 'companion' // the readable HTML mirror of a rich document
  | 'sheet' // workbook body
  | 'code' // code source
  | 'asset' // binary
  | 'backup' // a local body preserved before a remote copy overwrites it

export type SyncJobDirection = 'upload' | 'download'

/**
 * `skipped` is a real outcome, not a failure: a body whose payload is not in
 * this browser's IndexedDB (metadata pulled from another device, binary never
 * fetched) has nothing to send, and the row says so instead of vanishing.
 */
export type SyncJobStatus = 'queued' | 'active' | 'done' | 'error' | 'skipped'

/**
 * Why a queued file moved no bytes. A code rather than a sentence, because
 * this one is shown to the user and has to be translatable — engine-side
 * *error* text stays as Drive phrased it, which is what `detail` carries.
 */
export type SyncSkipReason =
  /** The payload is not in this browser: metadata synced, body never fetched. */
  | 'no-local-copy'
  /** Drive lists the entity but not the file, so there is nothing to pull. */
  | 'missing-on-drive'

export interface SyncJob {
  /** `${direction}:${kind}:${id}` — one entity can legitimately be both pulled and pushed in a run. */
  key: string
  kind: SyncJobKind
  direction: SyncJobDirection
  /** What the user calls this thing: a document title, a project name. */
  label: string
  /** How it is named on Drive, shown under the label. */
  file: string
  status: SyncJobStatus
  /** Bytes moved so far. */
  loaded: number
  /** Payload size when it is known — `null` while the transfer cannot measure it. */
  total: number | null
  /** Set on `error`: what Drive said, already run through `describeDriveError`. */
  detail?: string
  /** Set on `skipped`: why there was nothing to move. */
  reason?: SyncSkipReason
  queuedAt: number
  startedAt?: number
  finishedAt?: number
}

export type NewSyncJob = Pick<SyncJob, 'key' | 'kind' | 'direction' | 'label' | 'file'> & {
  total?: number | null
}

/**
 * A ceiling on the list, because a first sync of a large vault enqueues one
 * entry per file and the panel is a status view, not a log. Settled rows are
 * dropped oldest-first; anything still queued or in flight is never dropped,
 * since that is the part the user opened the panel to watch.
 */
const MAX_JOBS = 250

/** Sub-percent progress events are dropped — a big upload fires hundreds. */
const PROGRESS_EPSILON = 0.01

interface SyncQueueState {
  jobs: SyncJob[]
  /** When the current run started; null before the first one. */
  runStartedAt: number | null
  /** When it finished — null while a run is in flight. */
  runEndedAt: number | null

  beginRun: () => void
  endRun: () => void
  enqueue: (job: NewSyncJob) => void
  start: (key: string) => void
  progress: (key: string, loaded: number, total: number | null) => void
  done: (key: string) => void
  fail: (key: string, detail: string) => void
  skip: (key: string, reason: SyncSkipReason) => void
  /** Forget everything that has settled, keeping work still in flight. */
  clearSettled: () => void
}

const isSettled = (j: SyncJob) =>
  j.status === 'done' || j.status === 'error' || j.status === 'skipped'

/** Drop the oldest settled rows once the list outgrows its ceiling. */
function trim(jobs: SyncJob[]): SyncJob[] {
  if (jobs.length <= MAX_JOBS) return jobs
  const over = jobs.length - MAX_JOBS
  let dropped = 0
  return jobs.filter((j) => {
    if (dropped < over && isSettled(j)) {
      dropped++
      return false
    }
    return true
  })
}

/** Replace one job in place, leaving the array untouched if it is unknown. */
function patch(
  jobs: SyncJob[],
  key: string,
  fn: (job: SyncJob) => SyncJob | null,
): SyncJob[] {
  const i = jobs.findIndex((j) => j.key === key)
  if (i === -1) return jobs
  const next = fn(jobs[i])
  if (!next) return jobs
  const copy = [...jobs]
  copy[i] = next
  return copy
}

export const useSyncQueue = create<SyncQueueState>()((set) => ({
  jobs: [],
  runStartedAt: null,
  runEndedAt: null,

  /**
   * A run opens with an empty list. Every row belongs to exactly one run: the
   * engine re-derives all of its work from the dirty checks each time, so
   * carrying anything over could only carry over something stale.
   *
   * Rows still `queued` when a run dies mid-way are the case that matters —
   * a body upload that throws leaves everything after it in the queue
   * untouched. Keeping "unfinished" rows would strand those forever, because
   * nothing can be genuinely in flight here: `syncNow`/`push` both bail on
   * `busy`, so no run ever overlaps another.
   */
  beginRun: () => set({ jobs: [], runStartedAt: Date.now(), runEndedAt: null }),

  endRun: () => set({ runEndedAt: Date.now() }),

  enqueue: (job) =>
    set((s) => ({
      jobs: trim([
        ...s.jobs.filter((j) => j.key !== job.key),
        {
          ...job,
          total: job.total ?? null,
          status: 'queued',
          loaded: 0,
          queuedAt: Date.now(),
        },
      ]),
    })),

  start: (key) =>
    set((s) => ({
      jobs: patch(s.jobs, key, (j) => ({ ...j, status: 'active', startedAt: Date.now() })),
    })),

  progress: (key, loaded, total) =>
    set((s) => ({
      jobs: patch(s.jobs, key, (j) => {
        if (j.status !== 'active') return null
        const size = total ?? j.total
        const before = jobPercent(j)
        const after = size && size > 0 ? Math.min(1, loaded / size) : null
        // the last event always lands, however small the step that got there
        if (before !== null && after !== null && after < 1 && after - before < PROGRESS_EPSILON) {
          return null
        }
        return { ...j, loaded, total: size }
      }),
    })),

  done: (key) =>
    set((s) => ({
      jobs: patch(s.jobs, key, (j) => ({
        ...j,
        status: 'done',
        finishedAt: Date.now(),
        // a transfer that never reported its size still finished whole
        loaded: j.total ?? j.loaded,
      })),
    })),

  fail: (key, detail) =>
    set((s) => ({
      jobs: patch(s.jobs, key, (j) => ({
        ...j,
        status: 'error',
        detail,
        finishedAt: Date.now(),
      })),
    })),

  skip: (key, reason) =>
    set((s) => ({
      jobs: patch(s.jobs, key, (j) => ({
        ...j,
        status: 'skipped',
        reason,
        finishedAt: Date.now(),
      })),
    })),

  clearSettled: () => set((s) => ({ jobs: s.jobs.filter((j) => !isSettled(j)) })),
}))

/**
 * How far along one file is, 0..1 — or `null` when that is genuinely not
 * knowable yet, which the UI renders as an indeterminate bar rather than as a
 * number nobody measured.
 */
export function jobPercent(job: SyncJob): number | null {
  if (job.status === 'done') return 1
  if (job.status === 'queued') return 0
  if (job.status === 'error' || job.status === 'skipped') return null
  if (job.total === null || job.total <= 0) return null
  return Math.min(1, Math.max(0, job.loaded / job.total))
}

export interface QueueSummary {
  total: number
  /** Finished one way or another: done, skipped or failed. */
  settled: number
  active: number
  failed: number
  /** The run as a whole, 0..1: settled files plus the fraction of those in flight. */
  percent: number
}

export function summarize(jobs: SyncJob[]): QueueSummary {
  let settled = 0
  let active = 0
  let failed = 0
  let fraction = 0
  for (const job of jobs) {
    if (isSettled(job)) {
      settled++
      fraction += 1
      if (job.status === 'error') failed++
    } else if (job.status === 'active') {
      active++
      fraction += jobPercent(job) ?? 0
    }
  }
  return {
    total: jobs.length,
    settled,
    active,
    failed,
    percent: jobs.length ? fraction / jobs.length : 0,
  }
}

/**
 * Imperative façade for the SyncEngine, which is not a component. Same store,
 * without a `getState()` at every call site.
 */
export const syncQueue = {
  beginRun: () => useSyncQueue.getState().beginRun(),
  endRun: () => useSyncQueue.getState().endRun(),
  add: (job: NewSyncJob) => useSyncQueue.getState().enqueue(job),
  start: (key: string) => useSyncQueue.getState().start(key),
  done: (key: string) => useSyncQueue.getState().done(key),
  fail: (key: string, detail: string) => useSyncQueue.getState().fail(key, detail),
  skip: (key: string, reason: SyncSkipReason) => useSyncQueue.getState().skip(key, reason),
  /** A progress callback bound to one job, handed straight to the storage provider. */
  track:
    (key: string) =>
    (loaded: number, total: number | null): void =>
      useSyncQueue.getState().progress(key, loaded, total),
}
