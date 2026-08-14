# The shared-projects index

What belongs to me, answered by something that can see past this browser.

Phase 18.4 ([#91](https://github.com/FraOri03/Lattice/issues/91)). Consumes the
two queries [17.1](database.md) built and left unused, and completes the two
dashboard sections 15.5 shipped as honestly unavailable.

## The question nothing could answer

A browser knows only its own memberships. The realtime backend is an
*authority* rather than an index: it can answer "may this address enter this
room?" and cannot answer "which rooms may it enter?". So "Shared with me"
could only list projects this device already held, and "Pending invitations"
could list nothing at all — the recipient's copy of an invitation existed
nowhere, on any device.

Both sections said so. Neither pretended to be empty.

## The endpoint

```
POST /api/shared { action: 'index' }
  → { projects: [{ projectId, role, ownerEmail, claimed }],
      invitations: [ProjectInvite…],
      addresses: ['grace@example.com', …] }
```

**Every address the caller has proved**, not just the one they signed in with.
[16.1](identity.md) lets an account hold several verified identities, and a
project shared with either of them is shared with the same person — an index
that ignored that would hide projects from their own member. Unverified
identities are never consulted, for the reason 16.1 gives: a claim on an
address must not reveal what was shared with whoever owns it.

**Projects you own are excluded.** A project you own is not shared *with* you,
and filtering on the server keeps the two sections meaning what they say
whichever surface reads them.

**A claimed slot answers to its userId only.** 16.2's rule, preserved here: an
address reassigned to somebody new inherits nothing, so the index must not
hand them a membership the previous holder claimed.

## What it will not tell you

**Project names.** Postgres holds memberships, not projects — docs, boards and
their titles live in Yjs and Drive and deliberately never reach this database.
So the index answers with ids, roles and owners, and the client joins whatever
it already holds.

A project the index names but this device has never opened is shown with its
role and its owner, labelled *not on this device yet*, and is not a button:
there is nothing local to open. It arrives when Drive syncs, or when you open
it on a device that has it. Inventing a placeholder title would be a claim the
app cannot back, and dropping the row would hide a real membership.

## Answering an invitation from the dashboard

`accept` and `decline` take an **invitation id** as well as a token.

The token proves a mailbox received something. [18.3](invitations.md)'s gate is
not the token but the address — the caller must hold a verified identity for
the invited address — and a reader of this list has already proved exactly
that, by the same identities that produced the list. So the link adds nothing,
and requiring one would mean an invitation you can see but cannot answer.

An id is short and appears in listings, so it is **not** treated as a
credential: the lookup goes through "what is pending for the addresses this
caller has proved" rather than through a read by id, and the address check
still runs afterwards. An id can therefore only ever name an invitation that
was already yours.

## Not knowing is not the same as nothing

The client keeps `loaded` separate from `loading`. Until an answer arrives,
both sections render their unavailable state rather than their empty one —
"nothing is waiting for you" is a claim that a page which has not yet asked is
in no position to make, and it is exactly the false negative 13.3 wrote the
rule against.
