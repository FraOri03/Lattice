# E-mail sign-in

A second way to prove who you are, on the session Lattice already issues.

Phase 17.3 ([#86](https://github.com/FraOri03/Lattice/issues/86)). Built on
[17.2](sessions.md)'s session and [16.1](identity.md)'s identity rules.

## The flow

```
POST /api/session { action: 'otp-request', email }
  → { sent: true, expiresInMs }        ← always this, whatever happened

POST /api/session { action: 'otp-verify', email, code }
  → Set-Cookie: lattice_session=…       ← the same session Google produces
  → { userId, email, provider: 'email', csrfToken }
```

No password, and no new session format: `startSession()` is shared by both
providers, which is what "a second provider **on the same session**" has to
mean if it is to mean anything.

## Six digits is not much, so everything else holds

A million possibilities sounds like a lot until something can guess a
thousand a second. Four limits carry this, and removing any one undoes the
others:

| Limit | Value |
|---|---|
| Code lifetime | 10 minutes |
| Uses | one — and a new request invalidates the previous code |
| Wrong guesses per code | 5, then the code is burned |
| Requests per address | 5 per hour |
| Requests per source IP | 20 per hour |

They live in one place, [`src/types/otp.ts`](../src/types/otp.ts), shared by
the server that enforces them and the UI that explains them — a ceiling the
interface describes differently from the one the endpoint applies is a
support ticket waiting to happen.

**The code is hashed with scrypt, salted with the address.** Hashing six
digits with a fast hash is barely hashing at all: a laptop enumerates the
whole space instantly, so a leaked table would be a leaked set of live
codes. The address as salt means two people issued the same digits get
different hashes.

## It cannot be used to find out who has an account

This is the requirement that shapes the endpoint, and it costs more than it
looks like it should.

`otp-request` returns **the same response no matter what happened** — the
address has an account, the address has never been seen, the request was
rate limited, or the mail provider rejected the send. All four answer
`{ sent: true, expiresInMs }`.

Rate limiting is included in that on purpose. Saying "you are being
throttled" would confirm that earlier requests for that address were
counted, which is the same leak by a longer route.

`otp-verify` collapses its failures the same way: no code was requested,
the code expired, the digits are wrong, and the attempt ceiling was reached
are four different situations that must look identical from outside.

The one thing the server *will* distinguish is a **501**, because that is a
fact about the server having no mail transport and says nothing about any
address.

The UI follows the same rule: the code field appears without waiting to
hear that anything was sent, and the confirmation is phrased "if this
address can receive mail…".

## Convergence is the point

Verifying a code produces a claim with `emailVerified: true`, because
receiving the code proved control of the mailbox. `resolveClaim` then does
what [16.1](identity.md) built it to do: an address Google already verified
lands on the **same user**, gaining a second `UserIdentity` rather than a
second account.

That is why 16.1 shipped a year of phases before this one. Without it,
signing in by e-mail to an address you had previously used with Google
would have created a stranger who happened to share your mailbox.

Containment still applies in the other direction: an *unverified* claim
never converges. There is no path here that produces one — a code is proof
— but the rule is the reason this flow is safe to add at all.

## Sending the mail

Lattice had no way to send an e-mail, and a code nobody receives is not a
sign-in method. [`api/_lib/mail.ts`](../api/_lib/mail.ts) is the smallest
transport that makes the flow real: one `fetch` to Resend, no SDK, no
dependency.

It is a **seam**, not a provider. Phase 18 owns invitation mail and will
want templates, a per-workspace from-name and delivery tracking — all of
which belong behind this interface rather than in place of it.

Configure it with:

```
RESEND_API_KEY=
MAIL_FROM=
```

With either missing, `mailSender()` returns null and the endpoint answers
501 naming exactly what is absent. It never pretends to have sent
something.

The message is plain text on purpose. An HTML mail asking for a code is the
shape of every phishing message ever sent; a short plain one is harder to
spoof convincingly and impossible to garble in a client that strips markup.
It names no account and confirms nothing.

## Why this is a separate module from `AuthService`

`AuthService` exists to manage a Google OAuth token: silent renewal,
gesture gating, backoff, Drive scopes. An e-mail sign-in has none of those
problems and no token at all. Folding it in would have meant a second
`kind`, a token lifecycle that does not apply, and a `getAccessToken()`
that has to answer for a provider with nothing to answer with.

[`emailSignIn.ts`](../src/lib/auth/emailSignIn.ts) shares what matters
instead — the session, the identity rules, and the local `Account` record
the rest of the app reads.

`identityStore.adopt()` exists for the same reason: the **server** decided
which user this is, having run the rules over every account rather than
over one browser's. Re-deciding locally would mint a second id for someone
who already has one.

## Honest limits

- **An e-mail sign-in brings no Drive token.** Cloud sync stays off until
  the account connects Drive, and the UI says so rather than pretending.
  That is a real difference between the two providers, not an oversight.
- **Rate limiting is per address and per IP, and an IP is a weak thing to
  trust.** It is read from `x-forwarded-for`, which the platform sets; it
  is used only for counting, never for identity.
- **No "resend" affordance yet.** Asking again from the address step issues
  a new code and invalidates the old one, which is correct but not
  obviously discoverable.
- **Old code rows are kept, not deleted**, because they are the
  rate-limiting evidence. They hold no code — only the fact that one
  existed — but nothing prunes them yet.
- **Delivery failures are invisible to the user by design.** If Resend
  rejects the send, the response is unchanged; the detail reaches the logs
  and nowhere else.
