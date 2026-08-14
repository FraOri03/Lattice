# Where authorisation lives

Phase 16.3 ([#83](https://github.com/FraOri03/Lattice/issues/83)). This
decision had to be closed before the Phase 17 schema is written, because
it determines how much of the existing endpoint logic survives.

## The question

Once Supabase arrives, does the browser talk to it directly — anon key
plus row level security — or only through `/api` with the service role?

## Decision

**Authorisation lives in `/api`, and only there.** The browser never holds
a Supabase credential. Row level security is enabled on every table and
grants nothing to `anon` or `authenticated`, so it is a *backstop against
a leaked key*, not the mechanism that decides who may do what.

## Where authorisation lives today

Worth stating plainly, because the decision is largely a question of
whether to add a second place rather than of choosing a first one.

| Piece | Where |
|---|---|
| Identity | Google access token, verified server-side against Google's tokeninfo with an audience check ([`api/_lib/realtime.ts`](../api/_lib/realtime.ts)) |
| Project ACL | Liveblocks room metadata: `ownerEmail` plus one list per role, writable only with `LIVEBLOCKS_SECRET_KEY` |
| Role → room permissions | [`roleAccess.ts`](../src/lib/collab/roleAccess.ts) |
| Role → capabilities | [`permissions.ts`](../src/lib/collab/permissions.ts) |
| Role → call capabilities | [`mediaPermissions.ts`](../src/lib/media/mediaPermissions.ts) |
| Enforcement | Liveblocks and LiveKit, on scopes baked into tokens the browser cannot mint |

Four serverless functions exist: `realtime/auth`, `realtime/rooms`,
`realtime/media-token`, `github/oauth`. The first three all follow one
shape — verify identity, load the ACL, decide with the shared matrix, act
— and `rooms` dispatches four actions inside a single function rather
than spreading them across files.

The three matrix modules are imported **verbatim** by both the browser and
the endpoints. That is deliberate: the browser can only ever *predict*
what the server will decide, never override it, and the two cannot drift
because there is only one copy.

## What decided it

**A trusted server tier is not optional.** Liveblocks access tokens and
LiveKit tokens must be minted with secrets that can never reach a browser,
and both are minted from the project ACL. RLS would therefore not
*replace* server-side authorisation; it would add a second surface beside
one that has to exist anyway — and the endpoints would still need to read
the ACL with the service role to mint those tokens. Two enforcement points
that must agree, where there is currently one.

**The permission matrix is a tested TypeScript module.** RLS means
re-expressing `permissions.ts` and `roleAccess.ts` as SQL policies, in a
language where they cannot be shared with the client, cannot be unit
tested by the existing suite, and cannot be read side by side with the UI
that predicts them. The single-copy property is the strongest thing the
current design has; spending it is the real cost of RLS, and it is not
recovered by any of the benefits.

**RLS needs a Supabase session, and Lattice's session is a Drive
session.** Policies key off `auth.uid()`, which requires Supabase Auth to
own sign-in. What the browser holds today is a Google *access* token from
the GIS token flow (`initTokenClient` / `requestAccessToken` in
[`AuthService.ts`](../src/lib/auth/AuthService.ts)) carrying the
`drive.file` scope; there is no ID token anywhere in the app, which is
what a Supabase session bootstrap would consume. Getting one means adding
a second Google flow and a second consent surface next to the most
failure-prone machinery in the codebase — silent refresh, gesture
gating, backoff — for no gain in what the user can do.

**These tables are not the hot path.** Phase 17 adds users, identities,
memberships and invitations: small, rarely written, security-critical.
Document content lives in Yjs, Liveblocks and Drive and never touches
Postgres. A serverless round-trip on a membership change is invisible; a
policy mistake on a membership table is not.

**The decision is asymmetrically reversible.** Opening one table to the
browser later is additive: write policies, hand out the anon key for that
table. Starting with RLS and centralising later means rewriting both the
policies and the client data layer that grew around them.

## What it costs, honestly

- **No Postgres subscriptions in the browser.** "Shared with me" and
  pending invitations cannot live-update straight from the database.
  Lattice already has a realtime bus (Liveblocks) and a polling provider,
  and Phase 18's invitations are e-mail-driven, so this is a small loss
  with an existing remedy — but it is a real one.
- **Endpoint code has to be written**, where PostgREST plus policies would
  have generated CRUD. Phase 17's surface is small (resolve identity, read
  and write membership, create and accept an invitation, list shared
  projects) and should follow the `rooms.ts` action-dispatch shape rather
  than one function per verb.
- **E-mail OTP gets harder.** Supabase Auth's OTP flow issues a *Supabase*
  session to the browser, which this decision says the browser must not
  hold. Phase 17 therefore needs Lattice-issued sessions: the endpoint
  verifies the code and sets its own signed cookie. That is the largest
  single cost here, and it is named in the Phase 17 scope rather than
  discovered inside it.
- **Deny-all RLS does not protect against endpoint bugs.** The service
  role bypasses policies by definition. It protects against a leaked or
  misused anon key and against accidental direct access, nothing more.
  Endpoint bugs are held off by the shape every endpoint already shares —
  verify identity, load the ACL, decide with the shared matrix — and by
  testing that shape, not by SQL.

## What survives of the existing endpoints

All of it. This is the point of the decision.

| Today | After Phase 17 |
|---|---|
| `requireIdentity` — Google token verified against Google | unchanged; gains a branch for a Lattice session cookie when OTP ships |
| `loadAcl` — reads Liveblocks room metadata | same signature, reads Postgres instead |
| `roleOf`, `addEmail`, `stripEmail` | replaced by queries; the call sites do not move |
| `permissionsForRole`, `can`, `canManageRole`, `assignableRoles` | untouched, still shared verbatim with the browser |
| Token minting (Liveblocks, LiveKit) | untouched |
| `rooms.ts` action dispatch | untouched in shape; `set-role` starts taking a `userId` (see [#82](https://github.com/FraOri03/Lattice/issues/82)) |

The ACL changes where it is stored, not who reads it or how the answer is
computed.

## What this does not settle

- **Who issues the session.** This decision constrains it — whatever
  issues it, the browser must not end up holding a credential that grants
  direct table access — but the choice between a Lattice-signed cookie and
  a server-held Supabase session is Phase 17's.
- **Table shapes.** Phase 17.
- **The ACL key.** Moving memberships from e-mail to `userId` is
  [#82](https://github.com/FraOri03/Lattice/issues/82); it now has a
  server that can answer "which user is this address" for someone other
  than yourself, which is what it was waiting for.

## Revisit if

- A surface genuinely needs browser-side subscriptions on Postgres rows,
  and the existing realtime bus cannot serve it. Revisit **for that table
  only**, with explicit policies; do not reopen the default.
- The endpoint tier becomes a latency problem for something a user waits
  on. Membership and invitations are not that; a future surface might be.
