-- Phase 17.2 (#85) — server sessions.
--
-- Until now the browser proved who it was by sending its Google OAuth
-- access token in the body of every request. That made a Google credential
-- the app's own authentication credential: it lived in `localStorage` where
-- any script on the page could read it, it travelled on every realtime
-- call, and there was no way to end a session — Lattice had nothing to
-- revoke, because it had never issued anything.
--
-- A session is now Lattice's own. The browser holds an opaque token in an
-- HttpOnly cookie it cannot read, and this table is what that token points
-- at.
--
-- ## The token is not stored here
--
-- `token_hash` is the SHA-256 of the cookie value. A dump of this table
-- therefore grants nobody a session, which is the difference between
-- leaking a list of session ids and leaking a list of passwords. The same
-- goes for `csrf_hash`.
--
-- ## Why the provider claim is copied onto the row
--
-- The endpoints resolve a caller to a role through `principalOf()`, which
-- needs the verified provider subject and address. Copying them here means
-- a session reconstructs exactly the identity the Google path produced, so
-- `roleOf` and the whole permission matrix are untouched by this phase —
-- which is what 16.3 promised would survive.

create table if not exists public.sessions (
  id               text primary key,
  user_id          text        not null references public.users (id) on delete cascade,

  -- SHA-256 of the cookie token, never the token itself.
  token_hash       text        not null unique,
  -- SHA-256 of the CSRF token handed to the client.
  csrf_hash        text        not null,

  -- The verified claim this session was minted from.
  provider         text        not null,
  provider_subject text        not null default '',
  email            text        not null,
  display_name     text        not null default '',
  avatar_url       text        not null default '',

  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  expires_at       timestamptz not null,
  -- Set rather than deleted: a revoked session that is still readable is
  -- how "signed out everywhere at 14:02" stays answerable.
  revoked_at       timestamptz,
  -- Coarse, for the user's own "where am I signed in" list. Never parsed.
  user_agent       text        not null default '',

  constraint sessions_provider_known
    check (provider in ('google', 'email', 'mock')),
  constraint sessions_email_lowercase
    check (email = lower(email))
);

comment on table public.sessions is
  'A Lattice-issued session. The cookie token is hashed, never stored (Phase 17.2).';

-- Sign out on every device: one statement, keyed by the person.
create index if not exists sessions_user_idx
  on public.sessions (user_id);

-- Only live sessions are ever resolved; this is the index that lookup uses.
create index if not exists sessions_live_idx
  on public.sessions (expires_at)
  where revoked_at is null;

/* ---------------- row level security ---------------- */

-- Deny-all, as with every other table: authorisation lives in /api and the
-- browser holds no Supabase credential (docs/authorisation-phase-16-3.md).
alter table public.sessions enable row level security;

revoke all on public.sessions from anon, authenticated;
