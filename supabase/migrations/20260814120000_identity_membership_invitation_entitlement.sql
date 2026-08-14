-- Phase 17.1 (#84) — the first schema.
--
-- Four things move into Postgres: who a person is (users, user_identities),
-- what they may do in a project (project_memberships), the invitations that
-- open a membership (project_invitations), and what their account is
-- entitled to (entitlements).
--
-- What does NOT move: document content. Docs, boards, sheets, code and
-- presentations live in Yjs/Liveblocks and Google Drive and never touch
-- this database. These tables are small, rarely written and
-- security-critical — which is exactly why the 16.3 decision put a
-- serverless round-trip in front of them rather than row level security.
--
-- ## Row level security
--
-- Every table below enables RLS and defines NO policies, so `anon` and
-- `authenticated` can read and write nothing. That is not the authorisation
-- mechanism: authorisation lives in /api and only there
-- (docs/authorisation-phase-16-3.md). It is a backstop against a leaked or
-- misused anon key. The service role bypasses RLS by definition, which is
-- how the endpoints reach these rows at all.
--
-- ## Timestamps
--
-- `updated_at` is written by the caller, not by a trigger. The identity
-- rules in src/lib/auth/identity.ts are pure functions of (records, claim)
-- that compute their own timestamps, and are shared verbatim between the
-- browser and the endpoints. A trigger overwriting them would make the
-- database disagree with the module under test.

/* ---------------- users ---------------- */

-- The person. Nothing here names a provider — that is the point of 16.1.
create table if not exists public.users (
  -- TEXT, not uuid, and assigned rather than generated. Ids are already
  -- minted by `newUserId()` as `usr_<hash>`, and 16.1's migration preserves
  -- pre-existing `acc_<google-sub>` ids because they are stamped on every
  -- member row, comment author and activity entry users already hold —
  -- including rows in other people's browsers. A generated uuid here would
  -- orphan all of it for a cosmetic gain.
  id            text primary key,
  -- Where invitations and notifications go. Filled in when missing, never
  -- silently replaced; it follows the primary identity and is not itself
  -- an identifier.
  primary_email text        not null default '',
  display_name  text        not null default '',
  avatar_url    text        not null default '',
  usage_type    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint users_id_not_blank
    check (length(id) > 0),
  constraint users_primary_email_lowercase
    check (primary_email = lower(primary_email)),
  constraint users_usage_type_known
    check (usage_type is null or usage_type in ('personal', 'work', 'education'))
);

comment on table public.users is
  'A person. Opaque, durable id; never re-derived from a provider (Phase 16.1).';

-- "Which user holds this address" — the question 16.2 needed a server to
-- answer for somebody other than yourself.
create index if not exists users_primary_email_idx
  on public.users (primary_email)
  where primary_email <> '';

/* ---------------- user identities ---------------- */

-- One proven way of signing in as a given user. One user, several
-- identities: Google today, e-mail OTP in #86.
create table if not exists public.user_identities (
  id               text primary key,
  user_id          text        not null references public.users (id) on delete cascade,
  provider         text        not null,
  -- The provider's own id for this person (Google's `sub`). Empty string is
  -- a PLACEHOLDER: the identity is known to exist but its subject was not
  -- recoverable, and the next real sign-in fills it in rather than adding a
  -- second row — step 2 of `resolveClaim`.
  provider_subject text        not null default '',
  email            text        not null default '',
  -- When the provider vouched for `email`, or null when nobody has. Only a
  -- verified address may converge onto an existing user; an unverified
  -- claim on owner@company.com must never inherit that account.
  verified_at      timestamptz,

  constraint user_identities_provider_known
    check (provider in ('google', 'email', 'mock')),
  constraint user_identities_email_lowercase
    check (email = lower(email))
);

comment on table public.user_identities is
  'One proven sign-in method for a user. Convergence and containment rules live in src/lib/auth/identity.ts.';

-- Step 1 of `resolveClaim` — the ordinary re-sign-in — and the constraint
-- that stops one provider subject from being split across two users.
-- Partial, because '' is the placeholder value and several may coexist.
create unique index if not exists user_identities_provider_subject_key
  on public.user_identities (provider, provider_subject)
  where provider_subject <> '';

-- CONTAINMENT, enforced by the database rather than only by the caller: a
-- verified address may exist once per provider, so two different users can
-- never both hold verified google:ada@example.com. Convergence still works
-- — it adds an identity of a DIFFERENT provider to the same user, which
-- this index permits by construction.
create unique index if not exists user_identities_verified_email_key
  on public.user_identities (provider, email)
  where verified_at is not null and email <> '';

-- Step 3 of `resolveClaim`: find a verified address already known to
-- someone, across providers.
create index if not exists user_identities_verified_lookup_idx
  on public.user_identities (email)
  where verified_at is not null;

create index if not exists user_identities_user_idx
  on public.user_identities (user_id);

/* ---------------- project memberships ---------------- */

-- The project ACL, moving off Liveblocks room metadata.
--
-- The row IS 16.2's model: a slot opened with an address, optionally BOUND
-- to the userId that proved it. `user_id is null` means "nobody has claimed
-- this address yet", which is what an open invitation is; once bound, the
-- slot answers only to that userId and a reassigned address can no longer
-- inherit the membership.
create table if not exists public.project_memberships (
  project_id text        not null,
  email      text        not null,
  role       text        not null,
  -- The binding. Cascades on user deletion rather than reverting to null:
  -- unbinding would reopen the slot to whoever holds the address today,
  -- which is precisely the behaviour 16.2 removed.
  user_id    text        references public.users (id) on delete cascade,
  invited_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (project_id, email),

  constraint project_memberships_role_known
    check (role in ('owner', 'admin', 'editor', 'commenter', 'viewer')),
  constraint project_memberships_email_lowercase
    check (email = lower(email))
);

comment on table public.project_memberships is
  'One ACL slot: an address, its role, and the userId that has claimed it (Phase 16.2).';

-- `RoomAcl.ownerEmail` is a single value, not a list. Making that an index
-- rather than a convention means a bug cannot produce a project with two
-- owners and no way to resolve which one wins.
create unique index if not exists project_memberships_single_owner
  on public.project_memberships (project_id)
  where role = 'owner';

-- "Which projects is this person a member of" — what "Shared with me"
-- needs in Phase 18, and what the dashboard cannot answer today.
create index if not exists project_memberships_user_idx
  on public.project_memberships (user_id)
  where user_id is not null;

/* ---------------- project invitations ---------------- */

create table if not exists public.project_invitations (
  id              text primary key,
  project_id      text        not null,
  email           text        not null,
  role            text        not null,
  -- Opaque, carried by the invite link. Unique because it is a credential:
  -- presenting it is what accepts the invitation.
  token           text        not null unique,
  status          text        not null default 'pending',
  invited_by      text        references public.users (id) on delete set null,
  invited_by_name text        not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  resent_at       timestamptz,
  accepted_at     timestamptz,
  expires_at      timestamptz,

  constraint project_invitations_role_known
    check (role in ('owner', 'admin', 'editor', 'commenter', 'viewer')),
  constraint project_invitations_status_known
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  constraint project_invitations_email_lowercase
    check (email = lower(email)),
  -- An accepted invitation without a timestamp is a row nobody can audit.
  constraint project_invitations_accepted_has_timestamp
    check (status <> 'accepted' or accepted_at is not null)
);

comment on table public.project_invitations is
  'A pending offer of membership. Delivery by e-mail is Phase 18; this is the record it will send.';

-- InviteService.create() already returns the existing pending invite rather
-- than minting a second one. This makes that intent an invariant instead of
-- a race: two concurrent invites to the same address cannot both land.
create unique index if not exists project_invitations_single_pending
  on public.project_invitations (project_id, email)
  where status = 'pending';

create index if not exists project_invitations_project_idx
  on public.project_invitations (project_id);

-- "Which invitations are waiting for me" — pending invites on the
-- dashboard, which Phase 18 unlocks.
create index if not exists project_invitations_pending_email_idx
  on public.project_invitations (email)
  where status = 'pending';

/* ---------------- entitlements ---------------- */

-- What an account is allowed to do, as opposed to what a member may do
-- inside one project.
--
-- HONEST SCOPE: Phase 27 (#103–#106) owns billing and the meaning of every
-- value below. This table exists now because #84 is where the storage seam
-- is drawn, and an adapter with no table behind it would be a lie. Nothing
-- reads it yet; every account is implicitly `free` until something does.
create table if not exists public.entitlements (
  user_id            text primary key references public.users (id) on delete cascade,
  plan               text        not null default 'free',
  status             text        not null default 'active',
  -- Where the entitlement came from — 'manual' until a billing provider
  -- exists to name.
  source             text        not null default 'manual',
  current_period_end timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint entitlements_plan_known
    check (plan in ('free', 'pro', 'team')),
  constraint entitlements_status_known
    check (status in ('active', 'past_due', 'canceled'))
);

comment on table public.entitlements is
  'Account-level plan. Storage seam only — Phase 27 owns billing semantics.';

/* ---------------- row level security ---------------- */

-- Enabled with no policies: deny-all for anon and authenticated. Read the
-- block at the top of this file for why this is a backstop and not the
-- authorisation mechanism.
alter table public.users               enable row level security;
alter table public.user_identities     enable row level security;
alter table public.project_memberships enable row level security;
alter table public.project_invitations enable row level security;
alter table public.entitlements        enable row level security;

-- Belt and braces: RLS already denies these roles, and revoking the grants
-- means a future policy added by accident still finds no privilege to use.
revoke all on public.users               from anon, authenticated;
revoke all on public.user_identities     from anon, authenticated;
revoke all on public.project_memberships from anon, authenticated;
revoke all on public.project_invitations from anon, authenticated;
revoke all on public.entitlements        from anon, authenticated;
