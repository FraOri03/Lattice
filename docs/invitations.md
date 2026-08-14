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
  { action: 'accept',   token }                   → { invite, projectId, role }
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

## Acceptance proves the address (18.3, #90)

The hole was not subtle. `accept()` added whoever was signed in, and its
"simulate acceptance" sibling added a member from the invited address with
nothing proved at all — so an invitation sent to one address granted
membership to another, on every tier.

**The token gets the caller as far as the invitation and no further.** It says
which offer is being answered; it never says who is answering. That is decided
against the database:

```
caller = userByVerifiedEmail(session address)   ← verified identities only
proves = caller holds a VERIFIED identity for the invited address
```

The invited address does not have to be the one they signed in with: an
account that holds it as a second, verified identity qualifies, which is
precisely what [16.1](identity.md)'s convergence is for. Refusing that would
mean telling somebody they cannot accept an invitation sent to their own
mailbox.

On success the membership is written to `project_memberships` and bound to the
caller's real `users.id`, the address and its role are added to the Liveblocks
room ACL, and the invitation is marked `accepted` with `accepted_by`.

### Why the Liveblocks slot is deliberately left unbound

The ids in room metadata are derived from the credential a request presents
(`principalOf`), not from `users`. For an e-mail session that derivation is
seeded from the address, so binding at acceptance would write an id that the
same person arriving with Google would not match — and 16.2's rule is that a
bound slot stops answering to the address. The invitee would be locked out of
the project they had just joined. Binding stays where 16.2 put it:
`rooms.ensure`, the first time they open the project, using the credential they
actually came with.

### The local and Drive tiers

They have no server, and that is where the hole lived. Two rules replaced it:
the signed-in address has to match the invited one (compared
case-insensitively), and a **server-backed invitation is never granted
locally** — if the record has a `tokenHash`, only the server may accept it,
whatever this browser believes about who is signed in.

`acceptAsMock` is gone. A button that created a member from an unproven
address was the hole with a label on it; offline role testing is what "Preview
as role" in the share dialog's settings is for.

## What 18.1 deliberately did not do

**Delivery.** [18.2 (#89)](https://github.com/FraOri03/Lattice/issues/89) owns
the mail, and has since shipped: `create` and `resend` send the invitation and
report `delivery` next to it. See [mail.md](mail.md) for the templates, the
localisation and the ceilings. What 18.1 produces — the record, the deadline
and the link — is unchanged by it.

**"What is waiting for my address."**
[18.4 (#91)](https://github.com/FraOri03/Lattice/issues/91) owns that index and
has since shipped — `/api/shared` answers it, and the dashboard's Received tab
lists real invitations you can accept without the link. See
[shared-index.md](shared-index.md).

## The local tier did not go away

A Lattice with no database still collaborates over a shared browser or a
shared Drive, and invitations there keep working exactly as before: the client
mints its own token, keeps it in `collabStore`, and the link works wherever
that store is reachable. `InviteService` stops asking the server after the
first 501.

Those records carry an empty `tokenHash`, which is the honest encoding of "no
server record exists, so there is nothing to compare a presented token
against".
