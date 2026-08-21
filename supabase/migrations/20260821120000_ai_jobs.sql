-- Phase 21.1 (#100) — the ledger line for a GPU job.
--
-- Polling can tell a browser how its job is doing. It cannot tell anyone
-- anything about a job whose browser is gone, and that is the case this
-- table exists for: a generation costs money, takes up to a few minutes,
-- and the tab that started it may be closed long before RunPod finishes.
-- Without a row here, such a job leaves no trace at all — no evidence it
-- ran, no evidence it was paid for, and nothing for 21.10 to reconcile.
--
-- ## It is NOT how a poll is authorised
--
-- That is the signed ticket in `api/_lib/ai.ts`. The distinction matters:
-- every backend in this project is optional, and AI has to keep working on
-- a deployment with no database, exactly as realtime and mail do. Making
-- `/api/ai/status` depend on a row would have quietly made Postgres
-- mandatory for a feature that does not need it.
--
-- ## It holds no content
--
-- No prompt, no input, no output. Who ran which action, on which class of
-- hardware, when, and how it ended. A leak of this table reveals that an
-- account ran an upscale at 14:02, which is the least a ledger can say and
-- still be one. Where the result lives is 21.5's question.

create table if not exists public.ai_jobs (
  -- RunPod's job id. Ours would be a second identifier for the same thing,
  -- and the callback only ever knows this one.
  id                  text        primary key,
  -- The identity provider's subject, not the e-mail: an address can change
  -- hands, and a ledger that follows the address would follow it to the
  -- wrong person.
  subject             text        not null,
  -- From the action catalogue (src/lib/ai/actions.ts). Text rather than an
  -- enum: a new action must not need a migration to be billable.
  action_id           text        not null,
  -- 'light' | 'standard' | 'heavy' — the cost lever, recorded so the spend
  -- can be attributed to the choice rather than guessed at afterwards.
  gpu_class           text        not null,
  project_id          text        not null,
  state               text        not null,
  -- HMAC of the webhook token, never the token. The callback proves it holds
  -- the token; the table only has to be able to check, and a leak of it must
  -- not let anyone close somebody else's job.
  callback_token_hash text        not null,
  submitted_at        timestamptz not null default now(),
  deadline_at         timestamptz not null,
  -- Null while the job is open. Every "is this still running" question is
  -- this column, which is why it is indexed rather than derived from `state`.
  closed_at           timestamptz,
  failure_reason      text,
  execution_ms        integer,

  constraint ai_jobs_state_not_blank check (length(state) > 0),
  -- A closed job has a reason to have closed. Keeping the two in step in SQL
  -- means a partially-applied close is not representable.
  constraint ai_jobs_closed_has_state
    check (closed_at is null or state <> 'queued')
);

comment on table public.ai_jobs is
  'One row per AI job submitted to a hosted GPU backend. The record a completion webhook closes when the browser is gone (Phase 21.1).';

-- "What is this account still waiting on" — the reattachment question, and
-- what 21.10 reconciles against.
create index if not exists ai_jobs_open_idx
  on public.ai_jobs (subject, submitted_at desc)
  where closed_at is null;

/* ---------------- row level security ---------------- */

-- Deny-all, as everywhere else: authorisation lives in /api and the browser
-- holds no Supabase credential (docs/authorisation-phase-16-3.md).
alter table public.ai_jobs enable row level security;

revoke all on public.ai_jobs from anon, authenticated;
