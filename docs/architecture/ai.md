# AI

What an AI action is, who runs it, what it costs, and what the app does
when nothing is configured — which is the default.

Phase 21.
[21.0](https://github.com/FraOri03/Lattice/issues/261) settles the
vocabulary — the action catalogue, the provider seam, the job model, the
failure taxonomy and the honest default;
[21.1](https://github.com/FraOri03/Lattice/issues/100) is the hosted RunPod
backend written against it, and brought the job lifecycle and the deployment
numbers. The local ComfyUI backend and the switch between them are
[21.6](https://github.com/FraOri03/Lattice/issues/264).

## The default is off, and that is a feature

Lattice is local-first, so every backend is optional. With no AI configured
the active provider is `DisabledAiProvider`: `canRun()` is false for
everything, `submit()` throws a sentence naming what would have to be set
up, and **nothing is sent anywhere**. That is the same arrangement
`repositories()`, `mailSender()` and `liveblocksClient()` already have, and
it is the honest state rather than a placeholder.

## The seam

```
src/lib/ai/
  actions.ts            the closed action catalogue — no vendor field in it
  jobModel.ts           states, transitions, failure taxonomy   (shared with api/)
  protocol.ts           the /api/ai/* wire contract             (shared with api/)
  AiBackendProvider.ts  the interface + DisabledAiProvider
  index.ts              the registry: which provider runs which action
  backoff.ts            the polling schedule
  immediateJob.ts       a job handle for a backend that answers in one trip
  jobStore.ts           the vault record that survives a reload
  RunPodAiProvider.ts   the hosted GPU implementation
  providers/            GeminiSetDesignProvider, OfflineSetDesignProvider
  strings.ts            EN/IT sentences for every state and failure
```

`AiBackendProvider` is shaped deliberately like
[`ConversionBackendProvider`](../../src/lib/convert/ConversionBackendProvider.ts):
`id`, `label`, `requiresUpload`, `canRun(action)`, `submit(job, opts)`, and
the same three honestly-labelled implementations — `local`, `hosted`,
`disabled`. That file already solved explicit consent before upload, abort,
timeout, a size cap and progress callbacks; a second design for them would
only have been a second set of bugs.

Three files are **shared verbatim** with `api/`, the same way
`src/lib/collab/acl.ts` is: `actions.ts`, `jobModel.ts` and `protocol.ts`
are dependency-free and imported with `.js` extensions, so a parameter range
the browser enforces is literally the same function the endpoint enforces.
The browser can only ever *predict* what the server decides.

## The action catalogue

A closed, typed list of what the product can ask a backend to do, with **no
vendor field anywhere in it**. A ComfyUI node name or a RunPod endpoint id in
[`actions.ts`](../../src/lib/ai/actions.ts) would couple every consumer to
today's backend; the mapping from an action to the artefact that runs it is
the server's (21.2) and is never shipped to the browser.

Each action declares a stable id, its input and output kinds, its parameters
with ranges and defaults, whether it is reproducible from a seed, its input
cap, its deadline, and — *optionally* — the GPU class a GPU backend should
run it on.

| Action | In | Out | GPU class | Deterministic |
|---|---|---|---|---|
| `text-to-image` | — | image | standard | with a seed |
| `image-to-image` | image | image | standard | with a seed |
| `upscale` | image | image | light | no |
| `background-removal` | image | image | light | no |
| `inpaint` | image + mask | image | heavy | with a seed |
| `design-set` | — | scene | *none* | no |

`invalidParams()` is the pure function that checks a parameter bag against
those ranges, and it is shared verbatim with `/api/ai/submit` — one
definition of a range, checked on both sides, with nothing to drift.

## Capability negotiation, and the disclosure

**The UI asks the provider; it never hard-codes a vendor's abilities.**

`canRun(action)` is the cheap prediction. `capabilities()` is the answer, and
it is asked at *runtime* because every other backend predicate in
`src/lib/env.ts` is a build-time constant and AI must not be one: a key can
be revoked, an endpoint deleted, credit exhausted — and a user can paste or
clear their own key without anything being rebuilt.

Before a job runs, the surface owes the user three facts. They come from two
halves of the seam, because neither half can answer for the other:

- **What leaves** — `dataCarriedBy(action)`: nothing, a prompt, inputs, or
  both. Derived from what the action declares, so it cannot drift from it.
- **Where it goes, and who pays** — `provider.disclosure`: a `destination` of
  `device`, `deployment` or `third-party`, and a `cost` of `free`,
  `deployment` or `your-key`.

The same `upscale` sends the same image whether it lands on a rented GPU, on
the user's own machine, or nowhere at all — which is exactly why the two are
separate.

### The registry

`resolveAiProvider(action, { localOnly })` returns the first provider that
can run the action, in a deliberate order: the hosted GPU backend, then a
third-party model the user holds a key for, then the offline templates, then
`DisabledAiProvider`. `localOnly` skips anything that sends bytes — which is
what "use the offline layout instead" means, expressed as a constraint
rather than as a named provider. 21.6 turns this order into a preference the
user sets.

## The migration that tested the contract

Photo mode's set designer was a hard-coded call to Gemini with its own key
storage, its own error handling and its own offline fallback. It worked, and
it was exactly what must not be repeated once per feature — so 21.0 moved it
onto this seam, and that migration is the only real evidence the seam is a
contract rather than a description of RunPod.

It is a genuinely awkward fit, which is the point: no GPU, no queue, a
third-party vendor, the user's own credential, and an answer that is a layout
rather than an image. Four things had to change, and all four were the seam
being wrong rather than the feature being special:

1. **`gpuClass` became optional.** `design-set` has no GPU class, and
   inventing one would have been a field that lies. A GPU provider now reads
   exactly that field to decide what it can take.
2. **An output can be a value, not only a URL.** A worker writes bytes
   somewhere and returns a link; a model answering with structure *is* the
   result. `AiJobOutput.value` is deliberately `unknown` — the alternative is
   the catalogue importing the model types of every possible consumer, which
   is the coupling it exists to prevent, pointing the other way. The action's
   declared output kind is what tells a caller how to narrow it.
3. **`immediateJob` was added.** A backend that answers in one round trip
   reports `running` and then a terminal state, with the same abort, the same
   deadline and the same taxonomy as a job that queues for a minute. 21.6's
   local ComfyUI and 21.9's fake provider get it for free.
4. **`disclosure` was added, and one failure was renamed.** `id` was carrying
   two questions: `local | hosted | disabled` answers "does it leave the
   device" cleanly and says nothing about who is billed — and a third-party
   model on the user's own key is `hosted` while costing the deployment
   nothing. Separately, `no-worker` became `no-capacity`: a rate-limited
   vendor API and a serverless endpoint with no free worker are the same fact
   to a user, and the old name was a RunPod word in a file meant to outlive
   RunPod.

What did **not** change is the feature. `PhotoAI.tsx` asks the same question
and gets the same answer; [`src/lib/photo/ai.ts`](../../src/lib/photo/ai.ts)
is now a short translation between Photo mode's vocabulary and the
catalogue's. The templates still run with no key, no account and no network,
which is why Photo mode never has to show "AI is unavailable".

### The key stays the user's

The Gemini key is stored per account via `vaultKey`, sent only to Google, and
never to any Lattice endpoint. Storing it *is* the consent: there are no
binary inputs on this action, and a dialog per prompt would be asking again
for something whose entire configuration was the act of agreeing to it. What
the surface still owes is the disclosure above — third-party, your key —
shown before the first run rather than after.

## The trust boundary

**`RUNPOD_API_KEY` is a server secret and the browser never holds it.**
Anything named `VITE_*` is compiled into the public bundle at build time
([deploy-and-secrets.md](../deploy-and-secrets.md)), so a hosted credential
reachable from the client would be a published credential.

The pattern is `api/realtime/media-token.ts`: the client asks our endpoint,
the endpoint verifies identity and authorisation, and only then uses the
secret. The endpoint *ids* are treated the same way — not because knowing
one grants access, but because there is no reason for the browser to hold
either half of a bill.

What the browser knows: the action it asked for, a job id, and a signed
ticket. What it never learns: the hostname, the endpoint id, the GPU model,
or which of them ran its job. `src/lib/ai/trustBoundary.test.ts` asserts
this by scanning the source, and `npm run check:secrets` audits the built
bundle after every CI build.

## The job lifecycle

```
queued ──▶ cold-start ──▶ running ──▶ succeeded
   │            │            │    └──▶ failed
   └────────────┴────────────┴───────▶ cancelled
                                  └──▶ timed-out
```

Every transition moves forward, and the terminal states are terminal. That
is not tidiness: a webhook and a poll routinely arrive within milliseconds
of each other, and `canTransition` is what stops whichever lands second from
dragging a finished job back to `running`.

### Cold start is a state, not a stall

A serverless GPU worker can take tens of seconds to come up. RunPod reports
that wait as `IN_QUEUE`, which is also what it reports for a job waiting
behind other work — and neither is distinguishable from a hung app if all
the UI has is a spinner.

So the wait is split. Ten seconds (`COLD_START_AFTER_MS`) of queueing
promotes the job to `cold-start`, which the surface says out loud: *waiting
for a GPU*. The split is made from elapsed time rather than bought with a
call to the endpoint's health route on every poll, because that call would
double the request count to learn something the clock already knows.

### Queue position

RunPod does not report a per-job queue position, so `queuePosition` stays
undefined and the UI shows the wait rather than a fabricated number. The
endpoint's health route knows how many jobs are queued in total, which is
not the same question; buying it per poll was not worth a wrong answer.

## Polling: the schedule, and why it is a cost decision

Every poll of a paid endpoint is a request. The schedule is therefore two
regimes with numbers behind them rather than a `setInterval` nobody
revisits (`src/lib/ai/backoff.ts`):

| Regime | States | First | Factor | Cap |
|---|---|---|---|---|
| Waiting | `queued`, `cold-start` | 1500 ms | ×1.6 | 8000 ms |
| Running | `running` | 1000 ms | ×1.35 | 4000 ms |

Plus ±15% jitter on every delay, multiplied rather than added, so several
tabs of the same account do not poll in lockstep after a deploy.

**Waiting** backs off hard because nothing is happening and there is nothing
to report but the wait itself: a 45-second cold start costs about eight
requests instead of forty-five. **Running** polls faster and caps lower
because there the poll *is* the progress bar, and the whole job is thirty to
sixty seconds.

Changing regime resets the backoff, so a job that moves from `cold-start` to
`running` does not inherit a delay it earned while nothing was happening.

A poll that fails is retried up to five consecutive times before the job is
reported as `network-lost` — which says the job may still be running,
because it probably is.

## Deadlines, enforced on both sides

Each action declares a wall-clock ceiling in
[`actions.ts`](../../src/lib/ai/actions.ts): 90 s for background removal,
120 s for an upscale, 180 s for a text-to-image, 240 s for an inpaint.

The caller may ask for **less** and never more. `/api/ai/submit` clamps the
request to the action's ceiling and passes the result to RunPod as
`policy.executionTimeout`, so the number that stops an abandoned job is
enforced by the platform running it rather than by a browser that may be
closed. The client enforces the same deadline locally: on expiry it cancels
upstream and reports `timed-out` — a distinct state from `cancelled`, so the
user can tell which of the two happened.

An abandoned job therefore cannot run forever, and it cannot run past its
deadline even if every browser involved is gone.

## Cancellation reaches RunPod

A job cancelled in the browser that keeps burning GPU minutes is a billing
bug, not a cosmetic one. `cancel()` posts to `/api/ai/cancel`, which calls
RunPod's cancel route, and only then settles the handle. If the upstream
refuses, the client says the job **may still be running** rather than
reporting a cancellation that did not happen.

Cancel, deadline expiry and caller abort all take this path, because all
three have the same obligation: the money stops.

One deliberate exception: an abort that arrives *during submission* does not
abort the request. Cutting the connection after RunPod accepted the job but
before the id came back is precisely how a paid job is orphaned, so the
submission completes and the abort cancels the job it produced.

## The failure taxonomy

Every branch has a sentence in EN and IT
([`strings.ts`](../../src/lib/ai/strings.ts)) and a documented stance on
retrying. A raw upstream error or a bare status code is never shown.

| Reason | Retry stance | May have been billed | What it means |
|---|---|---|---|
| `not-configured` | no | no | No hosted backend on this deployment, or the server's credential was rejected |
| `unauthorized` | after a change | no | Not signed in, or the project role cannot run AI |
| `consent-required` | after a change | no | A binary input would have been uploaded without explicit consent |
| `input-too-large` | after a change | no | Over the 3 MB transport cap |
| `invalid-parameters` | after a change | no | Outside the ranges the catalogue declares |
| `no-credit` | no | no | The account behind the backend is out of credit |
| `no-capacity` | later | no | Nothing free to run it on — a busy queue, a rate limit. Capacity, not a fault |
| `model-missing` | no | no | The backend does not have what the action needs (21.2) |
| `upstream-error` | later | **yes** | The backend had the job when it broke |
| `cancelled` | yes | **yes** | The user, the deadline, or an abort |
| `timed-out` | later | **yes** | Ran past its ceiling and was stopped |
| `network-lost` | yes | **yes** | The browser stopped hearing about it; reattachment is the cure |

**The rule the retry policy hangs off:** nothing that may already have been
billed is ever retried automatically. `mayRetryAutomatically()` is false for
every row marked *yes* above, whatever its stance, because money makes
retrying a user's decision.

## Job persistence and reattachment

An in-flight job is written to the vault under `vaultKey('lattice-ai-jobs')`
— per account, like everything else Lattice keeps on the machine — holding
the id, the signed ticket, the action and the last state seen. Never the
prompt, never the inputs, never the result.

On mount, `restoreAiJobs()` reattaches to everything that is neither
terminal nor past its deadline. A refresh mid-generation therefore
reconnects instead of orphaning a job that is already being paid for, and
the job is never re-submitted.

## The endpoints

All same-origin, so nothing needs configuring. `POST` rather than `GET`
wherever a ticket is involved: a ticket is a credential and does not belong
in a URL that ends up in logs and referrers.

| Route | Does |
|---|---|
| `POST /api/ai/submit` | Validates against the catalogue, checks the project role, submits to RunPod, mints the ticket, records the ledger line |
| `POST /api/ai/status` | Verifies the ticket, reads RunPod, closes the ledger line if the job is done |
| `POST /api/ai/cancel` | Verifies the ticket, cancels upstream, closes the ledger line |
| `POST /api/ai/callback` | RunPod's webhook. Verifies the signed token, closes the ledger line |
| `GET /api/ai/capabilities` | What this deployment can run, right now |

### Availability is a runtime answer

Every other backend predicate in `src/lib/env.ts` is a build-time constant
compiled into the bundle. AI must not be one: a key can be revoked, an
endpoint deleted, credit exhausted, and the deployment has to be able to say
*no* without a redeploy. `VITE_AI_BACKEND` decides which implementation of
the seam is constructed; `/api/ai/capabilities` decides what it will admit
to being able to run, and that answer wins.

### Stateless authorisation: the ticket

Asking "how is job X doing" has to be authorised, and a table lookup would
have made Postgres mandatory for a feature that does not need it. So the
answer travels with the job: at submission the endpoint mints
`v1.<gpuClass>.<expiry>.<hmac>`, signed over the job id, the caller's
identity subject and the GPU class. It cannot be forged without the server
secret, cannot be moved to another job or another account, and expires after
an hour.

The GPU class rides along in the clear because status and cancel are
per-endpoint calls. It is a tier name, not an address.

The signing key is `AI_JOB_SECRET` when set, and otherwise derived from
`RUNPOD_API_KEY` with a domain separator — so a deployment does not have to
invent and rotate a second secret. The derived value never leaves the
server; only signatures do.

### The webhook, and why it exists

Polling can only close a job whose browser is still there to poll. The one
that matters is the other one: a generation submitted thirty seconds before
the tab was shut. Without a callback it leaves nothing behind — no evidence
it ran, no evidence it was paid for, and nothing for
[21.10](https://github.com/FraOri03/Lattice/issues/266) to reconcile.

RunPod does not sign its webhooks, so **the URL is the credential**. At
submission the endpoint mints a random token, signs it, and hands RunPod
`?cb=<token>.<signature>`. The handler verifies the signature before it
reads anything from the body, and then checks that the token is the one
stored (hashed) with *that* job — without the second check a single leaked
callback URL could close every job on the deployment. An unsigned callback,
a mis-signed one, and a valid token pointed at the wrong job all close
nothing.

A deployment with no database answers `200 {recorded: false}` rather than an
error: there is genuinely nothing to close, and a non-2xx would only buy a
retry storm against a deployment that will never be able to accept it.

### The ledger line

`ai_jobs` (see [database.md](../database.md) and the migration) holds who
ran which action, on which GPU class, when, and how it ended. No prompt, no
input, no output — where the result lives is
[21.5](https://github.com/FraOri03/Lattice/issues/263)'s question, and the
spend ceiling is [21.4](https://github.com/FraOri03/Lattice/issues/262)'s.

It is **not** how a poll is authorised. AI keeps working on a deployment
with no database, exactly as realtime and mail do.

## Binary inputs travel through the function, up to 3 MB

The choice was between a signed direct-to-storage upload and passing the
bytes through the serverless function, and the deciding constraint is real
rather than aesthetic: a Vercel function's request body stops at 4.5 MB, and
base64 inflates by a third.

So **3 MB raw** is the cap (`MAX_AI_INPUT_BYTES`), which leaves room for the
JSON around it. It is checked in the browser to fail fast and honestly, and
again on the server, where it counts.

Pass-through was chosen because at 3 MB it costs one request instead of
three (sign, upload, submit), needs no bucket, no lifecycle policy and no
second set of credentials, and every action in today's catalogue fits.
Anything larger — a video frame sequence, a multi-megapixel plate — needs
the signed upload, and that arrives with 21.5, which is where asset storage
is designed anyway.

Uploading any binary requires explicit consent (`uploadConsent`), every
time, exactly as remote conversion does. A prompt is text the user typed at
an AI feature; an image is a file off their machine, and the two do not get
the same default.

## Deployment: the settled numbers

Three endpoints, one per GPU class, because an upscale does not need the
hardware a text-to-image needs. After the idle timeout this is the largest
cost lever in the phase.

| Class | Actions | Target hardware | Idle timeout | Min workers | Max workers | Fast boot |
|---|---|---|---|---|---|---|
| `light` | upscale, background removal | 16 GB (A4000 / 4000 Ada) | 10 s | 0 | 2 | on |
| `standard` | text-to-image, image-to-image | 24 GB (A5000 / L4 / 4090) | 30 s | 0 | 3 | on |
| `heavy` | inpaint | 48 GB (A6000 / L40S) | 5 s | 0 | 1 | off |

**Idle timeout — 30 s on standard.** Generation is iterative: someone who
runs a text-to-image usually runs another within seconds, tweaking the
prompt. Thirty seconds of idle GPU costs roughly a cent, and it removes a
cold start from the common path. Beyond thirty seconds the money goes to
people who have already left, which is the wrong side of the trade.

**10 s on light**, because an upscale is a thing you do once and move on
from, so the second job is much less likely to arrive. **5 s on heavy**,
because it is the most expensive hardware in the set and inpainting is
deliberate, slow-paced work where a warm worker rarely catches the next job.

**Min workers 0, everywhere.** A warm worker costs money around the clock,
and Lattice is alpha with bursty, single-digit concurrency. Paying for
permanent warmth cannot be justified at this stage, which is exactly why
cold start is a first-class UI state rather than something bought away.

**Max workers is the ceiling on concurrent spend.** Three on standard covers
a small team generating at once; past that the queue is the right answer and
the UI says *waiting for a GPU* rather than silently scaling the bill. One
on heavy, because two concurrent inpaints on 48 GB hardware is a bigger
number than this phase should be able to reach by accident.

**Fast boot** (RunPod's FlashBoot) trades storage for latency by keeping the
container snapshot warm. Worth it on light and standard, where the saving is
most of the cold start and the job is short enough for that to dominate the
experience. Off on heavy, where the weights are large and the job takes
minutes anyway, so the storage cost buys proportionally little.

These are decisions, not measurements: the container they run is
[21.2](https://github.com/FraOri03/Lattice/issues/101)'s, and the real
cold-start and per-job costs should be measured against it and this table
corrected once they exist.

## Environment

Server-side, never `VITE_`-prefixed:

- `RUNPOD_API_KEY` — the credential. Read only by `api/_lib/ai.ts`.
- `RUNPOD_ENDPOINT_STANDARD` — required; the other classes fall back to it.
- `RUNPOD_ENDPOINT_LIGHT`, `RUNPOD_ENDPOINT_HEAVY` — optional.
- `AI_PUBLIC_ORIGIN` — where RunPod should call back. Derived from Vercel's
  own variables when unset; without either there is no webhook and polling
  is the only channel.
- `AI_JOB_SECRET` — optional signing key; derived from the RunPod key when
  unset.

Client-side, and not a credential:

- `VITE_AI_BACKEND` — `hosted`, `local`, or empty (the default). It selects
  which implementation of the seam is constructed and nothing more;
  `hasAiBackend` in `src/lib/env.ts` reads it, and the connections panel
  shows the row as *not in this build* when it is empty.

Neither list covers Photo mode's set designer. It runs on templates with
nothing configured at all, and on a third-party model as soon as the user
pastes their own key — neither of which is a *deployment* backend, so
neither turns `hasAiBackend` on. The connections panel is about what this
build talks to, not about what a user has connected for themselves.

## What is deliberately not here yet

- **The spend ceiling** (21.4). This phase enforces the catalogue's limits —
  parameter ranges, input size, deadline — and no budget. The gap is
  recorded rather than assumed away.
- **The graphs the endpoint runs** (21.2). `input.action` and `input.params`
  are the container's contract; the other side of it does not exist yet.
- **Where results are stored** (21.5). A completed job hands back URLs.
- **Who pays in a shared project** (21.7). Today the check is the project
  role: a viewer cannot spend the owner's GPU credit.
- **The local ComfyUI backend and the switch between them** (21.6). The
  registry order in `index.ts` is a list this file decides; 21.6 makes it a
  preference the user sets.
- **The in-app surface, and what the user is told about cost** (21.3). The
  seam can already answer what leaves, where it goes and who pays; nothing
  yet shows it, apart from Photo mode's error messages.
- **A translated Photo mode panel.** The failure sentences it shows now come
  from the catalogue and are EN/IT; the rest of `PhotoAI.tsx` is still
  English, and translating it is not this issue's to do.
