-- Phase 17.3 (#86) — e-mail one-time codes.
--
-- A second way to prove an address, on the session 17.2 already issues.
-- Nothing about sessions changes here; this table only holds the codes and
-- the evidence needed to rate-limit them.
--
-- ## The code is not stored
--
-- `code_hash` is scrypt, salted with the address. Six digits is a million
-- possibilities — a plain SHA-256 of one is reversible by a laptop in a
-- moment, so the slow KDF is what makes a leaked dump of this table not
-- also a leak of every code in flight.
--
-- ## Why rows survive being used
--
-- A consumed or expired code is kept rather than deleted, because this
-- table is also the rate-limiting evidence: "how many codes has this
-- address asked for in the last hour" has no answer if the rows are gone.
-- Old rows are dead weight, not a liability — they hold no code, only the
-- fact that one existed.

create table if not exists public.email_otp_codes (
  id           text        primary key,
  email        text        not null,
  -- scrypt(code, salt = email). Never the code.
  code_hash    text        not null,

  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  -- Set the moment a code is accepted OR superseded by a newer request:
  -- either way it must never be usable again.
  consumed_at  timestamptz,
  -- Wrong guesses against THIS code. A ceiling here is what stops six
  -- digits from being brute-forced in the ten minutes they live.
  attempts     integer     not null default 0,
  -- Coarse, and only ever used to count requests per source.
  request_ip   text        not null default '',

  constraint email_otp_codes_email_lowercase
    check (email = lower(email)),
  constraint email_otp_codes_attempts_sane
    check (attempts >= 0)
);

comment on table public.email_otp_codes is
  'E-mail one-time codes. Hashed with scrypt, single use, rate-limited (Phase 17.3).';

-- The verification lookup: the live code for this address.
create index if not exists email_otp_codes_live_idx
  on public.email_otp_codes (email, expires_at)
  where consumed_at is null;

-- Rate limiting, per address and per source.
create index if not exists email_otp_codes_email_recent_idx
  on public.email_otp_codes (email, created_at desc);

create index if not exists email_otp_codes_ip_recent_idx
  on public.email_otp_codes (request_ip, created_at desc)
  where request_ip <> '';

/* ---------------- row level security ---------------- */

-- Deny-all, as everywhere else: authorisation lives in /api and the
-- browser holds no Supabase credential (docs/authorisation-phase-16-3.md).
-- Especially here — a table anon could read is a table anon could sign in
-- from.
alter table public.email_otp_codes enable row level security;

revoke all on public.email_otp_codes from anon, authenticated;
