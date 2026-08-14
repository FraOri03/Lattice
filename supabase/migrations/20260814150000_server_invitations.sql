-- Phase 18.1 (#88) — the invitation becomes a server record.
--
-- 17.1 created `project_invitations` as the row Phase 18 would send. Sending
-- it changes what the row has to be: the recipient is by definition another
-- browser, so the token stops being a value one device recognises and
-- becomes a credential travelling through a mailbox.
--
-- Four changes, and each one is a thing the old shape could not express.
--
-- ## The token is stored as a hash
--
-- `token` held the value the link carries. That was defensible while the
-- invitation never left the browser that made it; it is not defensible for
-- something mailed, because a leaked dump of this table would then be a set
-- of live invitations anybody could accept. Sessions (17.2) and one-time
-- codes (17.3) already store only a digest, and an invitation is the same
-- kind of secret.
--
-- SHA-256 and not scrypt, deliberately, and the difference from
-- `email_otp_codes` is the input rather than the intent: a one-time code is
-- six digits, a space a laptop enumerates instantly, so it needs a slow KDF.
-- A token is 32 bytes from the CSPRNG — there is nothing to enumerate, and a
-- fast hash of it is as unguessable as the token itself.
--
-- Existing rows are hashed in place rather than dropped, so an invitation
-- created before this migration keeps working: the endpoint hashes what the
-- link presents and compares digests, and the old link still hashes to the
-- stored value.
--
-- ## `declined` exists
--
-- A recipient saying no was unrepresentable, so the only way to record it
-- was `revoked` — which says the sender changed their mind, about a decision
-- the recipient made. Two different facts sharing one value is a lie in the
-- audit trail.
--
-- ## Who accepted, not only when
--
-- `accepted_at` recorded that an acceptance happened and nothing about who
-- performed it. That is the one fact an audit of a membership actually wants,
-- and it is what 18.3 will write when it verifies the address.
--
-- ## Expiry is real
--
-- `expires_at` existed and nothing ever set it, so every invitation was
-- eternal and the `expired` status was unreachable — which is why the
-- dashboard refuses to show that badge (src/lib/dashboard/honestSections.ts).
-- Rows are backfilled and the column becomes NOT NULL, so an invitation
-- without a deadline can no longer be written.
--
-- No default is attached: like every other timestamp in this schema, the
-- caller computes it, because the TTL lives in the pure module the browser
-- and the endpoint share (`INVITE_TTL_MS` in src/lib/collab/invitations.ts).
-- A default here would be a second copy of that number, free to drift.

/* ---------------- the token becomes a digest ---------------- */

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'project_invitations'
       and column_name = 'token'
  ) then
    -- `encode(sha256(convert_to(t, 'UTF8')), 'hex')` is byte-for-byte what
    -- `hashToken()` in api/_lib/session.ts produces. The guard skips values
    -- that are already digests, so re-running this migration cannot hash a
    -- hash.
    update public.project_invitations
       set token = encode(sha256(convert_to(token, 'UTF8')), 'hex')
     where token !~ '^[0-9a-f]{64}$';

    alter table public.project_invitations rename column token to token_hash;
  end if;
end $$;

/* ---------------- declined ---------------- */

alter table public.project_invitations
  drop constraint if exists project_invitations_status_known;

alter table public.project_invitations
  add constraint project_invitations_status_known
  check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired'));

/* ---------------- who accepted ---------------- */

-- `on delete set null` rather than cascade: deleting an account must not
-- delete the record that a membership was once granted. The row keeps the
-- address and the timestamp, and only loses the pointer.
alter table public.project_invitations
  add column if not exists accepted_by text references public.users (id) on delete set null;

-- An accepted invitation names its acceptor, or the audit trail has a hole
-- exactly where it matters. Rows accepted before this migration cannot be
-- attributed after the fact, so they are exempt by their timestamp rather
-- than by weakening the rule for everyone.
alter table public.project_invitations
  drop constraint if exists project_invitations_accepted_has_actor;

alter table public.project_invitations
  add constraint project_invitations_accepted_has_actor
  check (
    status <> 'accepted'
    or accepted_by is not null
    or accepted_at < timestamptz '2026-08-14 15:00:00+00'
  );

/* ---------------- expiry ---------------- */

-- 14 days, the same number `INVITE_TTL_MS` carries. Applied only to rows
-- that never got one, so a deadline already written is never moved.
update public.project_invitations
   set expires_at = created_at + interval '14 days'
 where expires_at is null;

alter table public.project_invitations
  alter column expires_at set not null;

comment on table public.project_invitations is
  'A pending offer of membership: hashed token, real deadline, and who accepted it (Phase 18.1).';
