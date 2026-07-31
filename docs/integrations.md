# Integrations

External services Lattice can talk to, what is **real** vs **mock/fallback/experimental**,
and exactly what to configure. All of these are optional — with everything unset the app
runs fully local and says so. See [setup.md](setup.md) for the command/deploy flow and
[collaboration.md](collaboration.md) for the realtime model.

## Integration status at a glance

| Integration | State without config | State with config |
|---|---|---|
| Google sign-in | Honest local **mock** account | Real Google OAuth (GIS token flow) |
| Google Drive sync | Disabled (no fake syncing) | Real Drive REST v3, `drive.file` scope |
| GitHub code sync | Works via personal access token (PAT) | One-click OAuth via serverless function |
| Realtime (Liveblocks + Yjs) | Tabs-of-one-browser + Drive polling | **Experimental** cross-device CRDT + server ACLs |
| Conversion backend | Disabled (originals preserved) | Remote worker for legacy/high-fidelity conversion |
| Video conversion (ffmpeg.wasm) | Always on, no config needed | Client-side only; fetches its ~30 MB core from jsDelivr on first use |

## Google sign-in + Drive

**Identity** uses Google OAuth (Google Identity Services token flow). **Storage** uses the
Drive REST API with the `drive.file` scope — Lattice can only touch files it created,
never the rest of your Drive. These are two separate consents: signing in does **not**
imply Drive backup.

Without `VITE_GOOGLE_CLIENT_ID`, the login screen offers a clearly-labeled **local-only
mock account** so the UI works in development; cloud sync stays disabled.

**Setup:**

1. [Google Cloud Console](https://console.cloud.google.com) → create a project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **OAuth consent screen** → External → add yourself as a test user; scopes: `openid`,
   `email`, `profile`, `.../auth/drive.file`.
4. **Credentials → Create credentials → OAuth client ID → Web application.** Authorized
   JavaScript origins: `http://localhost:5173` and your deploy URL(s). (The GIS token flow
   needs no redirect URI.)
5. Put the client id in `VITE_GOOGLE_CLIENT_ID`.

**Sync model** (single-user, multi-device — *not* collaboration):

- The local vault (Zustand + IndexedDB) is always the working copy; the app is fully
  usable offline.
- `SyncEngine` debounces local changes (~10s) and pushes only entities changed since their
  last upload.
- On sign-in/startup it pulls remote project snapshots and merges per-entity.
- Conflicts (both sides changed) resolve **newest-wins**; the losing local body is backed
  up to Drive as `<id>.conflict-<ts>.json` first, and Drive's own revision history keeps
  prior remote versions.
- **Deletions never propagate automatically** in either direction; remote deletes go to
  Drive's trash (recoverable) and only from explicit user actions.
- Each project lives in a folder **named after the project** (`/Lattice/projects/<Project
  name>`), so the Drive file list is browsable without knowing Lattice's internal ids.
  Identity still travels in an app property, never in the name: renaming a project
  renames that same folder in place, and a folder from an earlier version — named after
  the project id — is adopted and renamed on the first sync rather than left behind as a
  second copy. Two projects with the same title become `Name` and `Name (2)`.
- Rich documents also get a **readable HTML companion** next to their JSON body
  (`/documents-readable/<title>.html`), because a raw Tiptap JSON file is opaque in
  Drive's own file browser. The JSON stays the one internal source of truth — the HTML
  is purely derived and is never read back by `pull()`. It shares the JSON body's dirty
  check (only re-synced when the document actually changed), is found by a persistent
  Drive file id rather than by name (a Lattice-side rename updates it in place instead
  of duplicating it, and a companion created on one device is found — never
  re-created — by another), and, matching the "deletions never propagate" policy above,
  is **not** auto-trashed when the local document is deleted.

Drive layout is documented in [architecture.md](architecture.md#cloud-storage-layout-google-drive).

## GitHub (code documents only)

GitHub sync is deliberately scoped: **only code documents** ever touch GitHub — never
boards, rich documents, notes, spreadsheets, decks or assets.

- **Connect** in the profile menu: one-click OAuth (when `VITE_GITHUB_CLIENT_ID` + the
  serverless function are configured) or paste a personal access token (works everywhere;
  stored only in your browser).
- **Link a project to a repo**; Lattice proposes a feature branch `lattice/<project-slug>`.
- **Browse & import**: the panel lists the repo's code files; selected files import into
  Code mode and remember their repo path.
- **Sync code to GitHub**: select code documents, write a commit message — one commit lands
  on the feature branch. Commits happen **only** on this explicit action.
- **Pull code** refreshes linked documents from their branch.
- The repo's **default branch is protected by default** — Lattice refuses to commit to it.

**OAuth app setup (optional — PAT works without it):**

1. [github.com/settings/developers](https://github.com/settings/developers) → **New OAuth App**.
2. Homepage URL: your deployment URL. **Authorization callback URL:**
   `https://<your-app>.vercel.app/api/github/oauth`.
3. Set `VITE_GITHUB_CLIENT_ID` (client id) and `GITHUB_CLIENT_SECRET` (client secret,
   **server-side env var only** — read by `api/github/oauth.ts`, never bundled).

## Realtime collaboration (Liveblocks + Yjs)

> **Experimental / config-gated.** Cross-device realtime activates **only** when
> `VITE_REALTIME_BACKEND=liveblocks` is set **and** the user signs in with Google.
> Otherwise the top-bar chip shows the exact setup checklist and "live" means tabs of one
> browser (BroadcastChannel) + ~20s Drive polling. A remote connection is never simulated.

Why Liveblocks: zero self-hosted infrastructure next to a Vercel frontend (just two
serverless functions), first-class Yjs providers for Tiptap and Monaco, real server-side
permission enforcement via scoped room tokens, and reconnect/backoff out of the box.
PartyKit + Yjs is the documented fallback behind the same `RealtimeAttachment` interface
(`src/lib/crdt/liveblocks.ts`).

**Setup:**

1. Create a project at [liveblocks.io](https://liveblocks.io) and copy the secret key.
2. Set `LIVEBLOCKS_SECRET_KEY` (**server-side only** — read by `api/realtime/auth.ts` and
   `api/realtime/rooms.ts`).
3. Set `VITE_REALTIME_BACKEND=liveblocks`.
4. Ensure `VITE_GOOGLE_CLIENT_ID` is set — realtime identity **is** Google identity.
5. (Optional) override endpoints with `VITE_REALTIME_AUTH_URL` / `VITE_REALTIME_ROOMS_URL`.

Security/authorization details are in [collaboration.md](collaboration.md#server-enforced-permissions).

## Conversion backend (optional)

`ConversionBackendProvider` has three honest implementations:

- **Local** — the in-browser conversions (DOCX/ODT/XLSX/CSV/PPTX/ODP, PDF/PPTX export).
- **Remote** — an external worker (e.g. headless LibreOffice) behind
  `VITE_CONVERSION_API_URL`: authenticated multipart `convertFile`, explicit consent
  dialog before any upload, 50 MB cap, 120 s timeout, cancel, progress, fidelity warnings
  from response headers, original always untouched.
- **Disabled** (the default) — the UI states exactly what is missing; originals are
  preserved.

Contract: `POST {url}/convert` (multipart: `file`, `sourceFormat`, `targetFormat`,
`projectId`) with a Google Bearer token; the response is the converted file with
`x-conversion-engine` / `x-conversion-warnings` / `x-conversion-unsupported` headers. No
native conversion binary is ever bundled into the frontend.

## Video conversion (ffmpeg.wasm)

Every uploaded video (up to 150 MB) is transcoded client-side to a
web-friendly H.264/AAC MP4 so it plays reliably regardless of what codec it
arrived in — no configuration, no opt-in, always on. See
[file-formats.md](file-formats.md#video-upload-conversion) for the full
behavior (worker isolation, one-at-a-time queueing, in-place asset
replacement, retry on failure).

**The one external runtime dependency this adds**: the ffmpeg-core WASM/JS
build (~30 MB, version-pinned to `@ffmpeg/core@0.12.10`) is fetched lazily
from jsDelivr (`cdn.jsdelivr.net`) the first time a video is uploaded in a
session — it is not bundled with the app. This is the pattern ffmpeg.wasm's
own documentation recommends; self-hosting it as a Vite build asset was
investigated but has real build friction (Vite's static-asset handling
doesn't cleanly support the `toBlobURL` loading ffmpeg.wasm needs). If
jsDelivr is unreachable, conversion is skipped for that session and uploads
keep working with their original file untouched — never a hard failure.

## Full environment-variable reference

| Variable | Required for | Notes |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google sign-in + Drive sync | OAuth 2.0 **Web** client id. |
| `VITE_GOOGLE_API_KEY` | (optional) | Only for future discovery-based APIs. |
| `VITE_GOOGLE_DRIVE_APP_FOLDER` | (default `Lattice`) | Name of the Drive root folder. |
| `VITE_GITHUB_CLIENT_ID` | one-click GitHub OAuth | PAT connect works without it. |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth exchange | **Server-side only** — `api/github/oauth.ts`. |
| `VITE_REALTIME_BACKEND` | cross-device realtime | Set to `liveblocks`; empty = "Realtime off". |
| `LIVEBLOCKS_SECRET_KEY` | realtime auth + room ACLs | **Server-side only** — `api/realtime/*.ts`. |
| `VITE_REALTIME_AUTH_URL` / `VITE_REALTIME_ROOMS_URL` | (optional) | Endpoint overrides; default `/api/realtime/{auth,rooms}`. |
| `VITE_CONVERSION_API_URL` | remote DOC/PPT conversion | External worker endpoint; empty = disabled. |
| `VITE_APP_ENV` | display | `development` / `preview` / `production`. |
| `VITE_APP_VERSION` | display | Shown in the account menu. |

> **Note on versioning:** the displayed version is set via `VITE_APP_VERSION`
> (`.env.example` currently ships `0.8.0`). The `package.json` `version` field (`0.1.0`)
> and the `env.ts` fallback (`0.6.0`) are out of sync with it — see
> [limitations.md](limitations.md).
