-- Phase 18.2 (#89) — the evidence rate limiting is decided on.
--
-- #89 asks for per-address and per-project ceilings, and neither can be
-- counted from the tables that already exist.
--
-- `project_invitations` cannot do it: one row covers an invitation for its
-- whole life, `resent_at` holds only the LAST resend, and 18.1's unique
-- index means a repeated invitation to the same address does not even
-- insert. Counting rows would therefore count offers, while the thing being
-- limited is MESSAGES — and a sender who resends fifty times produces one
-- row and fifty e-mails.
--
-- So this table records sends, one row per message actually attempted. It is
-- the same shape of decision 17.3 made for `email_otp_codes`: a limit needs
-- evidence, and evidence has to be stored to be counted.
--
-- ## Why not extend email_otp_codes
--
-- That table exists for the code lifecycle — issue, consume, count attempts
-- — and rate limiting is a side effect of rows it needs anyway. Sign-in
-- codes keep their own limits there, unchanged. This table is about mail as
-- mail, and merging the two would tie the OTP lifecycle to a table that has
-- nothing to do with it.
--
-- ## It holds no content
--
-- Recipient, kind, scope, timestamp. Never a subject, never a body, never a
-- token. A leak of this table reveals who was written to and when, which is
-- the minimum a rate limiter can know and still work.

create table if not exists public.mail_sends (
  id         text        primary key,
  -- 'invitation' | 'sign-in-code' — kept open rather than a check
  -- constraint, because a new message type must not need a migration to be
  -- rate limited.
  kind       text        not null,
  -- Lowercased, as everywhere: an address that differs only in case is the
  -- same mailbox, and a limiter that disagrees is a limiter with a bypass.
  recipient  text        not null,
  -- What the send belongs to: the projectId for an invitation, '' when the
  -- message has no project (a sign-in code belongs to nobody).
  scope      text        not null default '',
  created_at timestamptz not null default now(),

  constraint mail_sends_recipient_lowercase
    check (recipient = lower(recipient)),
  constraint mail_sends_kind_not_blank
    check (length(kind) > 0)
);

comment on table public.mail_sends is
  'One row per message attempted. The evidence per-address and per-project rate limits are counted from (Phase 18.2).';

-- "How many messages has this address had in the last hour."
create index if not exists mail_sends_recipient_recent_idx
  on public.mail_sends (recipient, created_at desc);

-- "How many has this project sent in the last hour."
create index if not exists mail_sends_scope_recent_idx
  on public.mail_sends (scope, created_at desc)
  where scope <> '';

/* ---------------- row level security ---------------- */

-- Deny-all, as everywhere else: authorisation lives in /api and the browser
-- holds no Supabase credential (docs/authorisation-phase-16-3.md). Here it
-- also matters that a table of "who was e-mailed, and when" is not something
-- an anon key should ever be able to read.
alter table public.mail_sends enable row level security;

revoke all on public.mail_sends from anon, authenticated;
