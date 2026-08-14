# The database

What Lattice keeps in Postgres, what it deliberately does not, and how the
rest of the code reaches it.

Introduced in Phase 17.1
([#84](https://github.com/FraOri03/Lattice/issues/84)). The decision that
shaped it is [16.3](authorisation-phase-16-3.md); the model it stores is
[16.1](identity.md) and [16.2](collaboration.md#who-a-membership-belongs-to).

## What lives here

Seven tables, and they have one thing in common: they are small, rarely
written, and security-critical.

| Table | Holds |
|---|---|
| `users` | the person — opaque id, address, display name |
| `user_identities` | one proven way of signing in as that person |
| `project_memberships` | one ACL slot: address, role, and the userId that claimed it |
| `project_invitations` | an offer of membership that nobody has accepted yet |
| `entitlements` | account-level plan (storage seam only — Phase 27 owns billing) |
| `sessions` | a Lattice-issued session; the cookie token is hashed, never stored ([17.2](sessions.md)) |
| `email_otp_codes` | one-time sign-in codes, scrypt-hashed and rate-limited ([17.3](email-otp.md)) |

**Document content is not here and will not be.** Docs, boards, sheets,
code and presentations live in Yjs, Liveblocks and Google Drive. Postgres
never sees them. That is what makes a serverless round-trip in front of
these tables affordable: a membership change costs a request nobody is
waiting on, while a policy mistake on a membership table is not something
you get to notice later.

## How the rest of the code reaches it

Through four interfaces in
[`api/_lib/db/repositories.ts`](../api/_lib/db/repositories.ts), never
through Supabase directly:

```ts
const db = repositories()
if (!db) { sendError(res, 501, NO_DATABASE); return }

const acl = await db.memberships.aclOf(projectId)
```

There are two implementations. [`supabase.ts`](../api/_lib/db/supabase.ts)
is the real one and the only module in the codebase that knows Supabase
exists. [`memory.ts`](../api/_lib/db/memory.ts) is a second real
implementation, not a mock, and the contract suite runs against both — which
is the only honest way to check the claim that nothing above these
interfaces depends on the database.

`repositories()` returns **null** when the deployment has no database, the
same shape `liveblocksClient()` already has. Lattice is local-first: a
deployment without Supabase keeps working exactly as it did before this
phase.

## Why the service role, and not row level security

Settled in [16.3](authorisation-phase-16-3.md), and worth restating because
the schema looks unusual without it:

**RLS is enabled on every table with no policies at all.** `anon` and
`authenticated` can read and write nothing. That is not how authorisation
happens — authorisation lives in `/api`, using the permission matrix in
`permissions.ts` and `roleAccess.ts` that the browser shares verbatim. RLS
here is a *backstop against a leaked key*, and the grants are revoked too so
that a policy added by accident still finds no privilege to use.

The endpoints therefore hold a key that bypasses RLS, and the browser holds
none. The honest cost is named in 16.3: no Postgres subscriptions in the
browser, and endpoint code where PostgREST would have generated CRUD.

## Three decisions worth knowing

**Ids are text, and assigned rather than generated.** `users.id` is the id
`newUserId()` already minted (`usr_<hash>`), and 16.1's migration preserves
pre-existing `acc_<google-sub>` ids because they are stamped on every member
row, comment author and activity entry users already hold — including rows
in other people's browsers. A generated uuid would have orphaned all of it.

**Timestamps are written by the caller, not by a trigger.** The identity
rules in [`identity.ts`](../src/lib/auth/identity.ts) are pure functions of
`(records, claim)` that compute their own timestamps and are shared verbatim
with the browser. A trigger overwriting them would make the database
disagree with the module under test. The domain counts epoch milliseconds
and Postgres stores `timestamptz`; the translation lives in
[`rows.ts`](../api/_lib/db/rows.ts) and nowhere else.

**The pure rules run unchanged over Postgres.** `IdentityRepository` exposes
`recordsForClaim()` — the handful of records a given sign-in can possibly
touch — rather than a `resolve()` that would re-express convergence and
containment in SQL. `resolveClaim` then runs exactly as it does in the
browser, so the tests that guard the two rules that must not be got wrong
are testing the code that actually runs.

## Invariants the schema enforces

Not conventions — indexes and constraints, so a bug cannot produce the
state rather than merely being unlikely to.

- **One owner per project.** `RoomAcl.ownerEmail` is a single value; a
  partial unique index makes that true of the rows as well.
- **One pending invitation per address per project.** `InviteService`
  already returns the existing invite rather than minting a second; the
  index makes that an invariant instead of a race.
- **One verified address per provider.** Two different users can never both
  hold verified `google:ada@example.com`. Convergence still works, because
  it links an identity of a *different* provider to the same user.
- **A binding is never re-bound.** `bind()` carries `is('user_id', null)` in
  its WHERE clause, so a slot someone else claimed first is simply not
  matched — 16.2's rule enforced by the statement rather than by a
  read-then-write.

## Migrations

They live in [`supabase/migrations`](../supabase/migrations) and reach the
production database through the **Supabase GitHub integration on merge to
`main`** — not from anyone's laptop. The integration is configured with
working directory `.` and production branch `main`.

Branching (a preview database per pull request) needs the Pro plan and is
off, so a pull request touching the schema is reviewed as SQL and applied
when it lands.

Which variable belongs in which environment, and how to rotate a key
without an outage, is [deploy-and-secrets.md](deploy-and-secrets.md).

`supabase/config.toml` is deliberately minimal: it enables the Data API
(which the *server* uses), the database and Studio, and leaves Auth,
Storage and Realtime off, because each of those is something Lattice has
already decided not to use. Read the header of that file for why.

## Honest limits

- **Nothing reads these tables yet.** 17.1 is the schema and the seam;
  [17.2](https://github.com/FraOri03/Lattice/issues/85) moves the endpoints
  onto a server session and
  [17.3](https://github.com/FraOri03/Lattice/issues/86) adds e-mail OTP. The
  ACL is still stored in Liveblocks room metadata until then.
- **`entitlements` is a storage seam, not a feature.** Phase 27
  ([#103](https://github.com/FraOri03/Lattice/issues/103)–#106) owns what
  the values mean. Every account is implicitly `free` until something reads
  one.
- **`replaceAcl` is last-write-wins**, exactly as writing Liveblocks room
  metadata is today. `setRole` and `bind` touch one row and are the ones to
  use where a concurrent change to a different member must not be lost.
- **Transferring ownership is two statements**, so a lost race leaves a
  project with no owner rather than two — visible, and repairable by the
  same action.
