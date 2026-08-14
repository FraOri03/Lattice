# Identity

How Lattice decides *who you are*, and why that is no longer the same
question as *how you signed in*.

Introduced in Phase 16.1
([#81](https://github.com/FraOri03/Lattice/issues/81)).

## The model

Two records, in [`src/types/identity.ts`](../src/types/identity.ts):

```ts
User         { id, primaryEmail, displayName, avatarUrl, usageType, createdAt, updatedAt }
UserIdentity { id, userId, provider, providerSubject, email, verifiedAt }
```

A `User` is a person. A `UserIdentity` is one proven way of signing in as
that person — Google today, e-mail OTP in Phase 17. One user, several
identities.

`provider` is `google | email | mock`. `mock` is the local-only account
used when no Google client id is configured. `github` is *not* an identity
provider: it is a repository connection, and it never was a way to sign
in.

## What changed

Before 16.1 the account id was `acc_<Google subject>`: identity was
literally derived from the provider. Signing in another way would have
minted a second account, and there was no id an ACL could key on that
survived a provider change.

Now the id is opaque and durable. Linking or dropping a provider never
changes it — which is the property
[16.2](https://github.com/FraOri03/Lattice/issues/82) needs before room
memberships can move off e-mail addresses.

## The two rules

Both live in [`src/lib/auth/identity.ts`](../src/lib/auth/identity.ts) as
pure functions, and both are asserted directly in `identity.test.ts`.

**Convergence.** A sign-in is resolved in four steps, stopping at the
first that matches:

1. the same provider subject — the ordinary re-sign-in;
2. a *placeholder* row of the same provider carrying the same address: a
   migrated identity whose subject was not recoverable, repaired in place
   rather than duplicated;
3. a **verified** address already known to some user — this is the
   convergence the phase exists for, and the only step that compares
   e-mail across providers;
4. nobody: a new user, with this claim as its first identity.

**Containment.** Only a verified address may converge. An unverified
claim on `owner@company.com` creates a new user; it never reaches the
account that owns that address. Without this rule, adding e-mail sign-in
would have been a complete authorisation bypass.

`primaryEmail` follows from the same caution: it is filled in when
missing and never silently replaced, because it is where invitations and
notifications go.

## The id of a new user

It is seeded once, from the identity that created it
(`usr_<hash(provider:subject)>`), and never re-derived.

The seed is deliberate. With no server to ask, a random id would be a
regression on a workspace people already open from several machines:
device B has an empty local store, so the same person would mint a second
id and appear as a second author on every comment they had already
written. The seed keeps one person to one id across devices while the id
itself stays opaque — nothing about the provider is readable from it, and
linking a second provider does not change it. Phase 17 replaces the seed
with a server-issued id; seeding happens once per user, so users created
before then keep working unchanged.

## Where the records live

[`identityStore.ts`](../src/lib/auth/identityStore.ts) owns storage and
nothing else; every rule above is in `identity.ts`.

Today the implementation is `LocalIdentityStore`: `localStorage`, key
`lattice-identity`.

Phase 17 adds one that asks `/api` behind the same interface. The browser
never talks to the database directly — that was settled in
[16.3](authorisation-phase-16-3.md) — so the records live in Postgres and
the rules above run server-side, on the same module, which is why
`identity.ts` imports nothing an endpoint cannot import.

## Migration

On first read after the upgrade, an account already signed in is adopted:
its **legacy id is preserved** as the user id. That id is stamped on every
member row, comment author and activity entry the user has written —
including rows other people's browsers hold — so minting a fresh one would
have orphaned all of it for a cosmetic gain.

The Google subject is recovered from the legacy id when it has the shape
the old code wrote (`acc_<digits>`). When it does not, the identity is
stored with an empty subject and the next sign-in repairs it in place
(step 2 above).

## Honest limits

- The store is **per-browser**. It gives one person one id across devices,
  but it cannot see other people's users, so nothing here authorises
  anything on its own.
- Room access is still decided server-side from the ACL, **by e-mail**.
  Moving memberships onto `userId` is
  [16.2](https://github.com/FraOri03/Lattice/issues/82), and it depends on
  a server that can answer "which user is this address" for someone other
  than you — that is Phase 17.
- The Liveblocks identity is still the e-mail address, by design: it is
  not migrated in this phase.
- There is no second provider yet. `email` is representable and its rules
  are tested, but nothing mints an e-mail identity until OTP ships in
  Phase 17.
