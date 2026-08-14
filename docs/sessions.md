# Sessions

How Lattice knows it is you on the second request, and why that stopped
being Google's job.

Phase 17.2 ([#85](https://github.com/FraOri03/Lattice/issues/85)). Built on
the schema from [17.1](database.md) and the decision in
[16.3](authorisation-phase-16-3.md).

## What was wrong

Every API call carried the user's Google OAuth access token in its request
body. Three consequences, none of them small:

- **A provider credential was the application's credential.** The token
  granted Drive access *and* proved identity to Lattice, so the blast
  radius of losing it was both at once.
- **It lived in `localStorage`.** Any script that ran on the page could read
  a Drive-scoped OAuth token — the limitation this phase closes.
- **Nothing could be revoked.** Lattice had never issued anything, so there
  was no "sign out on my other laptop" to offer. Signing out cleared local
  state and left the credential working.

## What happens now

Once, at sign-in, the verified Google token is exchanged for a Lattice
session. From then on the browser proves who it is with a cookie it cannot
read.

```
POST /api/session { action: 'create', googleToken }
  → Set-Cookie: lattice_session=…; HttpOnly; Secure; SameSite=Lax; Path=/
  → { userId, email, displayName, provider, expiresAt, csrfToken }
```

The response body carries the CSRF token and nothing replayable — no
session id, no hashes. The browser keeps it in memory for the life of the
tab.

| Call | Does |
|---|---|
| `GET /api/session` | who am I, and a freshly rotated CSRF token |
| `POST { action: 'create' }` | exchange a Google token for a session |
| `POST { action: 'logout' }` | sign out this device |
| `POST { action: 'logout-all' }` | sign out everywhere |

## The token is never stored

The cookie carries 32 random bytes. The `sessions` table stores only their
SHA-256, so a leaked database dump grants nobody a session — the same
reason nobody stores passwords in the clear. The CSRF token gets identical
treatment, and comparison is constant-time.

## CSRF: two locks, because the failure is silent

`SameSite=Lax` stops the cookie riding along on a cross-site POST, which is
already most of it. The `X-Lattice-Csrf` header is the second lock: a
cross-origin form cannot set a custom header at all, and a cross-origin
`fetch` that tries is stopped by preflight.

Reading is exempt and writing is not. `GET /api/session` answers from the
cookie alone, because a cross-site read whose response the attacker cannot
see is not an attack. Everything that changes state — including **signing
out**, which a forged request could otherwise do to you — must present the
token.

The token rotates on every read, so one that does leak is worth a page load
rather than the month the session lives.

## Why the Google token path still exists

`requireIdentity` tries the session cookie first and falls back to a Google
token in the body. That fallback is the transitional path 17.2 owes the
deployments it changes underneath:

- a browser that has not exchanged a session yet, mid-rollout;
- a deployment with **no database at all**, which is a valid configuration
  Lattice supports and must keep supporting.

`/api/session` answers `501` in that second case, and the client reads that
as "fall back", never as "signed out".

[17.3](email-otp.md) has since added e-mail codes as a second provider on
this same session. The Google-token fallback is still here: removing it is
its own change, and it needs every deployment to have a database first.

## What this changed in the browser

**The Google token now lives in memory only.** A reload drops it, and a
reload is allowed to drop it: identity survives in the cookie, realtime
authenticates with the cookie, and the only thing that still needs the
token is Google Drive — which asks through `getAccessToken()` and renews
silently, exactly as it already did whenever the hourly expiry passed.

**Realtime no longer waits for Drive.** `YjsManager` used to hold the
connection until a Google token was in hand. It now attaches as soon as a
session exists, so a token that is expired or mid-refresh no longer keeps
collaboration offline. That decoupling is the practical win of the phase.

**A consent flag replaced the token as evidence.** The old code used "is
there a stored token?" to mean "was Drive consent ever granted here?" —
sound while the token was persisted, and wrong the moment it was not.
Without a replacement, every reload would have announced an expired Drive
session and demanded a reconnect. `lattice-drive-consent` is that
replacement: a boolean fact about this browser, which grants whoever reads
it nothing.

## Honest limits

- **Sliding expiry is coarse.** A session lives 30 days and is extended
  when a request arrives with less than 7 days left, so an active user is
  never signed out on a schedule and an abandoned session still ages out.
  It is not idle-timeout precision, and it is not meant to be.
- **`logout-all` does not reach Liveblocks tokens already minted.** Those
  are short-lived and scoped, but a websocket authorised a minute before a
  global sign-out keeps working until its token expires.
- **The device list is not surfaced yet.** `liveOf()` exists and is tested;
  no UI reads it. `user_agent` is stored coarsely for that future list and
  is never parsed for behaviour.
- **Nothing revokes the Google grant on `logout-all`.** Signing out of
  Lattice everywhere does not disconnect Drive on other devices; that is
  `disconnectDrive`, and it is deliberately a separate action.
