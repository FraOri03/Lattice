# Setup

Local development, build, and test for Lattice. For external-service configuration
(Google, Drive, GitHub, Liveblocks, conversion backend) see
[integrations.md](integrations.md).

## Requirements

- **Node.js 18+** (the toolchain is Vite 6 / React 19 / TypeScript 5.8).
- npm (the repo ships a `package-lock.json`).
- A modern Chromium/Firefox/WebKit browser. IndexedDB + localStorage are used as the
  local vault.

## Install

```bash
npm install
```

## Commands

All scripts are defined in `package.json` — this table lists **only** scripts that exist.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server at http://localhost:5173 (HMR). |
| `npm run build` | `tsc --noEmit` (typecheck) **then** `vite build` → `dist/`. |
| `npm run typecheck` | TypeScript typecheck only (`tsc --noEmit`). |
| `npm test` | Run the unit tests once (`vitest run`). |
| `npm run preview` | Serve the built `dist/` locally to preview a production build. |

> There is **no dedicated lint script**. Static checking is done by the TypeScript
> compiler (`npm run typecheck`, also run as the first half of `npm run build`). If a
> linter is added later, document it here.

## Run

```bash
npm run dev        # → http://localhost:5173
```

With no environment variables set, the app runs **fully local**: a clearly-labeled mock
account, Drive sync disabled, GitHub via personal access token only, and realtime limited
to tabs of the same browser. Nothing is faked — unconfigured cloud features say so.

## Build & preview

```bash
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/ to sanity-check the build
```

The build emits code-split chunks; the heaviest are lazy-loaded (Monaco for Code mode,
SheetJS for spreadsheet import/export, jsPDF for PDF export). See
[limitations.md](limitations.md) for current bundle-size headroom.

## Test

```bash
npm test
```

Unit tests run under Vitest. Coverage is currently **minimal** (the board/presentation
round-trip in `src/lib/present/presentBoardCard.test.ts`). Expanding tests is tracked in
the [roadmap](../ROADMAP.md); new work should add tests alongside it — see
[CONTRIBUTING.md](../CONTRIBUTING.md).

## Environment variables

Copy the template and fill in what you need (never commit real values):

```bash
cp .env.example .env.local
```

Every variable is optional for local use. The ones that unlock cloud/realtime features
are documented, with step-by-step provider setup, in
[integrations.md](integrations.md). Quick reference:

| Variable | Unlocks | Server-side only |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google sign-in + Drive sync | no |
| `VITE_GOOGLE_API_KEY` | (optional) future discovery APIs | no |
| `VITE_GOOGLE_DRIVE_APP_FOLDER` | Drive root folder name (default `Lattice`) | no |
| `VITE_GITHUB_CLIENT_ID` | one-click GitHub OAuth (PAT works without it) | no |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth code exchange | **yes** |
| `VITE_REALTIME_BACKEND` | cross-device realtime (`liveblocks`) | no |
| `LIVEBLOCKS_SECRET_KEY` | realtime auth + room ACLs | **yes** |
| `VITE_REALTIME_AUTH_URL` / `VITE_REALTIME_ROOMS_URL` | endpoint overrides | no |
| `VITE_CONVERSION_API_URL` | remote DOC/PPT conversion | no |
| `VITE_APP_ENV` | environment label (display) | no |
| `VITE_APP_VERSION` | version string (display) | no |

> **Important:** `VITE_*` variables are inlined into the client bundle **at build time**.
> Changing them on a hosting provider requires a **redeploy**. Variables **without** the
> `VITE_` prefix (`GITHUB_CLIENT_SECRET`, `LIVEBLOCKS_SECRET_KEY`) are read only by the
> serverless functions and must never be prefixed.

## Deployment (Vercel)

The repo ships `vercel.json` (Vite framework preset, SPA rewrites that spare `/api/*`,
immutable asset caching) and serverless functions under `api/`.

**Via dashboard:** import `FraOri03/Lattice` at https://vercel.com/new → Vite is
auto-detected (`npm run build` → `dist`) → add the environment variables → Deploy.

**Via CLI:**

```bash
npm install --global vercel@latest
vercel          # first deploy / preview
vercel --prod   # production
```

Post-deploy checklist:

- Add the deploy URL to the Google OAuth client's **Authorized JavaScript origins**.
- Point the GitHub OAuth app's callback at `https://<app>.vercel.app/api/github/oauth`.
- Set env vars for both **Production** and **Preview**, then redeploy.
- Confirm no secrets reach the client: only `VITE_*` values are bundled.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Login screen only offers a "local mock account" | `VITE_GOOGLE_CLIENT_ID` is empty — expected. Set it for real sign-in ([integrations.md](integrations.md)). |
| Drive sync stays disabled after sign-in | The Google project is missing the Drive API, or the deploy origin isn't authorized. Identity and Drive are separate consents. |
| Realtime chip shows a setup checklist | `VITE_REALTIME_BACKEND` / `LIVEBLOCKS_SECRET_KEY` not configured, or not signed in with Google. |
| GitHub "Connect" needs a token | `VITE_GITHUB_CLIENT_ID` + the serverless function aren't configured; paste a personal access token instead. |
| Env change on Vercel had no effect | `VITE_*` values are baked at build time — redeploy Production. |
