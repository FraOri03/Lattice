import { vaultKey } from '@/lib/storage/vaultScope'
import { isAiActionId, type AiActionId } from './actions.js'
import { isTerminal, type AiJobState } from './jobModel.js'

/**
 * Where an in-flight AI job is remembered across a reload.
 *
 * A generation that costs money and takes a minute must not be lost because
 * someone hit refresh: without this, the tab forgets the job while RunPod
 * keeps running it, and the user pays for an image nobody ever receives.
 * That orphan is exactly what 21.10 goes looking for, and the cheapest
 * place to not create one is here.
 *
 * ## Per account, via `vaultKey`
 *
 * Namespaced like everything else Lattice keeps on the machine
 * (`src/lib/storage/vaultScope.ts`). Two accounts on one browser must not
 * see each other's jobs, and the ticket stored alongside the id is a
 * capability — signing out and back in as somebody else must not hand it
 * over.
 *
 * ## What is stored, and what is not
 *
 * The id, the signed ticket that authorises asking about it, the action,
 * the last state seen and the two timestamps. Never the inputs, never the
 * prompt, never the result: this is a *reattachment record*, small enough
 * to write on every state change without thinking about it. Where results
 * live is 21.5's question.
 */

/** The vault name these records live under. Exported so tests can corrupt it. */
export const AI_JOBS_KEY = vaultKey('lattice-ai-jobs')

const KEY = AI_JOBS_KEY

/** Nothing survives its deadline by more than this; then it is garbage. */
const GRACE_MS = 60_000

/** Belt and braces against a store that never gets pruned. */
const MAX_REMEMBERED = 20

export interface PersistedAiJob {
  readonly jobId: string
  /**
   * The server-signed ticket that proves this browser may ask about, and
   * cancel, this job. Minted at submission by `/api/ai/submit`; useless to
   * anyone else because it is bound to the account it was issued for.
   */
  readonly ticket: string
  readonly actionId: AiActionId
  readonly state: AiJobState
  readonly submittedAt: number
  readonly deadlineAt: number
}

function readAll(): PersistedAiJob[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPersistedJob)
  } catch {
    // A vault that cannot be read is a vault with no jobs in it. Losing a
    // reattachment is survivable; throwing on boot is not.
    return []
  }
}

function writeAll(jobs: PersistedAiJob[]): void {
  try {
    if (jobs.length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(jobs.slice(-MAX_REMEMBERED)))
  } catch {
    // Quota or a private-mode store. The job still runs; only the
    // reattachment is lost, and polling continues in this tab.
  }
}

function isPersistedJob(value: unknown): value is PersistedAiJob {
  if (!value || typeof value !== 'object') return false
  const job = value as Record<string, unknown>
  return (
    typeof job.jobId === 'string' &&
    job.jobId.length > 0 &&
    typeof job.ticket === 'string' &&
    isAiActionId(job.actionId) &&
    typeof job.state === 'string' &&
    typeof job.submittedAt === 'number' &&
    typeof job.deadlineAt === 'number'
  )
}

/** Every remembered job, dead ones included. Prefer {@link activeAiJobs}. */
export function loadAiJobs(): PersistedAiJob[] {
  return readAll()
}

/**
 * The jobs worth reconnecting to: not terminal, and not past their deadline.
 *
 * Also prunes, because the moment the app asks "what was I doing" is the
 * only moment it reliably has an opinion about what is stale.
 */
export function activeAiJobs(now: number = Date.now()): PersistedAiJob[] {
  const kept = readAll().filter(
    (job) => !isTerminal(job.state) && now <= job.deadlineAt + GRACE_MS,
  )
  writeAll(kept)
  return kept
}

export function rememberAiJob(job: PersistedAiJob): void {
  const others = readAll().filter((j) => j.jobId !== job.jobId)
  writeAll([...others, job])
}

/**
 * Record a state change. Terminal states are forgotten rather than stored:
 * a finished job has nothing left to reattach to.
 */
export function updateAiJob(jobId: string, state: AiJobState): void {
  if (isTerminal(state)) {
    forgetAiJob(jobId)
    return
  }
  const jobs = readAll()
  const at = jobs.findIndex((j) => j.jobId === jobId)
  if (at < 0) return
  jobs[at] = { ...jobs[at], state }
  writeAll(jobs)
}

export function forgetAiJob(jobId: string): void {
  writeAll(readAll().filter((j) => j.jobId !== jobId))
}

/** Drop everything. Used by "forget this device" and by the tests. */
export function clearAiJobs(): void {
  writeAll([])
}
