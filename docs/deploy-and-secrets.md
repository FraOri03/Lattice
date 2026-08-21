# Deploy and secrets

Which variable belongs in which environment, how to rotate a key without an
outage, and what stops a secret from being published by a build.

Phase 17.4 ([#87](https://github.com/FraOri03/Lattice/issues/87)).

## The one fact everything here follows from

**Vite inlines every `VITE_`-prefixed variable into the client bundle at
build time.** Not at runtime — at build time, into a file served to every
visitor.

So the prefix is not a naming convention. It is the security boundary of
this deployment, and it has two consequences that are easy to get backwards:

- A secret behind `VITE_` **is not a secret**, and no runtime change takes
  it back. Only a rebuild does.
- A variable *without* the prefix is invisible to the browser entirely. It
  can only ever be read by `api/` on the server.

There is no third category. Anything the browser genuinely needs is public
by definition, and must be safe to publish for that reason rather than by
hope.

## What is public on purpose

| Variable | Why it is safe |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | An OAuth client id is an identifier; the secret half never leaves Google. |
| `VITE_GITHUB_CLIENT_ID` | Same. `GITHUB_CLIENT_SECRET` is server-only. |
| `VITE_LIVEKIT_URL` | An endpoint, not a credential. Access comes from a token signed server-side. |
| `VITE_AI_BACKEND` | A switch (`hosted` / `local` / empty), not an address. It selects which provider is built; whether the server has a key is asked at runtime ([ai.md](architecture/ai.md)). |
| `VITE_GOOGLE_API_KEY` | A *browser* key. Restricted by HTTP referrer in the Google console — the restriction is the control, not secrecy. |
| `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY` | Public by definition. RLS is enabled with no policies, so it grants nothing ([16.3](authorisation-phase-16-3.md)). |

Everything else — `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_JWT_SECRET`, `POSTGRES_PASSWORD`, `LIVEBLOCKS_SECRET_KEY`,
`LIVEKIT_API_SECRET`, `GITHUB_CLIENT_SECRET`, `RESEND_API_KEY`,
`RUNPOD_API_KEY`, `AI_JOB_SECRET` — is server-only and must never acquire a
`VITE_` prefix.

The `RUNPOD_ENDPOINT_*` ids belong to that list too, for a reason worth
stating: an endpoint id is not a credential on its own, but there is no
version of this app in which the browser needs one, and a variable the
client cannot see is a variable that cannot leak with the next refactor.

## The environments

Lattice is local-first, so **every backend is optional**. A missing
variable disables its feature honestly: `repositories()` returns null,
`mailSender()` returns null, `liveblocksClient()` returns null, and the
endpoints answer `501` naming what is absent. Nothing crashes and nothing
pretends.

That is a real property, and it is why the table below has gaps rather than
errors.

| | Local | Preview | Production |
|---|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | optional | ✓ | ✓ |
| `LIVEBLOCKS_SECRET_KEY` | optional | ✓ | ✓ |
| `LIVEKIT_API_KEY` / `_SECRET` | optional | ✓ | ✓ |
| `SUPABASE_URL` + secret key | optional | **✗ today** | ✓ |
| `RESEND_API_KEY` + `MAIL_FROM` | optional | ✓ | ✓ |
| `RUNPOD_API_KEY` + `RUNPOD_ENDPOINT_STANDARD` | optional | optional | optional |

**Local** reads `.env.local`, which is gitignored. Copy `.env.example` and
fill in only what you need; everything left empty simply stays off.

**Preview** is where a pull request is reviewed, and it is the environment
most likely to be wrong, because nothing fails loudly when it is.

**Production** is the only environment currently complete.

### The gap, stated plainly

The Supabase→Vercel integration syncs to **Production only**. Preview
deployments therefore have no database, so anything Phase 17 added — server
sessions, e-mail sign-in, memberships — answers `501` on a preview and
works in production.

Reviewing a PR on a preview URL will not exercise those paths. To close it,
enable the **Preview** toggle in Supabase → Integrations → Vercel. The
honest alternative is Branching (a database per PR), which needs the Pro
plan.

### The `NEXT_PUBLIC_` variables

The integration also writes `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
because its default prefix is Next.js's.

**They are inert here.** Vite inlines `VITE_*` and nothing else, so these
never reach the browser; the server reads the un-prefixed names. They are
harmless, and they are also misleading — a reader may reasonably assume the
client can see them.

Leave them or remove them, but do **not** "fix" the prefix to `VITE_`. That
would publish the anon key into the bundle. It would still be safe, because
the anon key is public by definition — but Lattice's design is that the
browser holds **no Supabase credential at all** ([16.3](authorisation-phase-16-3.md)),
and there is nothing in the client that would use it.

### Two generations of Supabase keys

`SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are the legacy JWTs;
`SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` are their replacements.
Both pairs are currently set.

[`client.ts`](../api/_lib/db/client.ts) accepts either and **prefers the new
name**, so removing the legacy pair later is a no-op rather than an outage.
It also refuses a key that is publicly scoped, because deny-all RLS answers
"no rows" rather than "forbidden" — the failure would otherwise look like an
empty database instead of a misconfiguration.

## Rotating a key

The order matters. Every one of these rotations is *make the new key work
first, then invalidate the old one* — the reverse is an outage.

**Supabase secret key.** Supabase → Settings → API Keys → create a second
secret key. Set `SUPABASE_SECRET_KEY` on Vercel to the new value, redeploy,
confirm sessions still resolve, then revoke the old key. Both are valid in
between, which is what makes this safe.

**Liveblocks / LiveKit.** Same shape: both providers allow a second key.
Rotate the variable, redeploy, verify a room connects, revoke the old.

**Resend.** Create a new API key, set it, redeploy, delete the old. Nothing
holds a long-lived reference, so this one is quick.

**`GITHUB_CLIENT_SECRET`.** GitHub allows two client secrets on one OAuth
app for exactly this reason. Add, deploy, remove.

**`RUNPOD_API_KEY`.** Create a second key, set it, redeploy, revoke the old
one. One thing to know before you do: unless `AI_JOB_SECRET` is set, the
job tickets and callback tokens are *derived from this key*, so rotating it
invalidates every outstanding ticket. In practice that means a generation
running at the moment of the rotation loses its ability to be polled or
cancelled from the browser — it still runs, and still ends, and RunPod's
own execution timeout still stops it. Set `AI_JOB_SECRET` explicitly if
that matters for your deployment; then the two rotate independently.

**Postgres password.** The hardest one, because the integration wrote the
`POSTGRES_*` set. Rotating the database password in Supabase invalidates
them all at once and there is no overlap window — do it only if the
password is believed compromised, and expect the direct-connection
variables to need re-syncing from the integration afterwards.

**A `VITE_` variable is different.** Its value is in every already-built
bundle, so rotating it means rebuilding and redeploying; caches and open
tabs keep the old one until they reload. Changing a `VITE_` value on Vercel
without a redeploy does nothing at all.

## The check

```bash
npm run build && npm run check:secrets
```

It runs in CI after every build, and it is three checks rather than one
because the mistake can enter at three different stages:

1. **Names** — a `VITE_`-prefixed variable that is obviously a secret,
   caught before it is ever given a value. This is the cheapest and earliest
   catch, and it works with no secrets present at all.
2. **Values** — a secret from the build environment appearing verbatim in
   the output. The definitive check: no pattern has to recognise the
   credential, because the environment already said what it was.
3. **Shapes** — credential-shaped strings regardless of the environment,
   which catches a key pasted straight into a source file where there is no
   variable to have been misnamed.

The detection lives in [`scripts/bundleSecrets.mjs`](../scripts/bundleSecrets.mjs)
as pure functions and is unit-tested — including the cases it must **not**
flag. A check that cries wolf gets disabled, which is the same outcome as
having no check by a slower route.

## Honest limits

- **The value check only fires where a value exists to compare** — CI, or a
  local `.env.local`. It also cannot fire when the bundler tree-shakes an
  unused variable away: a secret that is declared but never read does not
  reach the output at all. That case is real and was hit while testing this,
  and it is precisely what the NAME check is for — it fires on the
  declaration, before anything reads it.
- **The name check is an allowlist by name, so it can be wrong about a
  value.** `VITE_GOOGLE_API_KEY` is allowlisted as a browser key; if someone
  put a Supabase secret in it, the name check would stay quiet. The shape
  check catches exactly that, which is why the three overlap rather than
  partition.
- **It scans `dist/` only.** Serverless functions under `api/` are supposed
  to hold secrets; scanning them would flag the correct arrangement.
- **A missing AI backend is not an error.** `RUNPOD_API_KEY` unset means
  `/api/ai/capabilities` answers `configured: false` and the UI says AI is
  unavailable. That is the honest default for every environment, including
  production, and nothing in the table above should be read as a
  requirement.
- **The shape list is finite.** It covers the providers this project uses
  plus the common ones; a credential from a provider nobody has added yet
  will be caught by the value check or not at all.
- **Nothing enforces the Preview gap.** The table above says Preview has no
  database; no test asserts it, because the fix is a dashboard toggle rather
  than a line of code.
