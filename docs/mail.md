# Mail

What Lattice sends, what it looks like, and how much of it one person can cause.

Phase 18.2 ([#89](https://github.com/FraOri03/Lattice/issues/89)). Extends the
transport [17.3](email-otp.md) introduced, and delivers the invitations
[18.1](invitations.md) made server-side.

## The provider, and the part code cannot do

**Resend**, reached with one `fetch` and no SDK — its API is a single POST, and
a mail library would be a package, a tree of transitive dependencies and a
release cadence in exchange for a function that fits on a screen.

```
RESEND_API_KEY=…                       server-side only
MAIL_FROM="Lattice <no-reply@yourdomain.com>"
```

**The sending domain has to be verified with Resend or nothing arrives.** This
is the external blocker #89 names, and no amount of correct code substitutes
for it: an unverified domain is rejected at the API, and every message fails
with the same neutral answer a missing key produces. Verification is DNS —
SPF, DKIM and a return-path record, added at the registrar and confirmed in the
Resend dashboard.

With either variable missing the feature is honestly unavailable rather than
broken: `mailSender()` returns null, `/api/session` answers 501 for a sign-in
code, and an invitation is still *created* and still has a link to copy — it
just reports `delivery: 'unavailable'` instead of pretending.

## Two messages, one house style

| | Sign-in code | Invitation |
|---|---|---|
| Sent by | `/api/session`, `otp-request` | `/api/invitations`, `create` and `resend` |
| Says | six digits, a deadline | sender, project, role, workspace, deadline |
| Links | **none at all** | one button, plus the URL in text |
| Rate limited by | `email_otp_codes` (17.3) | `mail_sends` (below) |

Both are built in `api/_lib/mailTemplates.ts` on one shell, because the point
of a house style is that it cannot drift between messages.

### Why these are HTML now

17.3 sent plain text deliberately, and its reason was sound: an HTML mail
asking for a code is the shape of every phishing message ever sent. 18.2
reverses that, so the concern is answered rather than dropped.

- **Both parts, always.** The plain text 17.3 wrote is still the `text` part
  and still stands on its own; a client that strips markup shows exactly what
  it showed before.
- **The code mail has nothing to click.** Zero anchors, asserted by a test. The
  single most reliable phishing tell is a mail that wants you to follow it
  somewhere, and this one never does.
- **Images are decoration.** Every fact is text. The only remote asset in
  either message is `/brand/lattice-mark.png`, served by the same deployment
  that sent the mail — no tracking pixel, no web font, no CDN.
- **Everything interpolated is escaped.** A project name is written by a member
  of the project and read by somebody who is not in it yet.

### Localisation

EN and IT, chosen by the `locale` the caller passes — the *sender's* UI
language, because an address says nothing about what its owner reads. Anything
that is not `it` falls back to English rather than to nothing. The locale
selects wording and nothing else; no decision is ever made from it.

### The mark

`public/brand/lattice-mark.png`, 96×114, rasterised from `public/favicon.svg`
because Gmail and Outlook discard SVG. It is referenced at an absolute URL
derived from the request, so a preview deployment shows its own copy and links
to itself rather than to production.

## Rate limiting

Two ceilings over a one-hour window, both counted from `mail_sends`:

| Limit | Value | Protects |
|---|---|---|
| per recipient, across every project | 5 | the mailbox being written to |
| per project, across every address | 20 | everyone, from one careless or stolen account |

Either alone leaves the other route open — several projects can each stay under
a per-project limit and still bury one mailbox between them — so both are
checked and the stricter answer wins.

**Why a table rather than counting invitations.** `project_invitations` cannot
answer this: one row covers an invitation for its whole life, `resent_at` holds
only the last resend, and 18.1's unique index means a repeated invitation does
not insert at all. Counting rows would count *offers*, while the thing being
limited is *messages* — a sender who resends fifty times produces one row and
fifty e-mails.

A send is recorded **before** the attempt and whether or not the provider then
accepts it. A failure that did not count would make retrying a way around the
ceiling.

Unlike the OTP throttle, this one is **visible**: 17.3 hides its limit because
admitting it would confirm that earlier requests for an address were counted,
which is a fact about whether somebody has an account. Nothing of the sort
applies here — the caller is an authenticated member acting on their own
project, on an address they typed themselves — so they get a 429 and a sentence
they can act on.

## Delivery is reported, not assumed

`create` and `resend` answer with `delivery: 'sent' | 'failed' | 'unavailable'`
next to the invitation. All three leave a valid invitation and a usable link,
which is why a failed send is a state rather than an error: the sender keeps
something to copy instead of a request that looks like it did nothing. The
share dialog says which of the three happened — before 18.2, "sent" and "this
deployment has no mail backend" were the same sentence.
