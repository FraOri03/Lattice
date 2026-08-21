import type { AiActionId, GpuClass } from '../lib/ai/actions.js'
import type { AiFailureReason, AiJobState } from '../lib/ai/jobModel.js'

/**
 * The server's record of one AI job (Phase 21.1, #100).
 *
 * It exists for the thing polling cannot do: close a job whose browser
 * never came back. A generation that costs money and ends while the tab is
 * shut would otherwise leave nothing behind at all — no evidence it ran, no
 * evidence it was paid for, and nothing for 21.10 to reconcile. The
 * completion webhook writes here.
 *
 * It is deliberately NOT how a poll is authorised: that is the signed
 * ticket in `api/_lib/ai.ts`, so a deployment with no database still gets
 * working AI, exactly as it still gets working realtime and mail.
 *
 * Holds no prompt, no input, no output bytes. What was generated and where
 * it lives is 21.5's question; this is the ledger line, and a leak of it
 * reveals that an account ran an upscale at a time, which is the least a
 * ledger can say and still be one.
 */
export interface AiJobRecord {
  /** RunPod's id — the only handle that exists for the job. */
  jobId: string
  /**
   * Who ran it: the identity provider's subject, the same value
   * `VerifiedIdentity.sub` carries. Not the e-mail, which can change hands.
   */
  subject: string
  actionId: AiActionId
  gpuClass: GpuClass
  projectId: string
  state: AiJobState
  /** HMAC of the webhook token, never the token itself. */
  callbackTokenHash: string
  submittedAt: number
  deadlineAt: number
  /** When it reached a terminal state; null while it is still open. */
  closedAt: number | null
  failureReason: AiFailureReason | null
  /** Worker milliseconds RunPod reported. What 21.4 will price. */
  executionMs: number | null
}

/** The patch a terminal event applies. */
export interface AiJobClosure {
  state: AiJobState
  closedAt: number
  failureReason?: AiFailureReason | null
  executionMs?: number | null
}
