# Invitations

An offer of membership that outlives the browser that made it.

Phase 18.1 ([#88](https://github.com/FraOri03/Lattice/issues/88)). Built on
[17.1](database.md)'s schema and [16.2](collaboration.md)'s membership slots.

## The problem it fixes

`InviteService` generated the token in the browser and looked it up in
`collabStore`. That works exactly as long as the invitation never leaves the
device that created it — and the recipient of a mailed invitation is, by
definition, on another one. `findByToken` searched a store the recipient does
not have, so a mailed invite could not work *by construction*, not by
oversight.

So the record moved. The server mints the token, stores its digest, owns the
deadline, and answers for a link opened anywhere.

## The endpoint

```
POST /api/invitations

  { action: 'create',   projectId, email, role }  → 201 { invite, token }
  { action: 'list',     projectId }               → { invites }
  { action: 'resend',   projectId, inviteId }     → { invite, token }
  { action: 'revoke',   projectId, inviteId }     → { invite }
  { action: 'set-role', projectId, inviteId, role } → { invite }

  { action: 'resolve',  token }                   → { invite }
  { action: 'decline',  token }                   → { invite }
```

The first five are member actions: the caller's role is read from the project
ACL and evaluated against the shared permission matrix
(`src/lib/collab/permissions.ts`), server-side, exactly as
`api/realtime/rooms` already does. `members.manage` is the bar for all of
them, listing included — an invitation names somebody who is not in the
project yet, so who has been approached is not a fact every viewer is
entitled to.

The last two are authenticated by the **token itself**, and deliberately need
no session: the recipient of a link has no account yet, and requiring one
before they can see what they are being offered gets the order wrong.

## The token is a credential now

32 bytes from the CSPRNG, SHA-256 before storage, and returned **exactly
once** — in the reply to `create` and `resend`, the only moment a link can be
built. Every other response goes through `redact()`, so a listing cannot leak
a live credential by accident.

SHA-256 rather than the scrypt used for [one-time codes](email-otp.md), and
the difference is the input rather than the intent: six digits is a space a
laptop enumerates instantly and needs a slow KDF, while 32 random bytes has
nothing to enumerate.

**Resending rotates the token, and the previous link stops working.** Not a
preference — the server holds a digest, so it cannot reproduce the old link
to put in a new message. A resend that kept the token could never be sent.

The consequence is visible in the UI: the raw token survives only on the
device that minted it, so `linkFor()` returns `null` elsewhere and the app
offers a resend instead of a link that opens nothing.

## Expiry is real

`expires_at` existed since 17.1 and nothing ever wrote it, so every
invitation was eternal and the `expired` status was unreachable. From 18.1 the
column is `NOT NULL`, `INVITE_TTL_MS` is 14 days, and the rule lives in
`src/lib/collab/invitations.ts` — pure, and shared verbatim between the
browser and the endpoint.

The clock decides, not the column. A deadline that passed does not write
itself, so `effectiveStatus()` applies the clock on every read; the endpoint
persists the transition the first time it observes one. That is a lazy sweep,
which is why 18.1 needs no cron job.

## The audit trail

| Fact | Column |
|---|---|
| who was offered what | `email`, `role` |
| who offered it | `invited_by` → `users.id`, `invited_by_name` |
| when, and until when | `created_at`, `resent_at`, `expires_at` |
| who accepted, and when | `accepted_by` → `users.id`, `accepted_at` |
| how it ended | `status` |

`declined` is new, and it exists because the recipient's answer and the
sender's withdrawal were sharing one value. "They said no" and "we changed our
mind" are different facts, and an audit trail that cannot tell them apart is
lying about one of them.

`invited_by` resolves only through a **verified** address: an unverified claim
on an address must not be able to sign an audit entry as the person who owns
it. When it resolves to nobody the record keeps the display name and loses
only the pointer — a weaker trail, but an honest one.

## What 18.1 deliberately does not do

**Acceptance.** [18.3 (#90)](https://github.com/FraOri03/Lattice/issues/90)
owns it, because accepting is where the address has to be *proved*, and
today's client-side `accept()` does not prove it: it adds whoever is signed in
right now. An accept action on this endpoint would be that same hole reachable
from any browser holding a token — strictly worse than the local one it would
have replaced. So `resolve` reports and grants nothing, and a link resolved
from the server shows the invitation and stops.

**Delivery.** [18.2 (#89)](https://github.com/FraOri03/Lattice/issues/89) owns
the mail, and has since shipped: `create` and `resend` send the invitation and
report `delivery` next to it. See [mail.md](mail.md) for the templates, the
localisation and the ceilings. What 18.1 produces — the record, the deadline
and the link — is unchanged by it.

**"What is waiting for my address."**
[18.4 (#91)](https://github.com/FraOri03/Lattice/issues/91) owns that index.
`InvitationRepository.pendingFor()` has existed since 17.1 and is still not
exposed, which is why the dashboard's Received tab is still honestly
unavailable.

## The local tier did not go away

A Lattice with no database still collaborates over a shared browser or a
shared Drive, and invitations there keep working exactly as before: the client
mints its own token, keeps it in `collabStore`, and the link works wherever
that store is reachable. `InviteService` stops asking the server after the
first 501.

Those records carry an empty `tokenHash`, which is the honest encoding of "no
server record exists, so there is nothing to compare a presented token
against".
