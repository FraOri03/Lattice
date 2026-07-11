# Lattice

A **local-first unified creative workspace**: Obsidian-style linked notes, a Figma-style infinite board with sections, a Word/Notion-style rich document editor, a VS Code-style code workspace with GitHub sync, an Excel-style spreadsheet engine, a slide editor, projects inside **workspaces**, a personal account area, Google Drive cloud sync — and, since Phase 8, **production realtime multiplayer**: Yjs CRDT co-editing for documents, code and boards over Liveblocks with **server-enforced permissions**, live cursors and presence everywhere, area comments, a notification center, and a completed file-format pipeline (DOCX/PPTX/PDF export included).

```
npm install
npm run dev        # → http://localhost:5173
npm run build      # typecheck + production build
```

Deployed on Vercel — see [§ Deployment](#12--deployment-vercel) below.

---

## 1 · Product vision

**Lattice is a thinking canvas backed by a document engine.** One vault holds every kind of thing you work with — notes, documents, spreadsheets, decks, boards, code and imported files — organized into **projects**, and every one of them can be a card on an infinite canvas, linked visually and semantically.

Core mental model:

> **Documents and assets are entities. Cards are views of them. Projects own them. The cloud mirrors them.**

- A **note** is a markdown document with `[[wikilinks]]`, backlinks and tags.
- An **asset** is any imported file (PDF, Office, media, 3D). Its metadata lives in the vault; its binary lives behind a storage interface.
- A **board** is an infinite canvas of **cards**; a card *references* a note or asset, so the same entity can appear on many boards. **Sections** group cards Figma-style; **web embeds** put live websites on the canvas.
- A **project** is an organizational space (like ChatGPT/Claude projects): it owns boards, notes, documents, code and assets.
- The app is **offline-first**: IndexedDB + localStorage are the working copy; Google Drive is a synced backup, never a requirement.

Feel targets: Figma (board), Obsidian (linked notes), Notion (organization), Office/Workspace (editing), Milanote (visual research).

## 2 · What works today

**Phases 1–4 (complete):** universal import (PDF, Office, media, 3D, code — see §7), asset library with previews, board cards for every kind, markdown notes with wikilinks/backlinks/tags, rich document editor (Tiptap), code workspace (Monaco), spreadsheet engine with formulas, visual card linking, dark/light theme, JSON project export/import.

**Phase 6 (this release):**

| Area | Status |
|---|---|
| Projects (create/rename/archive/delete/star, icon/color, switcher, per-project content) | ✅ implemented |
| Personal account area (login screen, profile menu, connected-services status) | ✅ implemented |
| Google sign-in (OAuth via Google Identity Services) | ✅ real when `VITE_GOOGLE_CLIENT_ID` is set; honest local mock otherwise |
| Google Drive cloud sync (offline-first push/pull, conflict handling) | ✅ implemented (single-user; see §10 limits) |
| GitHub code sync (connect, link repo, browse, import, commit to feature branch, pull) | ✅ implemented (code documents only) |
| Board sections (Figma-like frames: rename, resize, color, collapse, group-move, minimap) | ✅ implemented |
| Web embed cards (paste URL → sandboxed iframe, link-preview fallback, full-page resize) | ✅ implemented |
| Top navigation: Board · Split · Document · Sheet · Presentation · Code | ✅ implemented |
| Command palette (Ctrl/Cmd+K), quick create, recents, file-type filters, sync/offline indicators, import progress | ✅ implemented |
| Presentation editor | ✅ **built in Phase 8** — see § Phase 8 below |

**Phase 7 (this release):**

| Area | Status |
|---|---|
| Project members & roles (owner/admin/editor/commenter/viewer) with a permission matrix | ✅ implemented (`PermissionsService`) |
| Invitations (invite by email, role, pending state, copy link, revoke, resend, accept flow, offline "simulate acceptance") | ✅ implemented (link-based — no email backend, and it says so) |
| Presence: active avatars in the top bar, per-user location ("viewing X", "editing Y"), last-active times | ✅ real across tabs of one browser (BroadcastChannel); cross-device needs the realtime backend |
| Live board collaboration: cursors, selection outlines, live card/section movement, safe op merging | ✅ real across tabs; provider-ready for cross-device |
| Comments: pins on the canvas, threads on cards/sections/docs/code/sheets/assets/embeds, replies, resolve/reopen, @mentions, filters, badges | ✅ implemented |
| Activity log (invites, joins, edits, moves, comments, versions, Drive/GitHub sync, imports, exports) | ✅ implemented |
| Version history: snapshots of boards/docs/code/project meta, restore (with auto-backup), duplicate, line diff | ✅ implemented |
| Role-based read-only: boards, docs, sheets, code, sidebar and inspectors all honor the role; "Preview as role" for testing | ✅ implemented |
| Code collaboration: soft file locks ("X is editing"), read-only for others, request edit control, owner/admin force-unlock | ✅ implemented |
| Document collaboration: editing indicators, conflict-safe refresh on remote saves (never clobbers a focused editor) | ✅ implemented (LWW at save granularity — **not** keystroke CRDT; see §14) |
| Drive-polling collaboration provider (members/invites/comments/activity/versions sync via the project's Drive folder) | ✅ implemented, ~20s latency, honestly labeled |
| True realtime backend (websocket) | ✅ **built in Phase 8** — Liveblocks + Yjs with server-side permissions; see § Phase 8 |
| UX/UI fix pass: toast system, styled confirm/prompt dialogs, focus-visible states, aria-labels, reduced-motion, context breadcrumb, empty-board state, shortcuts overlay (Ctrl+/) | ✅ implemented (see §14 audit summary) |

## 3 · Architecture: the document engine + cloud layer

```
            ┌───────────────────────────────────────────────────────┐
            │                        UI layer                        │
            │ Sidebar (ProjectSwitcher) · TopBar (6 modes, sync dot) │
            │ Board · Editors · Inspectors · CommandPalette · Login  │
            └──────┬──────────────────┬──────────────────┬──────────┘
                   │                  │                   │
            ┌──────┴──────────────────┴───────────────────┴─────────┐
            │              Vault store (Zustand, persisted)          │
            │  projects · boards · notes · asset/doc/code/sheet META │
            └──┬───────────┬───────────┬──────────────┬─────────────┘
               │           │           │              │
        ImportService  AssetRegistry  SyncEngine   AccountProvider
               │           │           │  ConflictResolver   │
        ┌──────┴───────────┴──────┐    │              AuthService
        │ StorageProvider (iface) │    │             (Google GIS / mock)
        │  IndexedDB (local)      │◄───┤
        │  GoogleDriveStorage-    │    └── GithubCodeProvider
        │  Provider (remote)      │        (code documents only)
        └─────────────────────────┘
```

Named abstractions and where they live:

| Abstraction | File | Role |
|---|---|---|
| `StorageProvider` | `src/lib/storage/StorageProvider.ts` | binary + document body storage interface (IndexedDB impl) |
| `GoogleDriveStorageProvider` | `src/lib/storage/GoogleDriveStorageProvider.ts` | **real** Drive REST v3 client implementing the same interface + path-aware ops |
| `SyncEngine` | `src/lib/sync/SyncEngine.ts` | offline-first push/pull between vault and Drive |
| `ConflictResolver` | `src/lib/sync/ConflictResolver.ts` | newest-wins policy + conflict records (Phase 7 seam) |
| `AuthService` | `src/lib/auth/AuthService.ts` | Google OAuth (GIS token flow) or honest mock |
| `AccountProvider` | `src/lib/auth/AccountProvider.tsx` | React session context |
| `GithubCodeProvider` | `src/lib/github/GithubCodeProvider.ts` | GitHub REST client — code documents only |
| `ProjectRegistry` / `ProjectStore` | `src/lib/projects/` | project helpers + hook-level API |
| `FileKindRegistry` / `FileKindIcon` | `src/lib/registry/fileKinds.tsx` | unified kind → icon/label/color |
| `WebEmbedService` | `src/lib/web/WebEmbedService.ts` | URL sanitization + embed payloads |
| `BoardSectionNode` | `src/components/board/SectionNode.tsx` | Figma-like frames |
| `WebEmbedCardNode` | `src/components/board/WebEmbedCardNode.tsx` | sandboxed website cards |
| `ImportService` | `src/lib/import/ImportService.ts` | universal import pipeline (+ progress reporting) |
| `AssetRegistry` | `src/lib/assets/AssetRegistry.ts` | asset id → object URL cache |
| `DocumentRegistry` / `EditorRegistry` | `src/lib/registry/documents.ts` | document kinds → editors (plugin seam) |

**Entity model** (`src/types/model.ts`): `Project`, `Account`, `SyncState`, `BoardSection`, `WebEmbed` joined the existing `NoteDoc`, `AssetDoc`, `Board`, `RichDocMeta`, `CodeDocMeta`, `SpreadsheetDocMeta`. Every entity now carries a `projectId`; a persisted-store migration stamps pre-Phase-6 vaults with a default project automatically.

## 4 · Projects

Projects are ChatGPT/Claude-style spaces. The switcher lives at the top of the sidebar:

- create · rename · archive · delete (with confirmation) · star
- icon (emoji) + color + description per project
- starred / recent grouping in the switcher
- all sidebar lists, search, the command palette and boards are scoped to the active project
- each project gets its own folder in cloud storage (`/Lattice/projects/<id>`)

Deleting a project deletes its local content after confirmation. **Files already synced to Drive are kept remotely** (Lattice never bulk-deletes remote data).

## 5 · Account & cloud sync (Google Drive)

**Sign-in** uses Google OAuth (Google Identity Services token flow) and requests the `drive.file` scope — Lattice can only touch files it created, never the rest of your Drive. Without OAuth credentials configured, the login screen offers a clearly-labeled **local-only mock account** so the UI works in dev; cloud sync stays disabled — no fake syncing.

**Sync model** (single-user, multi-device — *not* collaboration):

- Local vault (Zustand + IndexedDB) is always the working copy; the app is fully usable offline.
- The SyncEngine debounces local changes (10s) and pushes only entities that changed since their last upload.
- On sign-in/startup it pulls remote project snapshots and merges them per-entity.
- Conflicts (both sides changed since last sync) resolve **newest-wins**; the losing local body is backed up to Drive as `<id>.conflict-<ts>.json` first, and Drive's own revision history keeps prior remote versions. Resolved conflicts are listed in the profile menu.
- **Deletions never propagate automatically** in either direction, and remote deletes go to Drive's trash (recoverable), only ever from explicit user actions.

**Drive layout:**

```
/Lattice
  /projects/<project-id>
    project.json          # project + all entity metadata (incl. boards & notes)
    /documents/<id>.json  # rich document bodies (Tiptap JSON)
    /spreadsheets/<id>.json
    /code/<id>.<ext>      # code sources as real text files
    /assets/<id>.<ext>    # imported binaries
  /data                   # flat area used by the raw StorageProvider interface
```

The status chip in the top bar shows Synced / Syncing / pending count / Offline / error; click it to sync now.

## 6 · GitHub integration (code documents only)

GitHub sync is deliberately scoped: **only code documents** ever touch GitHub — never boards, rich documents, notes, spreadsheets or assets.

- **Connect** in the profile menu: one-click OAuth (when `VITE_GITHUB_CLIENT_ID` + serverless function are configured) or paste a personal access token (works everywhere; stored only in your browser).
- **Link a project to a repo** in the GitHub panel; Lattice proposes a feature branch `lattice/<project-slug>`.
- **Browse & import**: the panel lists the repo's code files; selected files import into Code mode and remember their repo path.
- **Sync code to GitHub**: select code documents, write a commit message, click — one commit lands on the feature branch. Commits happen **only** on this explicit action.
- **Pull code from GitHub** refreshes linked documents from their branch.
- The repo's **default branch is protected by default**: Lattice refuses to commit to it. The branch-based workflow leaves room for an optional PR flow later.

## 7 · Boards: sections & web embeds

**Sections** (Figma-like frames): create from the canvas toolbar; rename (double-click), resize, recolor, collapse/expand. Drop a card inside a section to attach it — dragging the section header moves the whole group (React Flow parent/child). Dragging a card out detaches it. Sections appear in the minimap in their color and serialize into the board JSON (`BoardSection` + `childCardIds`).

**Web embeds**: paste a URL on the canvas (or use the toolbar Web button / drop a link) to create a website card. Live sandboxed iframe by default with a one-click **link-preview fallback** — sites that send `X-Frame-Options`/CSP render blank, which JS cannot detect, so the card offers the switch inline. Header actions: favicon + title, open externally, resize to full page.

Security: URLs are sanitized on creation (`http`/`https` only — `javascript:`, `data:`, `file:` etc. are rejected with a visible warning card); iframes always carry `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"` and `referrerPolicy="no-referrer"`.

## 8 · Navigation & QOL

Top navigation: **Board · Split · Document · Sheet · Presentation · Code**. Board = canvas; Split = workspace + canvas side-by-side; Document = notes/rich docs with inspector; Sheet = spreadsheet workspace; Presentation = honest placeholder listing imported decks; Code = Monaco workspace with inspector. Opening an entity from a full-page mode jumps to its matching mode; from the board it opens Split.

- **Command palette** (Ctrl/Cmd+K): create anything, switch modes/projects/theme, search the active project's files and boards, recents.
- **Quick create** ("+ New") in the top bar; **recents** in sidebar + palette; **file-type filter chips** in the sidebar; **sync + offline indicators**; **import progress toast**; empty states with jump lists in every mode.
- `FileKindIcon`/`fileKindRegistry` give every kind (notes, docs, sheets, decks, code, PDF, image, video, audio, 3D, board, generic, webpage, GitHub, Drive) one consistent icon everywhere.

## 9 · Document engines (Phases 2–4 recap)

- **Rich documents** — Tiptap v2 (ProseMirror); canonical JSON bodies lazy-loaded from storage; headings, lists, tables, tasks, callouts, wikilinks, asset embeds; DOCX/ODT/RTF import with the original preserved in `/imports`; Markdown/HTML/ODT/RTF export.
- **Code** — Monaco (bundled, lazy chunk); language detection for 30+ extensions; digested metadata (snippet, line count, wikilinks in comments); board cards with read-only preview. Now with GitHub link metadata per file.
- **Spreadsheets** — custom virtualized grid + dependency-free `FormulaEngine` (SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF, ROUND, ABS, SQRT; A1/$A$1/ranges; `#CYCLE!` guard); XLSX/CSV/ODS import-export via lazy SheetJS chunk.
- **Conversion** — every office format is declared by a `FormatAdapter` with honest `limitations`; nothing pretends to be editable when it isn't.

## 10 · Known limitations (honest list)

- **Sync is single-user** (multi-device for one account). Timestamps, not CRDTs: simultaneous edits on two devices resolve newest-wins with backups, not merges. Realtime collaboration is Phase 7.
- Local deletions don't delete on Drive (by design) — a cleanup UI is future work; board layout changes alone don't bump a timestamp, so they upload with the next content change of the same project (or on manual "Sync now").
- OAuth tokens live in browser storage; sign out to clear. The mock account never syncs anything.
- Presentation mode is a placeholder; PPTX/ODP remain preserved assets with their source files intact.
- Web embed favicons load from `<origin>/favicon.ico` (external request by nature); sites that block framing need the preview mode.
- GitHub sync writes text files only (code documents); binary assets are out of scope on purpose.
- Vault metadata still lives in localStorage (~5 MB); binaries/document bodies in IndexedDB.
- Everything listed in previous phases' limitations (formula scope, ODT/RTF fidelity, Monaco chunk size, base64 project export size, …) still applies.

## 11 · Environment variables

Copy `.env.example` → `.env.local` (never commit real values):

| Variable | Required for | Notes |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google sign-in + Drive sync | OAuth 2.0 **Web** client id |
| `VITE_GOOGLE_API_KEY` | — (optional) | only for future discovery-based APIs |
| `VITE_GOOGLE_DRIVE_APP_FOLDER` | — (default `Lattice`) | name of the Drive root folder |
| `VITE_GITHUB_CLIENT_ID` | one-click GitHub OAuth | PAT connect works without it |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth exchange | **server-side only** — read by `api/github/oauth.ts`, never bundled |
| `VITE_REALTIME_BACKEND` | cross-device realtime (Phase 8) | set to `liveblocks` to enable; empty = honest "Realtime off" state |
| `LIVEBLOCKS_SECRET_KEY` | realtime auth + room ACLs | **server-side only** — read by `api/realtime/*.ts`; create at liveblocks.io |
| `VITE_REALTIME_AUTH_URL` / `VITE_REALTIME_ROOMS_URL` | — (optional) | endpoint overrides; default `/api/realtime/{auth,rooms}` |
| `VITE_CONVERSION_API_URL` | remote DOC/PPT conversion (Phase 8, optional) | external worker endpoint; empty = conversion honestly disabled |
| `VITE_APP_ENV` | display | `development` / `preview` / `production` |
| `VITE_APP_VERSION` | display | shown in the account menu |

With all of them empty the app still runs fully local (mock account, sync disabled, PAT-only GitHub).

### Google OAuth + Drive API setup

1. [Google Cloud Console](https://console.cloud.google.com) → create a project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **OAuth consent screen** → External → add yourself as test user; scopes: `openid`, `email`, `profile`, `.../auth/drive.file`.
4. **Credentials → Create credentials → OAuth client ID → Web application**. Authorized JavaScript origins: `http://localhost:5173` and your Vercel URL(s). (The GIS token flow needs no redirect URI.)
5. Put the client id in `VITE_GOOGLE_CLIENT_ID`.

### GitHub OAuth app setup (optional — PAT works without it)

1. [github.com/settings/developers](https://github.com/settings/developers) → **New OAuth App**.
2. Homepage URL: your deployment URL. **Authorization callback URL:** `https://<your-app>.vercel.app/api/github/oauth` (and `http://localhost:5173/api/github/oauth` for a second dev app if wanted — note the function only runs on Vercel/`vercel dev`).
3. Set `VITE_GITHUB_CLIENT_ID` (client id) and `GITHUB_CLIENT_SECRET` (client secret, server-side env var only).

## 12 · Deployment (Vercel)

The repo ships `vercel.json` (Vite framework preset, SPA rewrites that spare `/api/*`, immutable asset caching) and three serverless functions: `api/github/oauth.ts` (GitHub token exchange) plus, since Phase 8, `api/realtime/auth.ts` and `api/realtime/rooms.ts` (Google-verified identity → scoped Liveblocks room tokens, and the server-side membership ACL).

**Via dashboard:** import `FraOri03/Lattice` at [vercel.com/new](https://vercel.com/new) → framework auto-detects Vite (`npm run build` → `dist`) → add the environment variables above → Deploy.

**Via CLI:**

```
npm install --global vercel@latest
vercel          # first deploy / preview
vercel --prod   # production
```

Checklist after the first deploy:
- add the Vercel URL to the Google OAuth client's **Authorized JavaScript origins**
- point the GitHub OAuth app's callback at `https://<app>.vercel.app/api/github/oauth`
- set env vars for *Production* and *Preview* environments
- no secrets in the client: only `VITE_*` values reach the bundle; `GITHUB_CLIENT_SECRET` must **not** be prefixed

## 13 · Phase 7 — collaboration architecture

```
                 UI: ShareDialog · PresenceAvatars · BoardPresenceLayer ·
                     CommentPins · CollabPanel (Comments/Activity/Versions) ·
                     ReadOnlyBanner · lock banners
                                   │  (hooks: useMyRole/useCan/usePeers…)
      ┌────────────────────────────┴─────────────────────────────┐
      │                collab services (src/lib/collab)          │
      │  PermissionsService · MembersService · InviteService     │
      │  PresenceService · CommentService · ActivityLogService   │
      │  VersionHistoryService · RealtimeBoardSync               │
      │  RealtimeDocumentSync (incl. code locks)                 │
      └──────────────┬──────────────────────────┬────────────────┘
                     │ collabStore (Zustand)    │ ConflictResolverV2
      ┌──────────────┴──────────────────────────┴────────────────┐
      │                     CollabHub (router)                   │
      │   send() ─▶ every active provider · recv ─▶ handlers     │
      └──────┬─────────────────────┬──────────────────┬──────────┘
             │                     │                  │
   LocalCollaborationProvider   DrivePolling-      Realtime-
   (BroadcastChannel: REAL      Collaboration-     CollaborationProvider
    live sync between tabs)     Provider (~20s,    (placeholder — needs a
                                durable state      websocket backend,
                                via collab.json)   Phase 8)
```

### Permission matrix

| Capability | Owner | Admin | Editor | Commenter | Viewer |
|---|---|---|---|---|---|
| View content | ✅ | ✅ | ✅ | ✅ | ✅ |
| Add comments / resolve own | ✅ | ✅ | ✅ | ✅ | — |
| Resolve any comment | ✅ | ✅ | ✅ | — | — |
| Create / edit / delete content | ✅ | ✅ | ✅ | — | — |
| Create & restore versions | ✅ | ✅ | ✅ | — | — |
| Manage members (below own rank), invites | ✅ | ✅ | — | — | — |
| Force-unlock locked code files | ✅ | ✅ | — | — | — |
| Manage integrations (Drive/GitHub) | ✅ | — | — | — | — |
| Delete project / transfer ownership | ✅ | — | — | — | — |

The matrix lives in one place (`src/lib/collab/permissions.ts`); UI and services both consult it, and the owner can **preview the app as any role** from Share → Settings.

### Provider strategy (no vendor lock-in)

`CollaborationProvider` is a transport interface with honest, self-reported capabilities (`presence`, `liveCursors`, `latency`, `scope`). The hub runs every available provider simultaneously:

- **LocalCollaborationProvider** — BroadcastChannel. Real, instant collaboration between tabs/windows of the same browser: presence, cursors, selections, live board ops, document/lock messages. This is what makes every collaboration feature testable without any backend.
- **DrivePollingCollaborationProvider** — durable collab state (members, invites, comments, activity, version index) synced through `/Lattice/projects/<id>/collab.json` on a ~20s poll. **Drive polling limitation:** latency is the polling interval, there is no live presence (only last-active timestamps), and every participant needs access to the same Drive folder. The UI labels it exactly that way.
- **RealtimeCollaborationProvider** — **production since Phase 8**: Liveblocks + Yjs with server-enforced permissions. Activates only with `VITE_REALTIME_BACKEND=liveblocks` + `LIVEBLOCKS_SECRET_KEY` + Google sign-in; otherwise the status chip shows the honest setup checklist. See § 15.

Merging is structure-aware (`ConflictResolverV2`): collab records union by id with per-record newest-wins, comment replies always union, activity/version sets union, and boards merge **node-by-node** so two people moving different cards both keep their change.

### Honest limitations (collaboration) — status after Phase 8

- ~~True low-latency multiplayer across devices requires a realtime backend~~ → **shipped** (Liveblocks + Yjs, § 15). Without configuration, "live" still means tabs of one browser + Drive polling, and the UI says so.
- ~~Document co-editing is last-writer-wins~~ → **shipped**: keystroke-level CRDT for rich documents and code (y-prosemirror / y-monaco).
- Code soft locking still exists as the optional **Checkout required** policy; Collaborative (CRDT) is the default.
- Invites are links, not emails — Lattice has no mail server and says so in the dialog. With the realtime backend, the invitee's Google e-mail is recognized server-side the moment they sign in.
- ~~Version snapshot payloads live only on this device~~ → bodies ≤ 200 KB now sync through the collab CRDT doc; larger ones stay device-local (documented in § 15.12).
- ~~No server enforcing ACLs~~ → **shipped**: room-token scopes enforced by the backend on every operation (§ 15.3).

## 14 · Phase 7 — UX/UI audit summary & fixes

A structural audit ran before the collaboration work; what it found and what was fixed:

| Finding (audit) | Fix (this release) |
|---|---|
| Native `alert()`/`confirm()`/`prompt()` for deletes, imports and URL entry — jarring, blocking, unstyled | Global **toast system** + promise-based **styled confirm/prompt dialogs** with a danger variant; every native dialog call replaced |
| No visible keyboard focus anywhere; icon-only buttons without accessible names; no reduced-motion support | Global `:focus-visible` ring, `aria-label`s across the chrome (mode switcher, icon buttons, dialogs), `prefers-reduced-motion` handling |
| Top bar went blank outside Board mode (literal spacer); project context invisible | **Context breadcrumb** (project icon + name → board/document/code/sheet) in every mode; duplicate card-count stat removed |
| Empty board = bare dot grid with zero guidance | **Empty-board state** with first-note / add-section / import actions (read-only aware) |
| No keyboard shortcut reference | **Shortcuts overlay** (Ctrl+/ and command palette entry) |
| Destructive actions confirmed with plain-text `confirm()` | Danger-styled dialogs with explicit consequences ("Notes are kept", "cannot be undone locally…") |
| Collaboration UX (net-new) | Avatars in the top bar; cursors/selections on the canvas; comments as pins + one right-side drawer (Comments·Activity·Versions — one drawer, not three); role state as a persistent banner + disabled-with-explanation controls; locks as in-context banners |

Product coherence: the app keeps one design token set (`--panel/--bord/--ink/--accent`), one icon system, one card chrome, one dialog/toast language — Figma-like on the board, Obsidian-like in notes, VS Code-like in code, Notion-like in documents.

## 15 · Phase 8 — production realtime multiplayer, formats, QOL

### 15.1 Realtime backend: Liveblocks + Yjs (and why)

Evaluated against Supabase Realtime, PartyKit and self-hosted y-websocket. **Liveblocks won** because it is the only option that (a) needs **zero self-hosted infrastructure** next to a Vercel frontend — just two serverless functions, (b) has first-class Yjs providers that plug straight into Tiptap and Monaco, (c) gives real **server-side permission enforcement** through scoped room tokens, and (d) handles reconnect/backoff out of the box. PartyKit + Yjs remains the documented fallback (it would slot behind the same `RealtimeAttachment` interface in `src/lib/crdt/liveblocks.ts`).

The Phase 7 provider architecture is intact: `LocalCollaborationProvider` (tabs), `DrivePollingCollaborationProvider` (durable state over Drive) and the now-**production** `RealtimeCollaborationProvider` all run behind `CollabHub`. The realtime provider reports the full capability set — `presence, liveCursors, boardRealtime, documentCRDT, codeCRDT, commentsRealtime, serverPermissions, offlineRecovery` — and activates **only** when `VITE_REALTIME_BACKEND=liveblocks` is configured *and* the user is signed in with Google. Otherwise the top-bar status chip shows the honest setup state with the exact checklist; a remote connection is never simulated.

### 15.2 CRDT architecture (`src/lib/crdt/`)

```
YjsManager ── one ProjectRoom per project ──┬─ content Y.Doc: documents (Y.XmlFragment each),
  │ owns rooms + optional realtime attach   │  codeDocuments (Y.Text each), boards (Y.Map of
  │                                         │  nodes/edges per board), projectMetadata
  ├─ OfflineUpdateQueue (honest pending     └─ collab Y.Doc: comments/areas, durable collab
  │  counter; y-indexeddb holds the data)      state mirror, version bodies ≤200 KB
  ├─ AwarenessService (drag ghosts, sheet cells, code lines → presence)
  └─ CRDTPersistenceAdapter (labelled binary snapshots for migrations/versions)
```

Persistence roles: **Liveblocks** = active shared state · **y-indexeddb** = local CRDT cache (offline editing, instant loads, deterministic replay on reconnect) · **Google Drive** = durable JSON bodies + assets (unchanged paths — every CRDT save re-exports the JSON body through the existing persist pipeline) · **version history** = explicit restorable states. Even with **no backend configured**, tabs of one browser co-edit through a BroadcastChannel Yjs relay. Cursor movement and keystrokes never touch Drive polling.

- **Rich documents** are CRDT-native Tiptap (`Collaboration` + `CollaborationCursor`): simultaneous typing, remote carets/selections with names+colors, collaborative tables/lists, offline merge, undo via Y.UndoManager. Existing Tiptap JSON bodies migrate **once**, marker-guarded, with a "Before CRDT migration" version created first and the original body preserved. Last-writer-wins is gone as the active editing model.
- **Code** is y-monaco with remote cursors/selections/labels and per-project **Code editing policy**: *Collaborative* (CRDT multiplayer, default) or *Checkout required* (Phase 7 soft locks: request control, owner/admin force-unlock). GitHub commits stay explicit and ship the **reconciled** CRDT state; realtime edits never auto-commit.
- **Boards** use granular CRDT ops (node upserts/patches/data updates, edge ops, layer order) — the full board is serialized only on one-time seeding. During drags, geometry travels as **throttled transient presence** rendered as a dashed manipulation outline in the dragger's color; the committed CRDT op lands on drag end. A node a peer is dragging is locally non-draggable (one authoritative drag; takeover after release); remote updates never move a node you are dragging.

### 15.3 Server-enforced permissions

Two Vercel functions (`api/realtime/auth.ts`, `api/realtime/rooms.ts`) plus `LIVEBLOCKS_SECRET_KEY`:

- **Identity**: the client sends its Google OAuth access token; the server verifies it against Google (`tokeninfo`, audience-checked against `VITE_GOOGLE_CLIENT_ID`) and derives the e-mail from Google's answer — never from the request body.
- **Authorization**: each project maps to two rooms — *content* (docs/code/boards; writable by owner/admin/editor) and *collab* (comments/areas/durable state; writable by commenters too). The ACL lives in room metadata, writable only through the rooms endpoint, which evaluates **the same permission matrix module the UI uses** (`permissions.ts` — imported by both, so rules can't drift) for `set-role`/`delete`/`ensure`. Tokens are minted per-role (`room:write` vs `room:read`+`room:presence:write`) and **Liveblocks enforces them on every websocket op** — a tampered client cannot exceed its role, viewers can present but not write a single CRDT byte.
- Invites/role changes/removals mirror to the server ACL automatically (`ServerAclService`); ACL keys are Google e-mails, so invite people with the address they sign in with.

### 15.4 Workspaces

`Workspace → Project → Mode → Entity`, always visible in the breadcrumb. Personal workspace is automatic (migration wraps existing projects); team workspaces support create/rename/archive and **safe deletion** (projects move to Personal). Projects move between workspaces from Project settings. Enforcement stays per-project (room ACLs) — workspace membership is organizational, stated as such.

### 15.5 Area comments + notifications

The board comment tool: **click = pin, drag = translucent area rectangle** (C activates, Esc cancels, Enter submits). Areas live in flow coordinates on their thread — they persist with the project, sync over every transport, can be moved/resized by author/admin (plus numeric X/Y/W/H fields for keyboard access), show a numbered pin, minimize on resolve, restore on reopen, and the comments panel zooms the board to them (reduced-motion aware). **Comments 2.0**: reactions, assignment to a member, due dates with overdue highlight. The **notification center** (top-bar bell) derives per-device notifications from synced state — mentions, replies, assignments, invites, resolved/reopened, Drive failures, realtime failures — with deep links that focus threads and zoom areas.

### 15.6 Toolbar & QOL corrections

The inverted import/export icons are fixed everywhere via a semantic registry (`ActionIcons.tsx`): `Import` (arrow into tray), `Export` (arrow out), `DownloadLocal`, `UploadToCloud`, `Sync`, `PullFromGitHub`, `PushToGitHub` — one icon per meaning, applied across sidebar, board toolbar, GitHub dialog, inspectors and menus; every icon-only control carries `aria-label` + tooltip. `<ToolbarDivider />` (a keyboard-transparent `role="separator"`) groups all toolbars by purpose (board: structure · creation · annotation · external).

### 15.7 Presentation engine v1

Real slide editor on a 960×540 canvas: slide list with thumbnails (reorder/duplicate/delete), text boxes, images, rect/ellipse/line shapes, layer order, per-slide backgrounds, three themes, speaker notes, viewer-role read-only. Internal JSON source format (`presentModel.ts`). **Export: PDF** (true vector via lazy jsPDF) and **PPTX** (a valid PresentationML package — labelled *basic fidelity*: text/shapes/images, no themes/animations). **Import: PPTX and ODP** become editable decks (text geometry, embedded images) with a per-file conversion report; the source file is always preserved; legacy PPT stays honestly preserved until a conversion backend is configured.

### 15.8 Format capability matrix

Generated from `src/lib/registry/formatMatrix.ts` (code and docs cannot drift). States: **Native editable · Converted to editable · Preview only · Preserved original · Needs conversion backend · Unsupported**.

| Group | Native / converted (editable) | Preview only | Preserved / backend | Notes |
|---|---|---|---|---|
| Text | TXT, MD, HTML(code), RTF, DOCX, ODT | — | DOC/PPT → backend; DOCG/ODF-generic preserved by MIME signature | DOCX now exports natively; docs also export PDF/ODT/RTF/HTML/MD |
| Sheets | CSV, TSV, XLS, XLSX, ODS | — | — | export XLSX/CSV; ODS export not yet (reported) |
| Decks | PPTX, ODP | — | PPT → backend | export PDF + PPTX (basic fidelity) |
| PDF | — | ✅ (browser viewer, text selectable) | — | docs/sheets/decks export **to** PDF |
| Images | — | PNG, JPG, WEBP, GIF, SVG (sandboxed `img`), AVIF, BMP | TIFF preserved (browsers can't decode; the preview says so) | |
| Video | — | MP4, WEBM, OGV/MOV (codec-dependent, honest fallback) | — | |
| Audio | — | MP3, WAV, OGG, M4A/AAC, FLAC | — | |
| 3D | — | GLB, GLTF+deps, OBJ+MTL+textures, STL | FBX unsupported (no reliable loader) | **asset bundles** resolve external buffers/textures; missing-dependency diagnostics + “Relink missing files” — never a silent empty viewport |
| Code | 30+ languages incl. TOML/INI/env | — | — | env files: secret detection, privacy warning, never auto-committed |
| Archives | ZIP with a 3D model unpacks into a bundle | — | any other file preserved as attachment | |

### 15.9 Conversion backend

`ConversionBackendProvider` seam with three honest implementations: **Local** (the in-browser pairs above), **Remote** (external worker — e.g. headless LibreOffice — behind `VITE_CONVERSION_API_URL`: authenticated multipart `convertFile`, explicit consent dialog before any upload, 50 MB cap, 120 s timeout, cancel, progress, fidelity warnings from response headers, original always untouched) and **Disabled** (the default; the UI states exactly what is missing). No native conversion binary is ever bundled into the frontend.

### 15.10 Security model (Phase 8 audit)

- Realtime auth: Google tokens verified server-side with **audience check**; role scopes minted server-side; the browser's claimed role is never trusted.
- Markdown renderer XSS fix: `javascript:`/`data:` URLs in links/images now collapse to `#` (scheme allow-list) on top of the existing HTML escaping.
- SVG previews render through `<img>` (scripts never execute); web-embed iframes keep `sandbox` + `referrerPolicy=no-referrer` + http(s)-only URL sanitization.
- Env/credential files: heuristic secret detection on import → privacy warning + metadata flag; committing flagged files to GitHub requires an explicit danger re-confirmation; conversion uploads require explicit consent.
- Known: OAuth tokens live in browser storage (XSS-scoped; documented), public no-login links are not built (see 15.12).

### 15.11 Performance (production build, gzip)

| Chunk | Size (gzip) | Loading |
|---|---|---|
| Main bundle (React, board, Tiptap, Yjs, three.js) | **699 kB** | initial |
| Monaco code editor | 865 kB | lazy (Code mode) |
| SheetJS (xlsx) | 161 kB | lazy (first sheet import/export) |
| jsPDF | 129 kB | lazy (PDF export) |
| Realtime SDK (Liveblocks) | 54 kB | lazy (only when configured) |
| Presentation workspace | 5.8 kB | lazy |
| Spreadsheet workspace | 8.7 kB | lazy |

Skeleton/loading states cover every lazy module. Presence cursors are throttled (60 ms), drags (50 ms), board CRDT commits batched (80 ms). Known optimization for Phase 9: three.js is still in the main bundle (~170 kB gz of it) — the viewer can go lazy.

### 15.12 Known limitations (Phase 8)

- **Public no-login share links are not built.** Sharing is role-based and server-enforced; the Share dialog says exactly that and points to the real alternatives (HTML/PDF/DOCX/PPTX exports, vault files). An anonymous read-only viewer is the Phase 9 item.
- The unified import/export **transfer dialog** (plan → confirm → report in one surface) is partial: per-file progress, error reporting and conversion reports exist, but the planning step before import is not a dedicated dialog yet.
- Version snapshot payloads over 200 KB stay device-local (index syncs; smaller bodies sync through the collab CRDT doc).
- Sheet editing is body-level sync (save-granular), not cell-level CRDT; sheet/deck *presence* is live.
- Board same-node conflicts resolve last-writer-wins per node (different nodes never conflict); doc-range-anchored comments inside rich documents are not anchored to exact ranges yet.
- PPTX/ODP import flattens masters/themes/animations (reported per file); PPTX export is basic fidelity by design.
- Realtime requires Google sign-in (identity source); local mock accounts stay tabs-only + Drive.

## 15a · Phase 8.5 — UX/UI audit & Presentation-in-Board integration

After the Phase 8 build, a **senior UX/UI audit** ran across the whole product (branch `phase-8` @ `bef3dc5`; full inspection of 148 source files + the running app at `localhost:5173` through all six modes + git history), in the same spirit as the Phase 7 audit (§14) but broadened to every surface. It produced a scorecard, a complete feature inventory, per-surface findings, an issue register (`LAT-*`) and a prioritized remediation plan — and it **autonomously remediated the flagship product-coherence gap**: presentations could not be board cards. Deliverables live under `docs/` (`ux-ui-audit-phase-8.md`, `ux-ui-audit-scorecard.md`, `ux-ui-remediation-roadmap.md`, `presentation-board-integration-spec.md`).

**One-line verdict:** a genuinely impressive engineering platform with a coherent visual system and rare honesty of state, held back by an over-deep information architecture, canvas-level accessibility gaps, and surface-level feature threading (of which Presentation-in-Board was the flagship example, now closed).

### 15a.1 Scorecard (0–10, evidence-based)

Verification legend: `✅ code` verified in source · `🖥️ browser` verified in the running app · `📄 doc` documented but not independently verified.

| Dimension | Score | Trend | One-line rationale |
|---|---:|---|---|
| Product coherence | 7.0 | ↑ | One design language; Presentation was bolted-on (now fixed); Split ambiguous |
| Information architecture | 6.5 | → | 4–5 nesting levels; "Board" is mode+surface+layout; asset/doc duality |
| Navigation | 7.0 | ↑ | Clear 6-mode switcher + breadcrumb; no browser history; thin deep links |
| Board UX | 7.5 | ↑ | Strong Figma-like canvas + presence; no keyboard ops, no visible undo |
| Document UX | 7.5 | → | Solid Tiptap CRDT; three competing metaphors (Notion/Word/Obsidian) |
| Spreadsheet UX | 7.0 | → | Real grid + formulas; save-granular (not cell CRDT); small function set |
| Presentation UX | 6.5 | ↑ | Real v1 editor; no presenter mode / masters; board gap fixed here |
| Code UX | 8.0 | → | Monaco + CRDT + GitHub + secret detection — strongest surface |
| Collaboration UX | 7.5 | → | Server-enforced ACLs + CRDT; honest but config-gated; presence UI good |
| Cloud/account UX | 7.0 | → | Honest Drive states + diagnostics; identity-vs-storage nuance under-explained |
| Visual consistency | 8.0 | → | Tokens, icon registry, card chrome, one dialog/toast system |
| Accessibility | 5.5 | → | aria/focus/reduced-motion present; canvas not keyboard-operable; color-only cues |
| Performance perception | 6.5 | → | Skeletons + throttling; 700 kB gz main w/ three.js; no board virtualization |
| Error handling | 7.0 | → | Toasts, honest chips, diagnostics; a few silent recovery paths |
| Onboarding | 6.0 | → | Good empty states; no tour; steep mental model |
| **Overall UX** | **7.0** | ↑ | Powerful and honest; friction from IA depth + a11y + threading |
| **Overall UI** | **7.5** | → | Cohesive, professional, dark-first; density risks at narrow widths |

### 15a.2 Presentation-in-Board integration (implemented)

**The gap:** presentations were full entities (`PresentationDocMeta`, an editor mode, a sidebar section, PPTX/ODP import) but could **not** be board cards — no `presentation` card type, no node registration, no toolbar/drag/inspector — and an imported deck landed on the canvas as an inert *raw asset* card (`ImportService.cardSpecFor`, comment: *"decks have no dedicated card type yet"*). This broke the core promise that "every entity can be a card on the infinite canvas." **This builds directly upon** the Phase 1 board and the Phase 8 presentation engine (§15.7) — it adds a card view, not a new engine.

**Data model** — `presentation` joins `CardType`; `CardData.presentId` references a `PresentationDocMeta`; the reused `mode: 'compact' | 'expanded'` field drives the card; `CARD_DEFAULTS.presentation = { w: 360, h: 260 }`. The deck **body** stays in the `StorageProvider` (lazy-loaded), exactly like docs/sheets — the node holds only a reference + display mode, so it rides the existing serialization with **zero CRDT changes**.

**Component** — `PresentationCardNode` (`src/components/board/PresentationCardNode.tsx`), registered as `nodeTypes.presentation` in `BoardCanvas.tsx`. A key perf decision: `SlideView`/`StaticElement`/`elementStyle` were **extracted** out of `PresentationWorkspace.tsx` into `src/components/present/SlideView.tsx` so a card can render a slide **without** pulling the heavy editor (and its lazy chunk) into the main bundle — measured impact ≈ **0.5 kB gz**; the workspace stayed a lazy chunk.

**Interaction states:**

| Mode | Trigger | Renders | Body load |
|---|---|---|---|
| **Compact** (default) | insert / drag / import; inspector toggle | title, snippet, slide count, `imported` badge | none (meta only) |
| **Expanded** | inspector "Card mode → expanded" | live `SlideView` thumbnail + prev/next navigator + "Slide i/n" (aria-labeled) | lazy from storage; re-reads on `updatedAt` |
| **Full** | double-click card / "Open in workspace" / sidebar click | the `PresentationWorkspace` editor | full editor |

- **Drag-and-drop** — sidebar deck rows are `draggable` and set `PRESENT_DRAG_MIME = 'application/x-lattice-present'`; `BoardCanvas.onDrop` verifies the deck exists and calls `addCard('presentation', …)`, early-returning with a toast for read-only roles. The canvas toolbar gains a **Deck** button (`createPresentDoc()` → compact card at viewport center).
- **Inspector** — a `presentation` branch (parity with sheet/doc/code): rename, slide count, `Source: imported deck`, a compact/expanded segmented toggle, "Open in workspace", and a danger "Delete presentation from vault" (separate from "Delete card"). `TYPE_LABEL.presentation` is compile-enforced by the exhaustive `Record<CardData['type'], string>`.
- **Import** — `cardSpecFor({kind:'present'})` now returns a `presentation` card pointing at the **editable deck** instead of an `asset` card pointing at the raw PPTX; the original stays preserved and reachable via `sourceAssetId`.
- **Lifecycle** — `deletePresentDoc` now strips the deck's cards from **every** board (like docs/sheets/code). Realtime-safe (generic CRDT node serialization); comments (via `CardChrome`'s badge) and version history inherited; permissions inherited from `src/lib/collab/permissions.ts` — read-only roles hide the toolbar and reject drops, viewers get a read-only card whose navigator still pages.

**Fallback states** — deck deleted but card remains → "Missing presentation" placeholder; body missing/corrupt → `normalizePresentBody` yields a valid 1-slide deck (never a blank card); lazy chunk fails → compact card still renders, expanded shows "Loading slides…", the board never hard-crashes.

**Navigation fixes shipped alongside** — presentations were also absent from create/search paths; the audit added them to **Quick Create**, the **command palette** (create + search), and fixed **sidebar recents** silently dropping decks (plus a new `IcChevronLeft` icon for the navigator).

**Tests** — `src/lib/present/presentBoardCard.test.ts` (vitest, `npm test`, 3/3 pass): a `presentation` node round-trips through JSON preserving `type`/`presentId` and never carries an `assetId`; a fresh deck body digests to `slideCount: 1`; garbage from storage normalizes to a valid deck. Component/DOM tests are deferred until a jsdom harness lands.

**Acceptance criteria (all met):**

- [x] `presentation` is a valid `CardType`; `CardData.presentId` exists; `PresentationCardNode` registered.
- [x] Toolbar "Deck", Quick Create, command-palette create/search, and sidebar drag all create/place a deck card.
- [x] Compact shows title/snippet/slide-count/source; expanded shows a live slide + working prev/next navigator; double-click opens the workspace.
- [x] Imported PPTX/ODP lands as an editable deck card (not a raw asset); source preserved.
- [x] Inspector: rename, compact/expanded toggle, open-in-workspace, delete-from-vault; deleting a deck strips its cards on all boards.
- [x] Node serializes generically (vault export / Drive / CRDT); permissions, comments and versions inherited.
- [x] Typecheck ✅, production build ✅, unit tests ✅ (3/3).
- [~] Full in-browser click-through of insert/expand was **partially blocked by an environment issue** during the session (canvas click delivery); the toolbar button and sidebar drag/recents were DOM-verified and the render path is covered by build + tests — **re-verify interactively before release.**

> Individual-slide-to-board (dragging one slide out as its own image) was evaluated and **deliberately deferred**: it would fork slide ownership and needs a product decision. Recommended future path: a "copy slide as image" that produces a self-contained `image` card, keeping decks authoritative.

### 15a.3 Key findings & issue register

The audit's material findings, most feeding Phase 9 (§15b). Severity in brackets.

- **Information architecture** — "Board" is simultaneously a *mode*, a *surface* and (via Split) a *layout* [med]; the hierarchy is 4–5 levels deep (Workspace → Project → Mode → Entity → Card) with Workspaces organizational-only [med]; the asset/entity duality leaks (import creates both a preserved asset and an editable sibling) [med]; Notes vs Documents are under-differentiated at the decision point [med].
- **Navigation** — no browser back/forward (the SPA has no router; Back exits the app) [high]; Split is a peer "mode" that behaves like a layout toggle [med]; the mode switcher sheds text labels below `xl` [med]; no per-entity shareable deep link [med].
- **Accessibility** — the **board canvas is not keyboard-operable** (create/select/move/link are pointer-only) [**critical**]; status is conveyed by color alone (sync/role/presence/realtime/minimap) [high]; several targets dip below 24 px; live-region announcements are incomplete. The chrome *is* accessible (global focus-visible, broad aria-labels, reduced-motion, and the slide inspector's numeric X/Y/W/H fields as a genuine keyboard alternative to drag).
- **Performance** — **three.js ships in the main bundle** (~170 kB gz) though only 3D previews use it [high]; there is **no board node virtualization** and off-screen 3D cards run continuous `requestAnimationFrame`/`OrbitControls` loops, which made the renderer unresponsive during the audit [high].
- **Collaboration honesty (the one leak, `COL-1`)** — presence avatars and the Share affordance are always visible, but cross-device realtime only works when `VITE_REALTIME_BACKEND=liveblocks` is set *and* the user signs in with Google; otherwise "live" means tabs-of-one-browser + ~20 s Drive polling. The realtime chip is honest, but the surrounding collaboration UI doesn't visibly downgrade [high — communication].
- **Responsive & device** — fixed-width sidebar/inspectors starve the canvas below ~1100 px; there is no mobile story (nothing blocks a phone, but Monaco/Sheet/Presentation are unusable) [high]. Recommendation: explicit tiers — **Desktop (full)**, **Tablet (read + light edit, drawers)**, **Mobile (read-only viewer + comments)** — that block unsupported editors with an honest message.

Issue register (severity · effort · target phase):

| ID | Area | Title | Sev | Effort | Phase |
|---|---|---|---|---|---|
| LAT-1 | Board/Present | Presentations not board cards | High | L | **8.5 (done)** |
| LAT-19 | Nav | Presentation missing from create/search/recents | Medium | S | **8.5 (done)** |
| LAT-2 | A11y | Canvas not keyboard-operable | Critical | L | 9 · P1 |
| LAT-3 | Collab | Presence/Share imply realtime when off | High | S | 9 · P1 |
| LAT-4 | Perf | three.js in main bundle | High | M | 9 · P1 |
| LAT-5 | Perf | No board virtualization; off-screen anim loops | High | L | 9 · P1 |
| LAT-6 | Nav | No browser back/forward | High | M | 9 · P1 |
| LAT-12 | Responsive | Fixed panels starve canvas; no mobile | High | L | 9 · P1 |
| LAT-7 | IA | Split is a mode, not a layout | Medium | M | 9 · P2 |
| LAT-8 | IA | Workspaces add nesting w/o enforcement | Medium | S | 9 · P2 |
| LAT-9 | Present | No presenter/slideshow mode | Medium | M | 9 · P2 |
| LAT-10 | Sheet | Save-granular, not cell CRDT | Medium | S / XL | 9 · P2 |
| LAT-11 | UI/A11y | Color-only status encoding | Medium | S | 9 · P2 |
| LAT-13 | Cloud | Identity vs storage under-explained | Medium | XS | 9 · P2 |
| LAT-15 | Board | No visible undo/redo | Medium | M | 9 · P2 |
| LAT-18 | Onboarding | No product tour / mental-model intro | Medium | M | 9 · P2 |
| LAT-14 | Nav | Presentations hidden under filter chips | Low | XS | 9 · P3 |
| LAT-16 | Assets | Preview-failure copy inconsistent | Low | S | 9 · P3 |
| LAT-17 | UI | Duplicate recent-kind icon maps | Low | XS | 9 · P3 |

### 15a.4 Verification & compatibility

All Phase 8.5 changes are **additive** — a new card type, a shared-module extraction, one icon, and edits across nine files (model, dnd, store, `BoardCanvas`, `CanvasToolbar`, `Sidebar`, `Inspector`, `ImportService`, `CommandPalette`, `TopBar`) plus tests. No data migration is required; pre-Phase-8.5 boards and vaults load unchanged. A `test` script (`vitest run`) was added to `package.json`. Verification: typecheck ✅, production build ✅, unit tests ✅ (3/3); interactive card-render spot-check was environment-blocked and is flagged for re-verification before release.

## 15b · Phase 9 roadmap

Phase 8.5's prioritized remediation plan (`docs/ux-ui-remediation-roadmap.md`) defines most of Phase 9; the **P0** item (Presentation-in-Board) already shipped in Phase 8.5 (§15a). Priorities: **P1 before public beta · P2 before broader adoption · P3 refinement.**

**P1 — before public beta**

- **Board canvas keyboard accessibility** (`LAT-2`, Critical) — roving-tabindex node focus, arrow-move, Enter-to-open, a keyboard-invokable "add card" menu; a documented keyboard alternative to drag-and-drop.
- **Propagate the realtime off-state** (`LAT-3`/`COL-1`) — when `VITE_REALTIME_BACKEND` is unset, mark presence/Share surfaces "local / Drive only" so the chip's honesty reaches the features it governs.
- **Lazy-load three.js** (`LAT-4`) — move ~170 kB gz of 3D out of the main bundle behind a Suspense boundary + skeleton (§15.11 flags this).
- **Board virtualization + pause off-screen animation loops** (`LAT-5`) — `IntersectionObserver` to pause off-screen `requestAnimationFrame`/OrbitControls; virtualize nodes; cap concurrent live cards so 100+ card boards stay interactive.
- **Browser history / back-forward** (`LAT-6`) — history entries per mode/entity (without breaking the existing invite-hash handling), enabling entity deep links.
- **Responsive tiers + drawer inspectors** (`LAT-12`) — sidebar/inspectors become drawers below a breakpoint; a defined **Mobile = read-only viewer + comments** tier; unsupported editors show an honest "best on desktop" message.

**P2 — before broader adoption**

- **Demote Split** from a peer mode to a layout toggle on Board/Doc (`LAT-7`); **auto-hide Workspaces** for single-workspace accounts (`LAT-8`).
- **Presenter / slideshow mode** (`LAT-9`) — a full-screen present view with speaker notes (optionally on a second screen) and Esc to exit — the presentation mode's namesake job.
- **Sheet co-editing** — an in-sheet "edits are save-level while another editor is present" notice now (`LAT-10`), with **cell-level sheet CRDT** as the larger follow-up.
- **Status redundancy** (color + icon + text) everywhere status is currently color-only (`LAT-11`); **identity-vs-storage cue** ("signed in ≠ synced — connect Drive to back up", `LAT-13`); **visible board undo/redo** with Ctrl/Cmd+Z (`LAT-15`).
- **Onboarding** — a dismissible 3-step tour or annotated starter board teaching entities-vs-cards / local-vs-cloud / roles (`LAT-18`); an explicit **admin-bootstrap / first-run ownership** moment.
- **Exact doc-range comment anchors** inside rich documents (§15.12).

**P3 — refinement**

- "Decks" sidebar filter chip (`LAT-14`); a standard "can't preview + download original" fallback (`LAT-16`); dedupe the two recent-kind icon maps (`LAT-17`); minimap card-kind colors; **slide-level linking** (`[[Deck#3]]`-style references, now that decks have a slide navigator); tokenize remaining hard-coded hex; a browsable "Supported formats" view over `formatMatrix`.

**Engine & platform (carried forward)**

- Anonymous read-only **public viewer** / published boards — the Phase 8 server groundwork exists (room `defaultAccesses` + metadata flags); this is the no-login share link §15.12 defers.
- **Unified transfer dialog** (import planning → confirm → report in one surface); **CRDT subdocument partitioning** for very large projects.
- Standing items from earlier roadmaps: **File System Access API vault**, **plugin API**, **PR-based GitHub flow**, **remote-deletion management UI**, **billing/subscriptions**, **web clipper**, **AI assistant inside projects**, and **mobile/tablet UI**.

> The AI features the Phase 9 roadmap defers — **AI assistant inside projects**, **plugin API**, contextual automation — all require one thing first: a machine-readable understanding of what a project *is*. That intelligence foundation is specified in **§16 (Phase 9.5 — Project Intelligence)**. Making that same product deployable anywhere, from a laptop to an air-gapped cluster, is specified in **§17 (Phase 10 — Cloud Platform & Deployment Providers)**. Both sections are **forward specifications**, written to the same standard as the shipped phases so they can drive implementation directly.

## 16 · Phase 9.5 — Project Intelligence

> **Status: architectural specification — not yet implemented.** This section defines the design that will drive implementation; it does not describe running code. It is written to the same standard as the shipped phases (§13–§15b) and, in keeping with this project's first principle, it is scrupulous about the line between *what the design guarantees* and *what is deferred* — nothing here is presented as built. Where it names an existing file (`permissions.ts`, `YjsManager`, `outgoingLinks`, …) it is anchoring the new design to code that already exists so the two cannot drift.

Lattice today is a workspace: it stores your notes, documents, sheets, decks, code, assets and boards, syncs them, and lets people co-edit them. It does not yet *understand* them. Phase 9.5 adds the **intelligence layer** — a derived, rebuildable projection of the vault that turns every entity into a node in a semantic **Project Graph**, indexes every entity across a multi-segment **Semantic Index**, and exposes both through five interchangeable providers (search, embeddings, graph, memory, recommendations). It is the layer that lets Lattice stop being *only* a workspace and start being a **creative operating system that understands the project it is holding**.

Crucially, it does this **without replacing the existing storage architecture**. The Zustand vault store, the `StorageProvider` bodies, the Google Drive mirror and the Yjs CRDT rooms remain the single source of truth. The intelligence layer is a *cache with opinions*: everything it holds can be dropped and rebuilt from the vault, so it can never corrupt your data and never has to be migrated (§16.20).

### 16.1 · Why this phase exists

The Phase 9 roadmap lists "AI assistant inside projects" as a standing item, and Phase 8.5's audit repeatedly found the product's **feature threading** to be its weakness — entities that exist but aren't connected (presentations that weren't board cards; decks missing from search/recents). Both problems have the same root cause: **there is no single structure that knows how everything in a project relates to everything else.** Every feature that wants that knowledge — search, backlinks, recommendations, an AI assistant — currently re-derives a slice of it ad hoc.

Phase 9.5 builds that structure once, as shared infrastructure, so that:

- **AI agents** (a later phase) have a grounded, permission-scoped, citable context to reason over instead of a raw dump of files.
- **Semantic search** can find things by meaning, not just by the exact word you typed.
- **Contextual navigation** ("what is near this document?") becomes a graph traversal instead of a guess.
- **Recommendations** (dead links, orphan docs, duplicate content, missing links) fall out of graph + index analysis instead of bespoke scans.
- **Workflow automation** and **plugin intelligence** (future phases) have one API to read project structure from.
- **Project memory** — the durable "what this project is about" — has somewhere to live and something to be derived from.

**Why semantic understanding must come before autonomous AI agents.** An agent that can act (edit a doc, move a card, refactor code, send a comment) is only as safe and useful as the context it reasons over. Give an agent an unstructured pile of files and it will hallucinate relationships, miss the authoritative document, leak content across permission boundaries, and cite nothing. Give it a **typed graph** (this decision *supersedes* that one; this asset *is depended on by* that model; this doc *was edited by* the owner yesterday) plus a **permission-scoped, cited context package**, and its output becomes grounded, checkable, and safe to gate. Phase 9.5 is the substrate; agents are the workload. Building the workload first would mean building the substrate badly, three times, inside three features. The graph and the context engine are therefore prerequisites, not companions, to the agent work — and they are independently valuable (search, navigation, insights) even if no agent is ever switched on.

**How this differs from keyword search.** Keyword search answers *"which entities contain this string?"*. It cannot answer *"which entities are about this idea?"*, *"what is related to this document?"*, *"what did we decide about auth?"*, or *"what is this project, in one paragraph?"* — because those require **meaning** (embeddings), **structure** (the graph) and **memory** (durable derived knowledge). Keyword search is one of five search modes here (§16.7), not the whole story. The intelligence layer is the difference between a filing cabinet that can be grepped and a colleague who has read the project.

### 16.2 · Design principles (non-negotiable)

These constraints are inherited from the rest of Lattice and are what keep the feature honest. Every subsection below is written to satisfy them.

| # | Principle | What it forces |
|---|---|---|
| P1 | **Derived, never authoritative** | The graph and index are a *projection* of the vault. Source of truth stays in the store + `StorageProvider` + CRDT. The layer is rebuildable from scratch; dropping it loses nothing. |
| P2 | **Additive, never replacing storage** | No existing path changes. Indexing hooks the *same* digest-on-save moment that already updates `RichDocMeta.outline`/`snippet`. Bodies are read through the existing `StorageProvider`; nothing new owns your data. |
| P3 | **Provider-based, no vendor lock-in** | `SearchProvider`, `EmbeddingProvider`, `GraphProvider`, `MemoryProvider`, `RecommendationProvider` — each an interface with honest `capabilities`, a strict `isAvailable()`, a local implementation and an optional cloud implementation. Same pattern as `CollaborationProvider`/`StorageProvider`. |
| P4 | **Offline-first / local-first** | Every capability has a **local implementation that works with zero backend**: local keyword index, local graph, local memory. Embeddings degrade honestly to "disabled" (semantic search falls back to keyword) when no model is configured — never faked. |
| P5 | **Honest capability reporting** | If semantic search is off, the search box says so and hybrid quietly becomes keyword. If the graph is still backfilling, a progress chip says so. Relevance is never invented; a "match" always traces to real evidence. |
| P6 | **Permission-scoped, no leakage** | The index is partitioned per project; every query carries a `PermissionContext` and is filtered against the **same `src/lib/collab/permissions.ts` matrix the UI and realtime server already use**. A viewer's search can never surface a snippet they couldn't open. |
| P7 | **Digest-on-save, incremental** | Entities are indexed the moment they change, one at a time, off the main thread. No global re-scan on load; no "reindex everything" button as the normal path. |

> **The mental model:** *The vault is the territory. The Project Graph is the map. The Semantic Index is the legend. Memory is what the cartographer remembers. None of them are the territory, and any of them can be redrawn from it.*

### 16.3 · Architecture overview

The layer sits **beside** the vault, fed by the same save events, and is consumed by new UI surfaces (global search, graph view, insights, recommendations) and by the future AI/agent and plugin layers. One router — the `IntelligenceHub`, modelled directly on the existing `CollabHub` (§13) — owns the providers and fans work out to whichever are available.

```
        ┌───────────────────────────────────────────────────────────────┐
        │                         Consumers (UI)                        │
        │  GlobalSearch · KnowledgeGraphView · InsightsDashboard ·      │
        │  RecommendationsPanel · MemoryPanel · ContextInspector        │
        └───────────────┬───────────────────────────────┬──────────────┘
                        │ hooks (useSearch/useGraph/…)   │  (future)
        ┌───────────────┴───────────────────────────────┴──────────────┐
        │              AI / Agent layer (Phase 10+) · Plugin API        │
        │        consumes ContextPackage + Graph + Search only          │
        └───────────────────────────────┬───────────────────────────────┘
                                        │  read-only, provider-mediated
        ┌───────────────────────────────┴───────────────────────────────┐
        │                    IntelligenceHub (router)                    │
        │   registers available providers · routes index/query/derive   │
        │   · reports honest capabilities · owns the background worker   │
        └──┬──────────────┬──────────────┬──────────────┬───────────────┘
           │              │              │              │            │
   ┌───────┴──┐  ┌────────┴───┐  ┌───────┴────┐  ┌──────┴─────┐  ┌───┴──────┐
   │ Graph    │  │ Search     │  │ Embedding  │  │ Memory     │  │ Recommend│
   │ Provider │  │ Provider   │  │ Provider   │  │ Provider   │  │ Provider │
   └───────┬──┘  └────────┬───┘  └───────┬────┘  └──────┬─────┘  └───┬──────┘
           │              │              │              │            │
        ┌──┴──────────────┴──────────────┴──────────────┴────────────┴──┐
        │           Derivation pipeline (Web Worker, incremental)       │
        │  extractors → nodes/edges → segments → embeddings → memory    │
        └───────────────────────────────┬───────────────────────────────┘
                                        │ reads (never writes) via digest-on-save
        ┌───────────────────────────────┴───────────────────────────────┐
        │        SOURCE OF TRUTH (unchanged) — the existing vault        │
        │  Zustand store · StorageProvider bodies · Drive mirror ·      │
        │  Yjs CRDT rooms · ActivityLog · CommentService · versions     │
        └───────────────────────────────────────────────────────────────┘
```

Read the diagram top-down for *consumption* and bottom-up for *derivation*. The one rule the arrows encode: **information only ever flows up out of the vault.** The intelligence layer reads the vault; it never writes to it. When a recommendation or an agent wants to *change* something, it does so through the normal store/CRDT mutation paths that already enforce permissions and realtime — never by editing the index or graph directly.

Named abstractions and where they will live:

| Abstraction | File | Role |
|---|---|---|
| `IntelligenceHub` | `src/lib/intelligence/IntelligenceHub.ts` | router + provider registry + worker owner (mirrors `CollabHub`) |
| `GraphProvider` | `src/lib/intelligence/graph/GraphProvider.ts` | typed node/edge store + traversal (local: IndexedDB adjacency) |
| `SearchProvider` | `src/lib/intelligence/index/SearchProvider.ts` | multi-segment index + unified query (local: inverted index + optional vectors) |
| `EmbeddingProvider` | `src/lib/intelligence/embedding/EmbeddingProvider.ts` | text → vector (local optional / cloud proxy / disabled) |
| `MemoryProvider` | `src/lib/intelligence/memory/MemoryProvider.ts` | durable derived knowledge with confidence + provenance |
| `RecommendationProvider` | `src/lib/intelligence/recommend/RecommendationProvider.ts` | graph/index-derived suggestions |
| `InsightsProvider` | `src/lib/intelligence/insights/InsightsProvider.ts` | dashboard widgets over graph + index + activity |
| `IndexJournal` | `src/lib/intelligence/index/IndexJournal.ts` | dirty-set of entities awaiting (re)derivation |
| `intelligenceStore` | `src/lib/intelligence/intelligenceStore.ts` | Zustand: provider status, backfill progress, query/graph caches |

### 16.4 · The Project Graph

The Project Graph is a **typed, directed multigraph**. Every entity in a project becomes a **node**; every meaningful relationship becomes a **typed edge**. It is the structural half of the intelligence layer (the semantic half is the index, §16.5), and the two are joined: the graph's `relationship` segment *is* an index segment, so a search can rank by structure and a traversal can be seeded by a search.

#### 16.4.1 · Node model

```ts
// src/lib/intelligence/graph/graphModel.ts
export type NodeKind =
  // organizational
  | 'workspace' | 'project' | 'board' | 'section' | 'card'
  // documents & content (exist today)
  | 'note' | 'richdoc' | 'code' | 'sheet' | 'presentation' | 'asset'
  // collaboration (exist today)
  | 'comment' | 'areaComment' | 'version' | 'notification' | 'user'
  // reserved — emit no nodes until the entity exists (see note)
  | 'task' | 'automation' | 'calendarEvent' | 'designFile'
  | 'integration' | 'plugin' | 'aiAgent' | 'aiMemory'

export interface GraphNode {
  /** kind-qualified, globally unique: e.g. "richdoc:doc_x1", "card:brd_a::nd_9" */
  id: string
  kind: NodeKind
  /** the underlying entity id in the vault (doc_x1, asset_y2, …) */
  refId: string
  projectId: string
  workspaceId: string
  title: string
  snippet?: string
  tags: string[]
  createdAt: number
  updatedAt: number
  /** kind-specific digested fields (slideCount, lineCount, mime, role…) */
  digest: Record<string, unknown>
  /** which realtime room governs visibility: content vs collab (see §16.14) */
  scope: 'content' | 'collab'
  /** provenance for rebuild: which vault record + hash produced this node */
  source: { store: string; hash: string; derivedAt: number }
}
```

**Entity → node mapping.** Every node kind maps to a real (or reserved) vault entity. The mapping is a **registry of extractors**, one per kind — adding a new entity kind means adding one extractor, never touching the schema:

| Node kind | Source entity (file) | Status |
|---|---|---|
| `workspace` | `Workspace` (`types/model.ts`) | ✅ exists |
| `project` | `Project` | ✅ exists |
| `board` / `section` / `card` | `Board`, `BoardSection`, `BoardNode`/`CardData` | ✅ exists |
| `note` | `NoteDoc` | ✅ exists |
| `richdoc` | `RichDocMeta` | ✅ exists |
| `code` | `CodeDocMeta` | ✅ exists |
| `sheet` | `SpreadsheetDocMeta` | ✅ exists |
| `presentation` | `PresentationDocMeta` | ✅ exists |
| `asset` | `AssetDoc` (incl. `AssetBundleInfo`) | ✅ exists |
| `comment` / `areaComment` | `CommentThread` / area comments (`CommentService`) | ✅ exists |
| `version` | version snapshots (`VersionHistoryService`) | ✅ exists |
| `notification` | `NotificationService` records | ✅ exists |
| `user` | `ProjectMember` / `Account` | ✅ exists |
| `task` | Tasks | ⏳ reserved (no entity yet) |
| `automation` | Automation rules | ⏳ reserved |
| `calendarEvent` | Calendar events | ⏳ reserved |
| `designFile` | Design integration files | ⏳ reserved |
| `integration` | Drive / GitHub / future connectors | ◑ partial (Drive & GitHub links exist as `ProjectSettings`/sync state; promoted to nodes here) |
| `plugin` | Plugin registry entries | ⏳ reserved (plugin API is roadmap) |
| `aiAgent` | Agent definitions | ⏳ reserved (Phase 10+) |
| `aiMemory` | `MemoryItem` (§16.9) | ✅ new in this phase |

> **Honesty note (reserved kinds).** Tasks, Automation, Calendar Events, Design Files, Plugins and AI Agents are **reserved in the schema but emit no nodes until those entities exist.** The extractor registry simply has no extractor registered for them yet, so the graph is complete with respect to *what a project actually contains today*, and grows automatically as those phases land. The alternative — inventing placeholder nodes — would violate P5. The schema reserves the vocabulary so that when Tasks ship, the graph gains `task` nodes and `assignedTo`/`blocks` edges without a migration.

#### 16.4.2 · Typed edges

Every relationship is an edge with a **type**, a **direction**, a **weight** (0–1, used by ranking and centrality) and an **origin** (was it *derived* from content, or *explicit* — drawn by a user?). Weight lets a strong signal (an explicit board link, a `dependsOn`) outrank a weak one (a passing `mentions`).

```ts
export type EdgeKind =
  | 'contains'      // board→card, section→card, project→entity, workspace→project
  | 'belongsTo'     // inverse of contains (entity→project→workspace)
  | 'references'    // resolved [[wikilink]] between docs/notes/code
  | 'mentions'      // @user, #tag, or unresolved textual reference
  | 'embeds'        // richdoc→asset (linkedAssets), card→entity it displays
  | 'linkedTo'      // explicit board edge (React Flow) between two cards
  | 'dependsOn'     // asset bundle deps, code imports (symbol index)
  | 'imports' | 'exports'   // code module graph (§16.5 code-symbol segment)
  | 'extends' | 'implements'// code type graph (reserved until symbol index deepens)
  | 'derivedFrom'   // entity→its imported original (sourceAssetId)
  | 'versionOf'     // version snapshot→entity
  | 'createdBy' | 'editedBy'// entity→user (from ActivityLog / version authors)
  | 'commentedOn'   // comment→target entity
  | 'assignedTo'    // comment/task→user (Comments 2.0 assignment)
  | 'generatedBy'   // entity→aiAgent that produced it (reserved)
  | 'syncedTo'      // entity→integration (GitHub file, Drive object)

export interface GraphEdge {
  id: string
  from: string           // GraphNode.id
  to: string             // GraphNode.id
  kind: EdgeKind
  weight: number         // 0..1
  directed: boolean
  origin: 'derived' | 'explicit'
  /** what proves this edge — the wikilink text, the import path, the activity id */
  evidence?: string
  createdAt: number
  updatedAt: number
}
```

**Edge derivation — where every edge actually comes from.** This is the part that keeps the graph honest: it is not an LLM guessing relationships, it is a deterministic read of data Lattice already maintains.

| Edge | Derived from (existing code) |
|---|---|
| `contains` / `belongsTo` | `projectId` on every entity; `Workspace.projectIds`; `BoardSection.childCardIds`; a board's `nodes` |
| `references` | `RichDocMeta.outgoingLinks`, `CodeDocMeta.outgoingLinks`, `NoteDoc` `[[wikilinks]]` — **the existing link graph**, resolved to targets |
| `mentions` | unresolved `[[links]]`, `@mentions` in comments, `#tags` shared between entities |
| `embeds` | `RichDocMeta.linkedAssets`; `CardData.{noteId,docId,codeId,sheetId,presentId,assetId}` (a card *embeds* the entity it renders) |
| `linkedTo` | a board's `edges` (React Flow) — an explicit user-drawn connection between two cards, lifted to a link between the entities they reference |
| `dependsOn` | `AssetBundleInfo.dependencies` (GLTF→textures, OBJ→MTL); code import statements once the symbol segment is built |
| `derivedFrom` | `sourceAssetId` on `RichDocMeta`/`CodeDocMeta`/`SpreadsheetDocMeta`/`PresentationDocMeta` (the preserved imported original) |
| `versionOf` | `VersionHistoryService` snapshots |
| `createdBy` / `editedBy` | `ActivityLogService` events and version-snapshot authors |
| `commentedOn` / `assignedTo` | `CommentService` thread targets and Comments-2.0 assignees |
| `syncedTo` | `ProjectSettings.github` links and Drive object paths (§5/§6) |

Because every edge cites `evidence` and an `origin`, the graph is **explainable**: any relationship in the graph view can answer "why is this here?" by pointing at the wikilink, the import, the bundle dependency or the activity record that produced it. Derived edges are recomputed when their source entity is re-digested; explicit edges (board links) change only when the user changes them.

#### 16.4.3 · Traversal

`GraphProvider` exposes traversal as a small, composable API. All traversals are **permission-filtered** (§16.14) and **depth-bounded** (P4/P7 — the whole graph is never materialized):

```ts
export interface GraphProvider {
  readonly id: 'local' | `cloud-${string}`
  readonly label: string
  readonly capabilities: GraphCapabilities // {centrality, clusters, pathfinding, maxNodes, persisted}
  isAvailable(): boolean

  upsertNodes(nodes: GraphNode[]): Promise<void>
  upsertEdges(edges: GraphEdge[]): Promise<void>
  removeByRef(refIds: string[]): Promise<void>

  node(id: string, ctx: PermissionContext): Promise<GraphNode | null>
  /** one hop: neighbours filtered by edge kind / direction */
  neighbours(id: string, opts: NeighbourOpts, ctx: PermissionContext): Promise<GraphEdge[]>
  /** bounded BFS/DFS neighbourhood for the graph view + context engine */
  subgraph(seeds: string[], opts: TraverseOpts, ctx: PermissionContext): Promise<SubGraph>
  /** shortest path(s) between two nodes (graph-view path finding) */
  paths(from: string, to: string, opts: PathOpts, ctx: PermissionContext): Promise<Path[]>
  /** ranked importance (degree / weighted PageRank) for sizing + ranking */
  centrality(projectId: string, ctx: PermissionContext): Promise<Map<string, number>>
  /** community detection for the graph view's clusters */
  clusters(projectId: string, ctx: PermissionContext): Promise<Cluster[]>
}
```

- **`neighbours` / `subgraph`** are the workhorses: "what is one hop from this document, along `references` and `embeds` edges, that I can see?" powers contextual navigation, the graph view's expand/collapse, and the context engine's k-hop gather (§16.8).
- **`paths`** powers the graph view's "how are these two things connected?" — e.g. a path `spec.md —references→ Auth deck —embeds→ diagram.png`.
- **`centrality`** ranks hubs (a doc everything links to) higher in search (§16.7) and sizes nodes in the graph view (§16.10).
- **`clusters`** groups the graph into communities (roughly: sub-topics) for the graph view and for the "Knowledge Coverage" insight (§16.12).

**Local storage of the graph.** The local `GraphProvider` persists nodes and edges as two IndexedDB object stores keyed by `projectId`, with in-memory adjacency lists hydrated **lazily per project** on first access and evicted under memory pressure (§16.15). Traversal never loads another project's partition. A cloud `GraphProvider` (optional) backs the same interface with a managed graph/relational store for very large or cross-project graphs, reporting higher `maxNodes` in its capabilities — but the default, offline path is fully local.

### 16.5 · The Semantic Index

Where the graph knows *structure*, the index knows *content*. The Semantic Index is **not one index** — it is a set of purpose-built **segments**, each answering a different kind of question, each backed by a provider, all fed from the same derivation pipeline and all queried through one `SearchProvider` (§16.7). Splitting by segment is what lets a single query blend "the word appears here" with "this means the same thing" with "this is structurally central" without any one store having to do all three badly.

```ts
export type IndexSegmentKind =
  | 'keyword'          // inverted index: tokens → postings (BM25-style scoring)
  | 'vector'           // embeddings for semantic similarity (§16.6)
  | 'relationship'     // the Project Graph adjacency (shared with §16.4)
  | 'metadata'         // structured fields: kind, tags, dates, author, project
  | 'activity'         // recency/hotness from the ActivityLog
  | 'codeSymbol'       // functions/classes/imports parsed from code bodies
  | 'docOutline'       // RichDocMeta.outline (headings) for section-level hits
  | 'sheetStructure'   // sheet names + header rows + named ranges
  | 'presentStructure' // slide titles + speaker notes
  | 'assetMetadata'    // kind, mime, dimensions, duration, bundle deps
  | 'pluginMetadata'   // fields contributed by plugins (reserved)
```

Every entity produces one canonical **index record**, plus zero or more segment entries derived from it:

```ts
// src/lib/intelligence/index/indexModel.ts
export interface IndexRecord {
  nodeId: string          // matches GraphNode.id
  refId: string
  projectId: string
  kind: NodeKind
  scope: 'content' | 'collab'
  /** normalized searchable text: title + snippet + digested body text */
  text: string
  tokens?: string[]       // keyword segment (lazy)
  outline?: OutlineItem[] // docOutline segment
  symbols?: CodeSymbol[]  // codeSymbol segment
  embedding?: Float32Array | null  // vector segment; null ⇒ semantic disabled
  embeddingModel?: string
  vectorDim?: number
  metadata: Record<string, unknown>
  /** skip re-derivation when the body is unchanged (P7) */
  contentHash: string
  updatedAt: number
  indexedAt: number
}
```

What each segment is for, and where its data comes from — again, mostly from fields Lattice already digests on save:

| Segment | Answers | Source |
|---|---|---|
| `keyword` | "which entities contain these words?" | tokenized `text` (title + `snippet` + body) → inverted index with positions for phrase/proximity |
| `vector` | "which entities *mean* this?" | `EmbeddingProvider` over chunked `text` (§16.6); cosine similarity |
| `relationship` | "what is near this?" | the graph (§16.4) — shared, not duplicated |
| `metadata` | "filter to decks, tagged `#launch`, edited this week, by the owner" | structured fields already on every `*DocMeta` |
| `activity` | "what is hot / recently touched?" | `ActivityLogService` — decayed recency score per entity |
| `codeSymbol` | "where is `parseInvite` defined / imported?" | shallow parse of code bodies → symbols + import edges |
| `docOutline` | "jump to the *Permissions* heading inside this doc" | `RichDocMeta.outline` (already digested) |
| `sheetStructure` | "which sheet has a `Revenue` column?" | `SpreadsheetDocMeta.sheetNames` + digested header row |
| `presentStructure` | "which slide mentions pricing?" | `PresentationDocMeta` snippet + per-slide titles/notes |
| `assetMetadata` | "find the 30 s MP4s / the GLB with missing textures" | `AssetDoc` fields + `AssetBundleInfo` |
| `pluginMetadata` | plugin-defined | plugin contributions (reserved) |

**Incremental indexing.** The pipeline hooks the **same digest-on-save moment** that already refreshes `snippet`/`outline`/`linkedAssets`. On every entity mutation the entity's `refId` is pushed to the `IndexJournal` (a dirty set persisted in IndexedDB, so a crash mid-index resumes). A background worker drains the journal: for each dirty entity it (1) re-extracts the node + edges, (2) checks `contentHash` — if unchanged, only cheap segments (activity, metadata) update and the expensive embedding is **reused**, (3) updates each affected segment, (4) invalidates dependent caches (query cache, any subgraph touching the node, any `MemoryItem` citing it). There is no full re-scan on project open — only a one-time **backfill** for pre-9.5 vaults (§16.20).

**Provider-based, everywhere.** The keyword and metadata segments are always local (they are cheap and offline-first). The vector segment is only as capable as the configured `EmbeddingProvider` (§16.6) — with none configured, the segment is empty and honestly reported as such, and every query that would use it falls back (§16.7). A cloud `SearchProvider` may implement several segments in a managed store (e.g. Postgres + `pgvector`), but it backs the identical `SearchProvider` interface, so the app cannot tell the difference beyond the reported `capabilities`.

### 16.6 · Embeddings

Semantic search, "related documents", duplicate/near-duplicate detection and the context engine's relevance ranking all rest on **embeddings**: fixed-length vectors where distance approximates meaning. Embeddings are the one part of the intelligence layer that may need a model Lattice does not ship, so they get their own provider with the strictest honesty rules.

```ts
export interface EmbeddingProvider {
  readonly id: 'none' | 'local' | `cloud-${string}`
  readonly label: string
  readonly capabilities: EmbeddingCapabilities
  // { model, dimensions, maxInputTokens, batch, offline, costTier }
  isAvailable(): boolean
  /** batched; returns one vector per input, or null entries it could not embed */
  embed(inputs: EmbedInput[], signal?: AbortSignal): Promise<(Float32Array | null)[]>
  /** the tokenizer/inputs it expects, so chunking can match the model */
  chunkHint(): { maxTokens: number; overlap: number }
}
```

Three honest implementations, exactly mirroring the conversion-backend pattern (§15.9):

- **`none` (default).** No embeddings. `isAvailable()` is `false`; the vector segment stays empty; semantic and hybrid search degrade to keyword (§16.7) with a visible "Semantic search off — configure an embedding provider" note. **Nothing is faked** — the app never ships zero-vectors or random vectors to pretend it works.
- **`local`.** An in-browser model (e.g. a small quantized sentence-transformer via WASM) or a user-run local endpoint. Fully offline, private (text never leaves the device), but heavier to load and slower — so it is **opt-in**, lazy-loaded behind a Suspense boundary + skeleton, and honestly labelled as "on-device (slower, private)". Its dimensions and model id are reported in `capabilities`.
- **`cloud-*`.** A hosted embedding endpoint reached **only through a server-side proxy** (`api/intelligence/embed`), so the API key is never in the client bundle — the same discipline as `LIVEBLOCKS_SECRET_KEY`/`GITHUB_CLIENT_SECRET`. Requires explicit consent before any text leaves the device (§16.21), enforces batch/rate/size caps, and redacts secret-flagged content (via `src/lib/security/secrets.ts`) before sending.

**Chunking.** Long bodies are split into overlapping chunks sized to `chunkHint()` so that a hit can point at the *relevant passage*, not just the whole file; chunk vectors are stored with a back-reference to their `nodeId` and character range (for "jump to match"). Titles and outlines are embedded separately (a short, high-signal vector) so that a title match ranks distinctly from a deep-body match.

**Model changes are versioned.** A record stores `embeddingModel` + `vectorDim`; changing the provider/model bumps `EMBED_SCHEMA_VERSION`, and the layer **re-embeds in the background** (old vectors served until the new ones land — no blank search window). Vectors from two different models are never compared; the vector segment is partitioned by model id.

### 16.7 · Global Search

Global Search is the primary consumer of the index and the first surface most users will meet. It extends the existing **command palette** (Ctrl/Cmd+K, §8) rather than replacing it: today the palette does scoped title matching; Phase 9.5 upgrades it into a **single search box** over the whole intelligence layer, with results **grouped by kind** and a choice of **search modes**.

```
┌──────────────────────────────────────────────────────────────┐
│  🔎  auth flow                                   [Hybrid ▾]   │
├──────────────────────────────────────────────────────────────┤
│  Top results                                                 │
│    📄 Auth architecture spec        richdoc · 3 links · 92%  │
│    🎞 Auth flow (deck, slide 4)     present · edited 2d · 88% │
│    ‹ ›  code  parseInvite()         code · imports 3 · 81%    │
│  Documents (5)   ▸                                            │
│  Presentations (2) ▸                                          │
│  Code (4)  ▸        Comments (3) ▸    Assets (1) ▸            │
│  AI Memory (1) ▸  "Auth uses Google identity; ACLs per room" │
└──────────────────────────────────────────────────────────────┘
```

**Result groups.** Results are bucketed by node kind so the answer is scannable: **Projects · Documents · Sheets · Presentations · Code · Assets · Comments · Tasks · Plugins · Integrations · AI Memory** (empty groups are hidden; reserved kinds appear only once they have entities). Above the groups sits a small cross-kind **Top results** band — the globally highest-ranked few, regardless of kind — so the single best hit is always one glance away. Every result row shows *why it ranked*: a match reason ("title", "semantic", "3 backlinks", "edited 2d"), never a bare percentage with no provenance (P5).

**Search modes.** The mode selector is explicit because the modes answer genuinely different questions, and because a mode's availability depends on which providers are configured:

| Mode | What it does | Backed by | When unavailable |
|---|---|---|---|
| **keyword** | exact/phrase/proximity token match, BM25-style | `keyword` segment | always available (local) |
| **semantic** | nearest neighbours by meaning | `vector` segment + `EmbeddingProvider` | greyed out with a reason when embeddings are `none`; never silently empty |
| **hybrid** *(default)* | fuses keyword + semantic by reciprocal-rank fusion | both | **falls back to keyword** when embeddings are off, and the box says "semantic off — showing keyword" |
| **fuzzy** | typo-tolerant match (trigram / bounded edit distance) on titles & symbols | `keyword` + `codeSymbol` | always available |
| **graph** | seed from the current entity (or a match) and expand along edges — "what's related", not "what contains a word" | `relationship` segment (§16.4) | always available (structure is local) |

**Ranking.** Within a group, results are scored by a transparent weighted blend, then groups are ordered by their best member; the **Top results** band is the global argmax over the same score:

```
score(entity, query) =
    w_lex   · lexical(keyword/BM25)          // exact words matter
  + w_sem   · semantic(cosine, if available)  // meaning matters
  + w_rec   · recency(activity segment)       // fresh things matter
  + w_cen   · centrality(graph)               // hubs matter
  + w_ctx   · contextBoost(current focus)     // near what I'm looking at matters
  + bonuses  (exact-title, tag match, symbol-def, same-project proximity)
```

- **hybrid** blends the *rankings* (reciprocal-rank fusion) rather than raw scores, so keyword and semantic don't need comparable scales and one bad scale can't dominate.
- **recency** decays via the `activity` segment, so "the doc I edited an hour ago" surfaces over a stale namesake.
- **centrality** (from `GraphProvider.centrality`) lets a heavily-linked hub document win ties — the same intuition as PageRank.
- **contextBoost** raises entities near the user's current focus in the graph, so search from inside the *Auth* doc leans toward auth-related hits. Weights live in one `rankingWeights.ts` module (tunable, testable, not scattered), defaulting to sensible values and overridable per query.

**Query pipeline & the `SearchProvider` interface.** A query is parsed (free text + optional filters like `kind:deck tag:launch edited:<7d`), scoped to the caller's accessible projects, fanned to the relevant segments in parallel, fused, permission-filtered **again** post-fusion (defence in depth, §16.14), grouped and returned:

```ts
export interface SearchProvider {
  readonly id: 'local' | `cloud-${string}`
  readonly label: string
  readonly capabilities: SearchCapabilities
  // { modes: SearchMode[], segments: IndexSegmentKind[], crossProject, maxResults }
  isAvailable(): boolean

  index(records: IndexRecord[]): Promise<void>
  remove(nodeIds: string[]): Promise<void>
  clear(projectId?: string): Promise<void>

  query(q: SearchQuery, ctx: PermissionContext): Promise<SearchResultSet>
}

export interface SearchQuery {
  text: string
  mode: SearchMode                 // keyword | semantic | hybrid | fuzzy | graph
  filters?: SearchFilters          // kind, tags, dateRange, author, projectIds
  seed?: string                    // node id, for graph mode / contextBoost
  limit?: number
}

export interface SearchResult {
  nodeId: string; refId: string; kind: NodeKind; projectId: string
  title: string; snippet: string
  score: number
  reasons: MatchReason[]           // ['title','semantic','3 backlinks'] — always populated
  match?: { segment: IndexSegmentKind; range?: [number, number] } // jump-to-passage
}
```

The **local** `SearchProvider` implements every mode over the local segments and reports `crossProject: true` only across projects the user can access. A **cloud** `SearchProvider` may add a managed vector store and report a higher `maxResults`, but the app consumes it through the identical interface — and if it goes unavailable, the hub falls back to local (P4), so search never simply breaks.

### 16.8 · AI Context Engine

The Context Engine is the bridge from the intelligence layer to any future LLM: its single job is to **assemble the best possible, permission-safe, cited context for a given focus and intent**, as a structured package — and to do so **without any LLM vendor dependency**. It produces neutral data; a later phase's `AgentProvider` (§16.24, Phase 10+) serializes that data into a prompt for whatever model is configured. Keeping assembly and prompting separate is what lets the same context feed a cloud model, a local model, or a plain "copy context" button.

**Inputs.** The engine gathers from everything the earlier sections built:

| Input | Source |
|---|---|
| current document / entity | the active editor's `refId` |
| selected entities | multi-select on the board / sidebar |
| linked assets | `embeds` edges + `RichDocMeta.linkedAssets` |
| project graph neighbourhood | `GraphProvider.subgraph(seeds, k-hop)` |
| recent edits | `activity` segment (what changed lately, by whom) |
| current task | the intent string / a `task` node once tasks exist |
| user role | `PermissionContext` from `permissions.ts` |
| workspace metadata | project/workspace name, description, settings |

**Pipeline.** `gather → expand → rank → prune-to-budget → redact → assemble`:

1. **gather** the focus + explicit selection.
2. **expand** along the graph (k-hop `subgraph`, biased to `references`/`embeds`/`dependsOn`, weighted edges first) and by semantic similarity to the focus (`vector` segment) — structure *and* meaning.
3. **rank** candidates by relevance to the focus and intent (a blend of the §16.7 signals).
4. **prune to a token budget** using a pluggable `Tokenizer` — the engine never emits more than the caller's `maxTokens`, dropping lowest-relevance items first and summarizing overflow.
5. **redact** by permission: any item the user (or the target agent's scope) cannot read is removed *before* assembly, and the count is reported.
6. **assemble** a `ContextPackage` with ordered sections and a **citation for every item**, so downstream generations can be grounded and checked.

```ts
export interface ContextPackage {
  version: 1
  projectId: string
  focus: ContextRef                 // the entity/selection this context is about
  intent?: string                   // "summarize" | "answer: …" | a task
  budget: { maxTokens: number; usedTokens: number }
  sections: ContextSection[]        // focus → linked → related → memory → activity → schema
  citations: Citation[]             // every item traces to a nodeId + range
  redactions: number                // how many items were withheld by permission
  provider: { embedding?: string; tokenizer: string }
  generatedAt: number
}
export interface ContextSection {
  kind: 'focus' | 'linked' | 'related' | 'memory' | 'activity' | 'schema'
  title: string
  items: ContextItem[]              // { nodeId, title, text, why, tokens }
}
```

**Provider-mediated, vendor-neutral.** The engine calls only `GraphProvider`, `SearchProvider`, `EmbeddingProvider` and `MemoryProvider` — never a model API. There is no OpenAI/Anthropic/etc. import anywhere in `context/`. The `Tokenizer` is an interface with an honest approximate default (character/word heuristic) and optional exact implementations; `usedTokens` is always reported so callers can trust the budget. The whole package is inspectable in a **Context Inspector** panel (§16.13) — a user (or auditor) can see exactly what would be sent to a model, and why each piece is there, before anything is sent.

### 16.9 · Project Memory

Search and context are *momentary* — computed per query. **Project Memory** is the *durable* layer: the small set of statements that capture "what this project is about" and persist across sessions, so the project (and later, an agent) doesn't re-derive its own premises every time. Memory is derived, but — unlike the index — it is **reviewable and editable**, because a durable claim carries more weight than a search hit and therefore earns human oversight.

```ts
export type MemoryKind =
  | 'fact' | 'decision' | 'glossary' | 'convention'
  | 'risk' | 'summary' | 'entityProfile'
export type MemoryStatus = 'candidate' | 'approved' | 'rejected' | 'stale'

export interface MemoryItem {
  id: string
  projectId: string
  kind: MemoryKind
  title: string
  body: string
  /** provenance — every memory traces to the nodes it was derived from */
  sources: MemorySource[]           // { nodeId, evidence, at }
  confidence: number                // 0..1
  status: MemoryStatus
  createdBy: 'system' | string      // userId if hand-written/edited
  approvedBy?: string
  supersedes?: string               // memory this replaces (decisions evolve)
  lastVerifiedAt: number
  staleAfter?: number               // recompute cadence
  createdAt: number
  updatedAt: number
}
```

**What memory is extracted from.** The same substrate as everything else: **documents** (headings, summaries), **meetings** (once transcripts exist — reserved), **code** (conventions, module structure), **comments** (decisions reached in threads), **versions** (what changed and why), **activity** (who owns what), **AI summaries** (the context engine's own digests) and the **semantic graph** (a highly central, heavily-referenced doc is a likely source of project facts). Each `MemoryItem` is itself a graph node (`aiMemory`), so memory is searchable and can be cited by the context engine.

**Lifecycle — the five hard questions the prompt asks:**

- **Memory refresh.** A background job (idle-time, §16.15) periodically re-derives *candidate* memories from changed sources and re-checks existing ones. New candidates enter as `status: 'candidate'`.
- **Confidence score.** `confidence = f(number & authority of sources, agreement across them, recency, corroboration by structure)`. A decision stated in one comment scores lower than one stated in a doc, repeated in a version note, and authored by the owner. Confidence is shown, never hidden, and gates auto-approval (see below).
- **Staleness.** A memory is `stale` when the sources it cites changed materially since `lastVerifiedAt`, or when `staleAfter` elapses. Stale items are flagged in the UI and **demoted** in the context engine (a stale fact is included only with a "may be outdated" marker, or excluded) — they are never silently trusted.
- **Manual edits.** A user can edit any memory. Doing so flips `createdBy` to their `userId`, sets `confidence` high (a human asserted it), and **pins** it — a hand-written memory is authoritative and is not overwritten by the next refresh (the refresh may only mark it stale, prompting re-confirmation). Users can also write memories from scratch.
- **Approval.** By default, **system-derived candidates do not feed the context engine until approved** (a reviewer accepts, edits, or rejects them in the Memory panel). An optional per-project `autoApproveThreshold` (§16.18) may auto-approve candidates above a confidence bar — but the default is human-in-the-loop, because durable project knowledge that an agent will act on deserves a gate. Rejections are remembered (`status: 'rejected'`) so the same weak candidate doesn't reappear every refresh.

> **Honesty rule for memory.** A system-derived memory is always labelled as such, always shows its confidence and its sources, and is always demoted when stale. Memory is *assistive*, not *authoritative*: it accelerates humans and grounds agents, and it never speaks as if it were ground truth. This is the §10/§15 honesty principle applied to derived knowledge.

**Durability & sync.** `MemoryItem`s are durable project state, so they ride the **existing collab CRDT doc** (the same channel that already carries comments/activity/versions, §15.2) — they sync across devices when the realtime backend is attached, persist offline via `y-indexeddb`, and merge deterministically (`ConflictResolverV2`). Memory therefore inherits, for free, the permission scope of the `collab` room.

### 16.10 · Knowledge Graph View

The Project Graph (§16.4) is data; the **Knowledge Graph View** is its visual, interactive mode — an Obsidian-style force-directed picture of the project that you can zoom, filter, cluster and walk. It is a new top-level surface (a graph mode, reachable from the command palette and the sidebar), rendered by a `GraphView` component that reads exclusively through `GraphProvider` — it never touches the vault directly, so it inherits permission-filtering for free.

```
        ┌───────────────────────────────────────────────┐  ┌───────────────┐
        │                                               │  │  Filters      │
        │            ●───────●        ●                 │  │ Kinds:        │
        │           ╱ Auth spec ╲    orphan             │  │  ☑ docs       │
        │      ●───●             ●───● deck (stale)      │  │  ☑ code       │
        │   diagram  ╲          ╱                        │  │  ☐ comments   │
        │             ●────────●  parseInvite()          │  │ Edges:        │
        │              login.ts   (hub · sized ↑)        │  │  ☑ references │
        │                                               │  │  ☑ embeds     │
        │   [cluster: Auth]     [cluster: Billing]      │  │  ☐ editedBy   │
        │                                               │  │ Depth: ●──○ 2 │
        └───────────────────────────────────────────────┘  └───────────────┘
          zoom ⊕ ⊖   fit   ⟲ relayout   ⌕ find   ⇢ path: [A]→[B]
```

**Capabilities** (each maps to a `GraphProvider` call or a client-side view transform):

| Capability | Behaviour | Backed by |
|---|---|---|
| **zoom / pan** | continuous zoom with level-of-detail (labels fade in when close) | client transform |
| **filter — entity types** | toggle node kinds on/off (hide comments, show only docs+code) | client filter over `subgraph` |
| **filter — relationship types** | toggle edge kinds (see only `references` + `embeds`) | client filter |
| **clusters** | community detection groups related nodes; clusters can be collapsed to a single super-node | `GraphProvider.clusters` |
| **search / find** | type to highlight + fly-to matching nodes; results reuse `SearchProvider` | search + `scroll_to` |
| **expand** | double-click a node to pull in its next hop of neighbours | `GraphProvider.neighbours` |
| **collapse** | collapse a node's neighbourhood (or a whole cluster) back to one node | client |
| **path finding** | pick two nodes → highlight the shortest relationship path(s) between them | `GraphProvider.paths` |
| **centrality** | node radius ∝ importance (weighted degree / PageRank); hubs are visibly bigger | `GraphProvider.centrality` |

**Interactions.** Hovering a node highlights it and its immediate edges and dims the rest, with a tooltip (kind, title, degree). Clicking selects; **double-clicking expands** its neighbourhood; the inspector shows the node's details and a "why is this connected?" list of edges with their `evidence`. A node's context menu offers **Open** (jump to the entity in its editor), **Add to context** (seed the Context Engine, §16.8), **Pin**, and **Focus** (re-center the layout on it). Selecting two nodes and hitting **path** draws the connection between them. Dragging repositions a node and pins it against the force simulation; **relayout** re-runs the simulation. Everything is keyboard-navigable (roving-tabindex across nodes, arrow keys to move focus along edges, Enter to open) — this directly honours the Phase 8.5 accessibility finding (`LAT-2`) instead of shipping another pointer-only canvas.

**Rendering & scale.** Small graphs render as SVG (crisp, cheap); above a threshold the view switches to a Canvas/WebGL renderer with viewport culling and label decimation, and the force simulation runs in the **intelligence Web Worker** so the main thread stays responsive. Very large projects are handled by **not drawing everything**: the view opens focused on a seed (the current entity, or the project's top-centrality hubs), and grows by expansion — the whole-graph "constellation" is available but capped with an honest "showing N of M nodes — expand or filter to see more" (P4/P5). Reduced-motion settings pause the simulation and present a settled layout.

### 16.11 · Recommendation Engine

Recommendations are the graph and index *noticing things for you*. The `RecommendationProvider` runs a set of **rules** over the graph + index and emits typed, dismissible suggestions — each with a rationale, an optional one-click action, and a confidence. Recommendations are **suggestions, never automatic actions**: nothing is changed until a human accepts, and every accept routes through the normal permission-checked mutation paths (the engine cannot itself edit the vault, §16.3).

```ts
export interface Recommendation {
  id: string
  projectId: string
  kind: RecommendationKind
  severity: 'info' | 'suggest' | 'warn'
  title: string
  rationale: string                 // human-readable "why", always present
  subjects: string[]                // node ids this concerns
  action?: RecommendationAction     // createLink | merge | archive | openContext | convert…
  confidence: number
  createdAt: number
}
```

**Recommendation catalogue** — every rule is deterministic over data we already have (this is why they can be trusted and explained):

| Recommendation | Rule (over graph + index) |
|---|---|
| **related documents** | top semantic + graph neighbours of the current entity not already linked |
| **duplicate content** | pairs above a high cosine-similarity threshold (near-duplicate bodies) |
| **missing links** | entities that frequently co-occur / are semantically close but have **no** `references` edge → "link these?" |
| **dead links** | `references` edges whose target `refId` no longer resolves — derivable directly from the link graph |
| **unused assets** | `asset` nodes with **no** incoming `embeds`/`linkedTo` edges |
| **orphan documents** | nodes with degree 0 (no links in or out, on no board) |
| **stale presentations** | `presentation` nodes not edited in *N* days whose source docs changed since |
| **duplicate code** | `code` near-duplicates by symbol/embedding similarity |
| **possible automation** | repeated activity patterns (reserved until `automation` entities exist) |
| **plugin suggestions** | file-kind/usage patterns that match a plugin's declared triggers (reserved until the plugin registry ships) |
| **AI suggestions** | Context-Engine-driven "next actions" (e.g. "summarize this thread into a decision memory") |

**Surfacing.** Recommendations appear in a dedicated **Suggestions** panel (grouped by severity) and, where it makes sense, as **inline nudges**: a dead-link badge on a document, an "orphan" chip in the sidebar, a "duplicate?" hint when two very similar docs both open. Each card shows its `rationale`, offers its `action` (e.g. **Create link**, **Archive asset**, **Merge**, **Open in context**) and a **Dismiss** that is remembered (a dismissed recommendation does not nag again unless its underlying condition materially changes). Warnings (dead links, dependency risks) sort above soft suggestions. Because rules are pure functions of the graph/index, the whole set recomputes cheaply in the background as entities change, and each recommendation is independently explainable and testable.

### 16.12 · Project Insights

Where recommendations are point suggestions, **Insights** are the aggregate view — dashboard widgets that summarize the health and shape of a project. `InsightsProvider` computes each widget over the graph, index and activity segments; widgets are cheap, cached, and refreshed on the same incremental cadence as everything else. Each widget reports a value, a trend arrow, and a drill-down (click a widget to see the entities behind it, often as a filtered graph view or search).

| Widget | Question it answers | Computed from |
|---|---|---|
| **Project Health** | "is this project in good shape?" | composite of link density, orphan ratio, staleness, ownership coverage, dead-link count — one 0–100 score with contributing factors |
| **Knowledge Coverage** | "how much of the project is understood?" | % of entities indexed + summarized + covered by an approved memory; gaps by cluster |
| **Documentation Completeness** | "what's undocumented?" | docs-vs-code ratio, code symbols with no referencing doc, empty sections, TODO density |
| **Collaboration Heatmap** | "who's working where, when?" | `ActivityLog` events bucketed by member × time × entity kind |
| **Dependency Risk** | "what breaks if X changes?" | `dependsOn`/`imports` subgraph — high fan-in nodes, external deps, single points of failure |
| **Dead Assets** | "what can we clean up?" | count/list of unused-asset recommendations (§16.11) |
| **Outdated Presentations** | "which decks lie about current state?" | decks stale relative to their source docs' `updatedAt` |
| **Recent AI Activity** | "what has the intelligence layer been doing?" | context packages generated, memory changes, agent runs (once agents exist) |
| **Plugin Usage** | "which plugins earn their keep?" | invocations per plugin (reserved until plugin telemetry exists) |
| **Search Trends** | "what are people looking for — and not finding?" | top queries + **zero-result queries** (a direct signal of content gaps) |

Insights are honest about their own coverage: a widget whose data source doesn't exist yet (Plugin Usage, some AI Activity) renders as **"no data yet — arrives with <phase>"** rather than a fake number. The dashboard is a read-only lens; every number is a query away from the entities that produced it.

### 16.13 · Provider architecture (the five providers)

Everything above is delivered through **five interchangeable providers** plus the `InsightsProvider`, all registered with the `IntelligenceHub` and all following the exact contract Lattice already uses for `CollaborationProvider`/`StorageProvider`: a `readonly id`, a `readonly label`, a `readonly capabilities` object that **honestly self-reports what the implementation can do**, a strict `isAvailable()`, and no pretence. The hub runs whichever providers are available and routes work to them; a consumer (search box, graph view, context engine) asks the hub, never a concrete provider.

```
IntelligenceHub
  ├─ GraphProvider          local ✓ (IndexedDB)     · cloud ○ (managed graph store)
  ├─ SearchProvider         local ✓ (inverted+vec)  · cloud ○ (pgvector / managed)
  ├─ EmbeddingProvider      none ✓(default)·local ○ · cloud ○ (proxied endpoint)
  ├─ MemoryProvider         local ✓ (collab CRDT)   · cloud ○ (shared derivation)
  ├─ RecommendationProvider local ✓ (rules)         · cloud ○ (heavier models)
  └─ InsightsProvider       local ✓ (aggregates)    · cloud ○
        ✓ = default, offline, always present   ○ = optional enhancement
```

**Local implementations (the default, offline path).** Every provider ships a local implementation that works with **zero backend**, so the entire feature is usable on a laptop on a plane:

- **`LocalGraphProvider`** — nodes/edges in IndexedDB, in-memory adjacency hydrated lazily per project; BFS/DFS traversal, degree/PageRank centrality, label-propagation clustering, all on-device.
- **`LocalSearchProvider`** — an inverted index (tokenizer + posting lists) for keyword/fuzzy, the graph for `graph` mode, and — *if an `EmbeddingProvider` is available* — a local vector store (cosine over IndexedDB-persisted `Float32Array`s) for semantic/hybrid. With embeddings off, it is a complete keyword/fuzzy/graph engine and says so.
- **`EmbeddingProvider = none`** by default (§16.6) — an honest "disabled", upgradeable to `local` (on-device model) without touching anything else.
- **`LocalMemoryProvider`** — derives candidates from local data, stores `MemoryItem`s in the collab CRDT doc, runs refresh/staleness on-device.
- **`LocalRecommendationProvider`** / **`LocalInsightsProvider`** — pure functions over the local graph/index.

**Cloud implementations (optional enhancements).** Each provider has an optional cloud form that backs the **same interface** and reports **higher capabilities**, gated by env (§16.18) and honest UI:

- **`CloudSearchProvider`** — a managed index (e.g. Postgres + `pgvector`) for cross-project search at scale and server-side ranking; reports `crossProject: true`, higher `maxResults`.
- **`CloudEmbeddingProvider`** — a hosted embedding endpoint reached only through the `api/intelligence/embed` **server proxy** (keys never in the bundle), with consent + caps + secret redaction.
- **`CloudGraphProvider` / `CloudMemoryProvider` / `CloudRecommendationProvider`** — shared, server-side derivation for very large projects or team-wide memory, so a phone and a laptop see the same computed intelligence.

The hub's rule is the same as `CollabHub`'s: **prefer the richest available provider, fall back to local, never break.** If the cloud search endpoint goes down mid-session, queries transparently serve from the local index (possibly with a "cloud search offline — showing local results" note). Because the interface is identical, swapping vendors — or self-hosting the cloud tier (§17) — changes one registration line, not the app.

### 16.14 · Permissions & no information leakage

An intelligence layer that ignored permissions would be a data-leak engine: semantic search would surface snippets from documents a viewer can't open, the graph would reveal the existence of restricted entities, memory and context would spill privileged facts into an agent's prompt. Phase 9.5 therefore treats permission-scoping as a **structural invariant**, enforced with the **same `src/lib/collab/permissions.ts` matrix the UI and the realtime server already share** — no second, driftable copy of the rules.

Every query, traversal, memory read and context assembly takes a `PermissionContext` and is filtered against it:

```ts
export interface PermissionContext {
  userId: string
  /** projects the user can access at all, with their role in each */
  access: Record<string /*projectId*/, CollabRole>
  /** the current workspace, for cross-project scoping */
  workspaceId: string
}
```

The scoping rules:

- **Workspace / Project.** The index is **partitioned by `projectId`**; a query only ever spans projects present in `ctx.access`. Cross-project ("global") search is the union of *accessible* project partitions — a project you're not a member of is not merely filtered out of results, its partition is never queried, so its existence never leaks through timing or counts.
- **Role.** Within a project, the caller's `CollabRole` gates what surfaces. A `viewer` gets content they can view; a `commenter` additionally gets comments; below-role entities are excluded pre-ranking.
- **Document / Comment scope.** Every `GraphNode`/`IndexRecord` carries `scope: 'content' | 'collab'` matching the two realtime rooms (§15.3). Comments and area comments live in the `collab` scope; a role that can't read the collab room can't get comment hits. This reuses the exact content/collab split the server already enforces on the websocket.
- **Plugin.** Plugin-contributed segments and any future plugin-scoped data are filtered by the plugin's own grant (reserved until the plugin API lands, but the `scope`/grant field is in the schema now).

**Defence in depth.** Filtering happens **twice**: partitions outside `ctx.access` are never read (structural), and the fused result set is filtered again before return (belt-and-braces, catching any ranking-stage mistake). **Memory** inherits the `collab` room's scope; **context packages** redact inaccessible items *before* assembly and report the redaction count (§16.8); **recommendations** and **insights** only ever concern entities in `ctx.access`. Embeddings are stored per-project, so cross-tenant vector leakage is structurally impossible — a similarity search cannot return a neighbour from a project you can't see because that neighbour isn't in the partition being searched. The net guarantee: **the intelligence layer can never reveal, rank, summarize, or cite anything the user could not already open directly.**

### 16.15 · Performance

The layer is designed so that intelligence is something you *never wait for* and that *never degrades the editor*. Every expensive operation is incremental, off-thread, cached, bounded, and offline-capable.

| Concern | Design |
|---|---|
| **Lazy graph loading** | the whole graph is never materialized. Neighbourhoods load on demand (`neighbours`/`subgraph`), per-project adjacency hydrates on first access and evicts under pressure, the graph view opens on a seed and grows by expansion (§16.10). |
| **Incremental indexing** | only entities in the `IndexJournal` dirty-set are re-derived, one at a time, hooked to the existing digest-on-save moment (P7). No full re-scan on load. `contentHash` skips re-embedding unchanged bodies. |
| **Background indexing** | derivation runs in a dedicated **Web Worker** (`indexWorker.ts`), scheduled at idle (`requestIdleCallback`) so typing, dragging and rendering are never blocked. Embedding calls are **batched** and debounced. |
| **Cache** | LRU caches for query results, hydrated subgraphs, centrality maps and embeddings; caches invalidate precisely (only entries touching a changed `nodeId`), so a save doesn't cold-start search. |
| **Offline indexing** | every local provider works fully offline; cloud sync of derived data is deferred and reconciled on reconnect. Indexing a body while offline is normal, not an error state. |
| **Memory limits** | per-project index-size and vector-count **budgets** with eviction (least-recently-relevant first). When a budget is hit the UI is honest — "index truncated to the most recent/most central N; expand to include more" — rather than silently dropping data or blowing up memory. Vector storage uses `Float32Array` (4 bytes/dim) and can quantize to 1 byte/dim under pressure, reported as reduced precision. |

Concrete throttles, in the spirit of Phase 8's presence/board throttling table (§15.11): the journal drains in idle slices with a per-frame time budget; embedding batches cap at a configurable size; the graph view culls off-screen nodes and decimates labels; the force simulation runs in the worker and pauses under `prefers-reduced-motion` or when the tab is hidden. The lazy chunk that carries the (optional) local embedding model and the graph renderer is loaded only when the corresponding surface is first opened — the intelligence layer adds **nothing to the initial bundle** when unused, consistent with the §15.11 lazy-loading discipline.

### 16.16 · Data model (new types)

All new types live in `src/types/intelligence.ts` (alongside `model.ts`/`collab.ts`) and are **purely additive** — no existing type changes. The intelligence types reference existing entities by `refId` only; they never embed or duplicate vault records.

```ts
// src/types/intelligence.ts  — additive; nothing in model.ts / collab.ts changes
export type NodeKind = /* §16.4.1 */
export type EdgeKind = /* §16.4.2 */
export interface GraphNode { /* §16.4.1 */ }
export interface GraphEdge { /* §16.4.2 */ }

export type IndexSegmentKind = /* §16.5 */
export interface IndexRecord { /* §16.5 */ }
export interface CodeSymbol { name: string; kind: 'fn'|'class'|'const'|'type'|'import'; range: [number, number] }

export type SearchMode = 'keyword' | 'semantic' | 'hybrid' | 'fuzzy' | 'graph'
export interface SearchQuery { /* §16.7 */ }
export interface SearchResult { /* §16.7 */ }
export interface SearchResultSet { groups: Record<NodeKind, SearchResult[]>; top: SearchResult[]; mode: SearchMode; degraded?: string }

export interface EmbedInput { nodeId: string; text: string; part: 'title'|'body'|'outline'; range?: [number, number] }

export interface ContextPackage { /* §16.8 */ }
export interface ContextSection { /* §16.8 */ }
export interface Citation { nodeId: string; range?: [number, number]; label: string }

export type MemoryKind = /* §16.9 */
export type MemoryStatus = /* §16.9 */
export interface MemoryItem { /* §16.9 */ }
export interface MemorySource { nodeId: string; evidence?: string; at: number }

export type RecommendationKind = /* §16.11 */
export interface Recommendation { /* §16.11 */ }

export interface InsightWidget { id: string; title: string; value: number | string; trend?: 'up'|'down'|'flat'; drilldown?: SearchQuery; coverage: 'live' | 'partial' | 'reserved' }

export interface PermissionContext { /* §16.14 */ }

// provider capability shapes (all self-reported, honest)
export interface GraphCapabilities { centrality: boolean; clusters: boolean; pathfinding: boolean; maxNodes: number; persisted: boolean }
export interface SearchCapabilities { modes: SearchMode[]; segments: IndexSegmentKind[]; crossProject: boolean; maxResults: number }
export interface EmbeddingCapabilities { model: string | null; dimensions: number; maxInputTokens: number; batch: number; offline: boolean; costTier: 'free'|'local'|'metered' }
```

The schema is **versioned** (`INTELLIGENCE_SCHEMA_VERSION`, `EMBED_SCHEMA_VERSION`) so a change to the node/edge/index/vector shape triggers a background rebuild (§16.20) without a vault migration.

### 16.17 · Folder structure (specification)

```
src/
  types/
    intelligence.ts            # all new types (additive)
  lib/
    intelligence/
      IntelligenceHub.ts       # router + provider registry + worker owner
      intelligenceStore.ts     # Zustand: provider status, backfill %, caches
      useIntelligence.ts       # hooks: useSearch / useGraph / useMemory / useInsights
      rankingWeights.ts        # one place for all ranking weights
      graph/
        GraphProvider.ts       # interface
        LocalGraphProvider.ts  # IndexedDB adjacency + traversal
        graphModel.ts          # GraphNode / GraphEdge / kinds
        extractors/            # one extractor per NodeKind (registry)
          index.ts note.ts richdoc.ts code.ts sheet.ts present.ts
          asset.ts board.ts comment.ts version.ts user.ts …
        traversal.ts centrality.ts clusters.ts
      index/
        SearchProvider.ts      # interface
        LocalSearchProvider.ts
        IndexJournal.ts        # dirty-set (persisted)
        indexWorker.ts         # background derivation (Web Worker)
        indexModel.ts
        segments/              # keyword / vector / metadata / activity /
                               #   codeSymbol / docOutline / sheetStructure /
                               #   presentStructure / assetMetadata / pluginMetadata
      embedding/
        EmbeddingProvider.ts   # interface (+ NoneEmbeddingProvider default)
        LocalEmbeddingProvider.ts
        CloudEmbeddingProvider.ts
        chunk.ts tokenizer.ts
      context/
        ContextEngine.ts contextModel.ts budgeter.ts redaction.ts
      memory/
        MemoryProvider.ts LocalMemoryProvider.ts memoryModel.ts
        extractors/ refresh.ts confidence.ts staleness.ts
      recommend/
        RecommendationProvider.ts LocalRecommendationProvider.ts
        rules/                 # one rule per Recommendation kind
      insights/
        InsightsProvider.ts LocalInsightsProvider.ts
        widgets/               # one module per widget
  components/
    intelligence/
      GlobalSearch.tsx SearchResults.tsx
      GraphView.tsx GraphControls.tsx GraphInspector.tsx
      InsightsDashboard.tsx RecommendationsPanel.tsx
      MemoryPanel.tsx ContextInspector.tsx
api/
  intelligence/
    embed.ts                   # server proxy for CloudEmbeddingProvider (keys server-side)
    search.ts                  # optional server-side ranking for CloudSearchProvider
```

The layout deliberately mirrors `src/lib/collab/` (a hub + providers + a store + a hooks file) so a reader who understands the collaboration layer already understands this one.

### 16.18 · Environment variables

Following the strict `VITE_*`-is-public / no-prefix-is-server-only rule (§11), with **everything defaulting to the fully-local, no-backend path** so an empty configuration still runs:

| Variable | Enables | Notes |
|---|---|---|
| `VITE_SEARCH_BACKEND` | `local` (default) / `cloud` | selects the `SearchProvider`; empty ⇒ local |
| `VITE_EMBEDDING_BACKEND` | `none` (default) / `local` / `cloud` | `none` ⇒ semantic search honestly disabled |
| `VITE_VECTOR_BACKEND` | `local` (default) / `cloud` | where vectors live; only relevant when embeddings are on |
| `VITE_INTELLIGENCE_WORKER` | `on` (default) / `off` | disable to debug derivation on the main thread |
| `VITE_MEMORY_AUTOAPPROVE` | off (default) | confidence threshold (0–1) to auto-approve memory candidates; off ⇒ human-in-the-loop |
| `EMBEDDING_API_URL` | cloud embeddings | **server-side only** — read by `api/intelligence/embed.ts`; never bundled |
| `EMBEDDING_API_KEY` | cloud embeddings auth | **server-side only** — never prefixed with `VITE_` |
| `SEARCH_API_URL` / `SEARCH_API_KEY` | managed cloud search | **server-side only** |

With all of them empty, Lattice indexes locally, searches by keyword/fuzzy/graph, builds the graph and memory on-device, and honestly reports that semantic search and cloud intelligence are off — exactly the "runs fully local with nothing configured" guarantee the rest of the app already makes.

### 16.19 · Lifecycle

**Per-entity derivation** (the hot path, on every save):

```
entity mutated (store / CRDT)
    │  digest-on-save (existing hook — same place snippet/outline update)
    ▼
IndexJournal.mark(refId)                     ← cheap, synchronous, persisted
    │  (worker drains at idle)
    ▼
extract node + edges  ──▶ GraphProvider.upsert
    │  contentHash unchanged? ─ yes ─▶ update activity/metadata only, reuse embedding
    │                          └ no ─▶ re-tokenize, re-chunk, (re)embed (batched)
    ▼
update index segments ──▶ SearchProvider.index
    ▼
invalidate caches touching refId  (query cache · subgraphs · citing MemoryItems)
    ▼
mark dependent MemoryItems for re-verification (staleness)
```

**Session lifecycle.** On project open, the hub hydrates the graph *skeleton* (nodes + edges metadata, no bodies) and warms the keyword segment; neighbourhoods, vectors and memory load lazily. On project switch, the previous project's in-memory partitions are evicted (bounded memory, §16.15). On sign-out, per-device caches are cleared with the account. The hub is started once from `App`, exactly like `collabHub`.

**Deletion.** When an entity is deleted, `removeByRef` purges its node, its derived edges, its index records and its vectors, and any `MemoryItem` citing only it is marked stale for review. Deletion of derived data is always safe — it can be rebuilt — so unlike vault deletions (§5) it needs no backup or confirmation.

### 16.20 · Migration strategy

The migration story is deliberately trivial, and that is a direct consequence of P1 (derived, never authoritative):

- **No vault migration.** The intelligence layer reads existing entities; it changes no existing type, store shape, Drive path or CRDT doc. A pre-9.5 vault opens unchanged.
- **One-time backfill.** On first run after the layer ships (or after a schema-version bump), the hub enqueues every existing entity into the `IndexJournal` and drains it in the background, with a visible, cancellable **"Indexing project… N%"** chip (like the import-progress toast, §8). The app is fully usable during backfill; search coverage grows as it proceeds and says so ("indexing — results may be incomplete").
- **Versioned, rebuildable schema.** `INTELLIGENCE_SCHEMA_VERSION` / `EMBED_SCHEMA_VERSION` guard the derived stores. On a bump, the layer **rebuilds in the background while serving the old data**, then swaps — never a blank search window. Because the source of truth is untouched, a corrupt or outdated index is fixed by dropping and rebuilding it, never by touching the vault.
- **Forward-compatible reserved kinds.** When Tasks/Automation/Plugins/Agents ship, their extractors register and the graph/index gain those nodes on the next incremental pass — no migration, by design (§16.4.1).

### 16.21 · Security & privacy

The intelligence layer can read every word in a project, so it inherits and extends Lattice's existing security posture (§15.10):

- **Local-only by default.** With no embedding/search backend configured, **no project text ever leaves the device** — indexing, graph, memory and keyword/fuzzy/graph search are entirely on-device. Privacy is the default, not a setting.
- **Consent before any upload.** Turning on a **cloud** embedding or search provider requires explicit, informed consent (which provider, what leaves the device), mirroring the conversion-upload consent dialog (§15.9). Consent is per-project and revocable.
- **Secret redaction.** Content flagged by `src/lib/security/secrets.ts` (env files, keys, tokens) is **redacted before embedding or upload** — the intelligence layer will not ship a detected secret to a cloud model, and env-file bodies are excluded from the vector segment by default.
- **Keys server-side only.** Cloud providers are reached through `api/intelligence/*` proxies; `EMBEDDING_API_KEY`/`SEARCH_API_KEY` are never `VITE_`-prefixed and never in the bundle — the same rule that protects `LIVEBLOCKS_SECRET_KEY`.
- **Per-project partitioning.** Vectors, index records and graph partitions are keyed by `projectId`; there is no shared vector space across projects, so cross-tenant leakage is structurally impossible (§16.14).
- **No PII in derived metadata.** Metadata segments store ids, kinds, tags and timestamps — not raw personal data; citations point at nodes, not at extracted personal content.
- **Provider isolation.** A compromised or misbehaving embedding provider sees only the (consented, redacted) text sent to it for that call — it has no access to the vault, the graph, other projects, or credentials. Each provider's blast radius is one call's inputs.

### 16.22 · Known limitations (honest list)

Written now, before implementation, so the design's boundaries are explicit:

- **Semantic search needs a model.** Without a configured `EmbeddingProvider`, semantic and hybrid modes fall back to keyword. The local on-device model is heavier and slower than a hosted one; cloud embeddings require consent and send text off-device.
- **Reserved node kinds are empty until their entities exist.** Tasks, Automation, Calendar Events, Design Files, Plugins and AI Agents contribute nothing to the graph/search/insights until those phases ship (§16.4.1). Widgets and result groups for them show "no data yet".
- **The code-symbol index is shallow.** It parses functions/classes/imports for search and `imports`/`dependsOn` edges; it is **not** a language server — no full type resolution, no `extends`/`implements` graph beyond simple cases (those `EdgeKind`s are reserved).
- **Memory is assistive, not authoritative.** System-derived memories carry confidence and provenance and can be stale or wrong; they are gated by approval and clearly labelled, never presented as ground truth.
- **Graph layout is capped for very large projects.** The view opens on a seed and grows by expansion; the full constellation is bounded with an honest "showing N of M".
- **Cross-project search spans only accessible projects** (by design, §16.14) — there is no global admin search across projects a user can't join.
- **Derived-data sync is eventual.** Cloud sync of graph/index/memory reconciles on reconnect; offline, everything is local and correct, but two devices may briefly differ until they converge (the collab CRDT already handles memory; index/graph rebuild locally).
- **Duplicate/near-duplicate detection is similarity-based**, so it can surface false positives (two genuinely different docs on the same topic); every such recommendation is a suggestion with a rationale, never an automatic merge.

### 16.23 · Acceptance criteria (targets)

Phase 9.5 is complete when, measurably:

- [ ] The five providers + `InsightsProvider` exist behind interfaces, each with a working **local** implementation and honest `capabilities`; the `IntelligenceHub` registers available providers and falls back to local when a cloud provider is unavailable.
- [ ] **Zero-config run:** with all intelligence env vars empty, the app indexes locally, builds the graph, and supports keyword/fuzzy/graph search and local memory — and clearly reports that semantic/cloud features are off.
- [ ] Every existing entity kind has a registered **extractor** producing correct nodes and typed edges; edges cite `evidence` and recompute incrementally on save (no full re-scan).
- [ ] **Global Search** replaces/extends the command palette: one box, results grouped by kind + a Top band, all five modes selectable, each result showing a match reason; hybrid degrades to keyword with a visible note when embeddings are off.
- [ ] **Semantic search**, when an `EmbeddingProvider` is configured, returns meaning-based results with jump-to-passage; with none, it is disabled honestly (never faked, never empty-with-no-reason).
- [ ] The **Context Engine** produces a `ContextPackage` with a respected token budget, ordered sections, a citation per item, and a reported redaction count — with **no LLM-vendor import anywhere** in `context/`.
- [ ] **Project Memory** derives candidates, computes confidence, detects staleness, supports manual edits and an approval gate, syncs via the collab CRDT, and never feeds unapproved candidates to context by default.
- [ ] The **Knowledge Graph View** supports zoom/pan, kind & edge filters, clusters, find, expand/collapse, path finding and centrality sizing, is **keyboard-operable** (closing `LAT-2`), and stays responsive at target scale via worker layout + culling.
- [ ] The **Recommendation** catalogue (dead/missing links, orphans, unused assets, duplicates, stale decks, related docs) computes from graph+index, each with a rationale, one-click action and remembered dismissals; nothing is auto-applied.
- [ ] The **Insights** dashboard renders all listed widgets with drill-downs, honestly labelling widgets whose data source doesn't exist yet.
- [ ] **Permissions:** an automated test proves the layer never returns/ranks/cites an entity outside the caller's `PermissionContext`, across search, graph, memory, context, recommendations and insights (double-filtered, per-project partitioned).
- [ ] **Performance:** derivation runs in a Web Worker; a save never blocks the editor; the initial bundle is unchanged when intelligence surfaces are unopened; a 5k-entity project backfills in the background with a progress chip and stays interactive.
- [ ] **Privacy:** with no cloud provider, no project text leaves the device; enabling one requires consent and redacts secret-flagged content; all keys are server-side only.
- [ ] Typecheck ✅, production build ✅, unit tests ✅ for extractors, ranking, permission-filtering, memory confidence/staleness and recommendation rules.

### 16.24 · Future roadmap

Phase 9.5 is the substrate; these build on it:

- **Autonomous AI agents** (Phase 10+) — agents that read `ContextPackage`s, propose actions, and execute them through permission-checked mutation paths, grounded in the graph and memory. An `AgentProvider` sits beside the five providers; agents become `aiAgent` nodes with `generatedBy` edges, so the graph records what an agent produced.
- **Workflow automation** — `automation` entities triggered by graph/index conditions (e.g. "when a deck goes stale relative to its source, notify the owner"), reusing the recommendation rules as triggers.
- **Plugin intelligence** — plugins contribute extractors, index segments, recommendation rules and insight widgets through the reserved `pluginMetadata` seam, all permission-scoped.
- **Workspace-wide & temporal graph** — an opt-in cross-project graph at the workspace level, and a time-dimensioned graph ("what did this project look like last month?") built on version history.
- **Federated search** — pulling results from connected integrations (GitHub, Drive, future connectors) into the same grouped result set, behind the same `SearchProvider` interface.
- **Deeper code intelligence** — promoting the shallow symbol index toward real cross-file resolution (`extends`/`implements`), unlocking code-aware navigation and refactoring suggestions.

## 17 · Phase 10 — Cloud Platform & Deployment Providers

> **Status: architectural specification — not yet implemented.** This section **replaces the earlier OpenShift-centric Phase 10.** It is deliberately *not* an infrastructure-migration document and does not describe moving Lattice onto any one platform. It specifies how Lattice becomes **deployable anywhere** by treating infrastructure as just another set of providers — the same abstraction discipline that already governs storage, realtime and (from §16) intelligence. OpenShift is demoted from "the destination" to "one `DeploymentProvider` among many."

Every prior phase pushed a capability behind an interface so it could be swapped without touching the product: `StorageProvider` (IndexedDB ↔ Drive), `CollaborationProvider`/realtime (BroadcastChannel ↔ Drive polling ↔ Liveblocks), the `ConversionBackendProvider`, and the five intelligence providers of §16. Phase 10 applies that same move to the **last hard-coded assumption in the codebase: that Lattice runs on Vercel.** After Phase 10, *where and how Lattice runs* is a provider decision, made in configuration and tooling, and the **same build artifact** runs on a laptop, a single container, a small PaaS, a self-hosted Compose stack, or an enterprise Kubernetes/OpenShift cluster.

### 17.1 · Vision

> **Lattice should run anywhere, and cloud deployment must never define the product architecture. Infrastructure is a provider.**

The product must support **single-user, team, self-hosted, cloud and enterprise** deployments **from one codebase** — not five forks, not a "community edition" and an "enterprise edition" that drift apart, but one application whose behaviour is identical everywhere and whose *only* differences between deployments are which providers are configured and how they scale. A creator running `npm run dev` and a bank running an air-gapped OpenShift cluster run the same Lattice; the bank simply has more providers switched on. This is the natural endpoint of the local-first, provider-based philosophy: if the app is honest about capabilities and everything heavy sits behind an interface, then deployment is *also* just an interface, and the cloud is *also* optional.

### 17.2 · Principles (non-negotiable)

| # | Principle | What it forces |
|---|---|---|
| D1 | **Infrastructure is a provider** | Build, deploy, runtime, secrets, monitoring, backup, certificates and scaling each sit behind an interface with honest capabilities and a strict `isAvailable()`. |
| D2 | **One codebase, one artifact** | The browser bundle and the backend handlers are built once and deployed unchanged across all providers. No `if (vercel)` branches in product code; no per-platform builds of the app itself. |
| D3 | **Deployment never leaks into the product** | Nothing above the deployment layer knows where it runs. A document editor, a board, the intelligence layer — none contain platform-specific code. |
| D4 | **Honest capability reporting** | A `DeploymentProvider` that can't do preview URLs, or a runtime that can't hold a websocket, says so; features that need a missing capability degrade honestly (exactly as realtime does when unconfigured). |
| D5 | **Config, not rebuild** | Moving between deployments, or reconfiguring one, is a configuration change resolved at boot — not a recompile. This finally decouples Lattice from the "`VITE_*` baked at build time" constraint (§17.13). |
| D6 | **Secrets never touch the client** | The `VITE_*`-is-public / no-prefix-is-server-only rule generalizes to a `SecretProvider`: every deployment keeps secrets server-side, whatever its secret store. |
| D7 | **Enterprise adds providers, never forks behaviour** | SSO, audit, policy, centralized AI and marketplace mirroring are *additive* providers and *additive* policy — they can only constrain or extend, never change what a document or a board does (§17.10). |

### 17.3 · Relationship to the provider family

Phase 10 introduces a **second tier** of providers. The existing providers are **application providers** — consumed by the running app in the browser (and its serverless functions) at request time. The new providers are **platform providers** — consumed by *tooling, CI and an optional admin surface* to build, ship, run, observe and scale the app. The two tiers are coherent but distinct, and keeping them distinct is what prevents deployment concerns from leaking into product code (D3).

```
        APPLICATION PROVIDERS  (run inside the app; §1–§16)
        ┌──────────────────────────────────────────────────────────────┐
        │ StorageProvider · RealtimeProvider (CollaborationProvider) ·   │
        │ SearchProvider · EmbeddingProvider · GraphProvider ·          │
        │ MemoryProvider · ConversionBackendProvider                    │
        │ BackendProvider* · AutomationProvider* · DesignProvider* ·    │
        │ PluginProvider*                          (* reserved / future) │
        └───────────────────────────────┬──────────────────────────────┘
                                        │  are *hosted and fed* by
        PLATFORM PROVIDERS  (this phase; consumed by tooling/CI/admin)   ▼
        ┌──────────────────────────────────────────────────────────────┐
        │ DeploymentProvider · RuntimeProvider · EnvironmentProvider ·   │
        │ SecretProvider · MonitoringProvider · LoggingProvider ·       │
        │ BackupProvider · CertificateProvider · ScalingProvider        │
        └──────────────────────────────────────────────────────────────┘
```

Coherence with each named provider:

| Provider | Status today | Phase 10's relationship |
|---|---|---|
| **StorageProvider** | ✅ IndexedDB + Drive | Phase 10 adds Supabase / Blob / Object-storage implementations behind the **same** interface, selected per deployment mode (§17.6). |
| **RealtimeProvider** | ✅ Liveblocks (+ local/Drive) | Self-hosted/enterprise modes swap in a self-hosted relay (y-websocket / PartyKit) behind the same `RealtimeAttachment` seam already noted in §15.1 — no app change. |
| **BackendProvider** | ⏳ reserved | Phase 10 defines it: the registry of `api/*` request handlers, made runnable on any `RuntimeProvider` (serverless, container, edge) so the backend isn't Vercel-bound (§17.5). |
| **SearchProvider / EmbeddingProvider** | ◑ specified in §16 | Their **cloud** implementations are hosted by the platform providers here (proxy runtime, secrets, scaling). |
| **AutomationProvider / DesignProvider / PluginProvider** | ⏳ reserved | Named for coherence; when they ship they are hosted by the same runtime/scaling model — Phase 10 reserves their place in the topology so nothing has to be re-architected. |

> **Honesty note.** `BackendProvider`, `AutomationProvider`, `DesignProvider` and `PluginProvider` do not exist in the codebase yet. This section names them because the deployment architecture must have a defined place for them; it marks them **reserved** and specifies the seam, rather than pretending they are present. The providers that *do* exist (Storage, Realtime, and the §16 intelligence set) are wired concretely.

### 17.4 · Architecture overview

Two planes: a **control plane** (the platform providers — how the app is built, shipped and operated) and a **data/runtime plane** (the app itself and the application providers it uses). Product code lives entirely in the runtime plane and is blind to the control plane.

```
   CONTROL PLANE  (tooling · CI · optional admin console) — platform providers
   ┌───────────────────────────────────────────────────────────────────────┐
   │  DeploymentProvider  build → deploy → preview → rollback → logs/health  │
   │        │ selects & drives                                              │
   │  RuntimeProvider   serverless | container | edge | worker | hybrid      │
   │  EnvironmentProvider  resolves config   SecretProvider  injects secrets │
   │  CertificateProvider  TLS   MonitoringProvider · LoggingProvider  obs   │
   │  BackupProvider  snapshots/restore      ScalingProvider  replicas/limits│
   └───────────────────────────────┬───────────────────────────────────────┘
                                   │ provisions & runs
   RUNTIME PLANE  (the same build, everywhere)                              ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │  Frontend (static SPA)   ── serves ──▶  browser: app + application      │
   │  Backend handlers (api/*) via BackendProvider on a RuntimeProvider      │
   │  Realtime relay   Workers (index/memory/backup)   AI/embedding proxy    │
   │        │ use application providers ▼                                    │
   │  StorageProvider · RealtimeProvider · Search/Embedding · …             │
   │        │ persist to ▼                                                   │
   │  IndexedDB(client) · Drive · Supabase/Postgres · Object store · GitHub  │
   └───────────────────────────────────────────────────────────────────────┘
```

The invariant the arrows encode: **the control plane provisions and observes; the runtime plane serves.** A `DeploymentProvider` never runs inside the browser app, and the browser app never imports a `DeploymentProvider` — the coupling is one-way and build/ops-time only. This is what lets the identical artifact run under any control plane.

### 17.5 · DeploymentProvider

The `DeploymentProvider` is the control-plane abstraction over a target platform: it knows how to turn a build into a running deployment and how to operate it. It is used by the CLI/CI and an optional enterprise admin console — **never by the browser app** (D3).

```ts
// deploy/DeploymentProvider.ts
export interface DeploymentProvider {
  readonly id: 'vercel' | 'docker' | 'compose' | 'railway' | 'render'
            | 'fly' | 'kubernetes' | 'openshift'
  readonly label: string
  readonly capabilities: DeployCapabilities
  isAvailable(env: DeployEnv): boolean            // required CLI/creds present?

  build(spec: BuildSpec): Promise<BuildArtifact>  // tsc + vite build → static + api bundle
  deploy(artifact: BuildArtifact, target: DeployTarget): Promise<Deployment>
  rollback(to: DeploymentId): Promise<Deployment>
  preview(ref: GitRef): Promise<PreviewUrl | null> // null when unsupported (honest)
  logs(q: LogQuery): AsyncIterable<LogLine>
  health(id: DeploymentId): Promise<HealthReport>
  setEnv(id: DeploymentId, vars: EnvVars): Promise<void>
  domains(id: DeploymentId): DomainOps            // add / verify / remove
  certificates(id: DeploymentId): CertOps         // provision / renew (may delegate to CertificateProvider)
}

export interface DeployCapabilities {
  build: boolean; deploy: boolean; rollback: boolean
  preview: boolean; logs: boolean; health: boolean
  envVars: boolean; domains: boolean; certificates: boolean
  managedTls: boolean; regions: string[] | 'single'
  scalable: boolean                               // does it expose ScalingProvider hooks?
}
```

**Capabilities are honest and vary by platform** — the interface is uniform, the `capabilities` are not:

| Provider | build | deploy | rollback | preview URLs | managed TLS | regions | scaling | self-host |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **Vercel** | ✅ | ✅ | ✅ | ✅ (per-branch) | ✅ | multi (edge) | auto | — |
| **Docker** (single) | ✅ | ✅ | ✅ (image tag) | — | via proxy | single | manual | ✅ |
| **Docker Compose** | ✅ | ✅ | ✅ | — | via proxy (Caddy/Traefik) | single | profiles | ✅ |
| **Railway** | ✅ | ✅ | ✅ | ◑ (env) | ✅ | region | vertical/replicas | ✅ (PaaS) |
| **Render** | ✅ | ✅ | ✅ | ✅ (PR) | ✅ | region | replicas | ✅ (PaaS) |
| **Fly.io** | ✅ | ✅ | ✅ | ◑ | ✅ | multi | machines/regions | ✅ |
| **Kubernetes** | ✅ | ✅ | ✅ (revisions) | ◑ (via controller) | via cert-manager | multi | HPA + `ScalingProvider` | ✅ |
| **OpenShift** | ✅ | ✅ | ✅ (rollouts) | ◑ (Routes) | via operator | multi | HPA + `ScalingProvider` | ✅ (enterprise) |

A feature that needs a capability a provider lacks degrades honestly: on Docker Compose, `preview()` returns `null` and the CI/admin UI shows "preview URLs not supported on this provider" rather than faking one — the exact discipline the realtime chip uses when a backend is unconfigured. **Future providers** (Cloudflare, AWS Cloud Run/ECS, Azure Container Apps, GCP, Netlify, Coolify, Deno Deploy) slot in as new `id`s implementing the same interface; adding one is a new folder under `deploy/`, not a change to the app.

### 17.6 · RuntimeProvider

Where `DeploymentProvider` answers *"how do I ship it?"*, `RuntimeProvider` answers *"in what shape does the backend run?"*. Lattice's backend is a set of request handlers (`api/*`: `github/oauth`, `realtime/auth`, `realtime/rooms`, plus the §16 `intelligence/embed`) and, from Phase 10, background **workers** (indexing, memory refresh, backups) and an optional **realtime relay**. The `RuntimeProvider` maps each of those to an execution model.

```ts
export interface RuntimeProvider {
  readonly id: 'serverless' | 'container' | 'edge' | 'worker' | 'hybrid'
  readonly label: string
  readonly capabilities: RuntimeCapabilities
  // { coldStart, longRunning, websockets, cron, background, statefulness, regions }
  bind(endpoint: BackendEndpoint): RuntimeBinding  // which handler runs where
}
```

**Selection** is by workload shape, and `hybrid` (the realistic default for anything beyond a single container) mixes them:

| Workload | Best runtime | Why |
|---|---|---|
| OAuth exchange, realtime token mint, embed proxy (short request/response) | **serverless** or **edge** | cheap, scales to zero, no long-lived state — exactly today's `api/*` on Vercel |
| Realtime relay (self-hosted, holds websockets) | **container** or **worker** | needs long-lived connections; serverless can't hold a socket |
| Index / memory / backup jobs (scheduled, bursty, CPU-heavy) | **worker** (queue + cron) | must run off the request path and survive minutes |
| Static SPA | **edge**/CDN | stateless, cache-friendly, global |
| Single self-hosted box | **container** (one process serving static + api + workers) | simplest topology for L4 minimal |

`hybrid` is how a real cloud deployment looks: static on the edge/CDN, `api/*` as serverless functions, workers and (if self-hosted) the realtime relay as long-running containers. The `BackendProvider` (reserved, §17.3) is the piece that makes this possible: it registers the handlers **independently of any runtime**, so the same handler code runs as a Vercel function *or* an Express route in a container *or* an edge worker — selected by the active `RuntimeProvider`, not rewritten. This is the concrete mechanism behind D2 ("one artifact, everywhere"): the backend is authored once and *bound* to a runtime at deploy time.

### 17.7 · Storage topology

Storage is already provider-abstracted (`StorageProvider`, §3), so Phase 10 doesn't redesign it — it enumerates the **stores** a deployment can wire behind that interface, and maps each **class of data** to a store per mode. The client always keeps a local working copy; what changes across deployments is where the *durable* copy and the *shared* services live.

| Store | Role | Where it appears |
|---|---|---|
| **IndexedDB** | client working copy + local CRDT cache + local index/vectors | **every** mode (the local-first invariant) |
| **Google Drive** | durable per-user vault mirror (JSON bodies + asset binaries) | Creator Cloud / Small Team (the current model) |
| **Supabase / Postgres** | shared durable state for teams (vault mirror, ACL source, `pgvector` search) | Small Team / Self-Hosted / Enterprise |
| **GitHub** | code-document sync (unchanged, §6) | every mode |
| **Blob storage** | large document/CRDT snapshot blobs | Self-Hosted / Enterprise |
| **Object storage (S3 / MinIO / GCS)** | asset binaries at scale, backups | Self-Hosted / Enterprise |
| **Backups** | point-in-time snapshots (via `BackupProvider`, §17.15) | Team+ |
| **Cache** | CDN (edge) + in-memory (server) + IndexedDB (client) | all; richer in cloud modes |
| **Temporary storage** | ephemeral runtime FS, signed-URL scratch (conversion, export, import staging) | server-bearing modes |

**Data-class → store, by mode:**

| Data class | Local Dev | Creator Cloud | Small Team | Self-Hosted | Enterprise |
|---|---|---|---|---|---|
| Working copy | IndexedDB | IndexedDB | IndexedDB | IndexedDB | IndexedDB |
| Durable vault | — (local only) | Drive | Drive / Supabase | Supabase + Object | Supabase(HA) + Object |
| Realtime CRDT | tabs only | Liveblocks | Liveblocks | self-host relay *or* Liveblocks | self-host relay (HA) |
| Assets/blobs | IndexedDB | Drive | Drive / Object | Object (MinIO/S3) | Object (S3, replicated) |
| Search/vectors | local | local | local / cloud | pgvector / managed | pgvector (HA) |
| Backups | export files | Drive revisions | snapshots | snapshots → Object | snapshots → Object (offsite) |

The single rule across the whole table: **the working copy is always local and the app is always usable offline** — every heavier store is a durable/shared *enhancement* behind `StorageProvider`, never a prerequisite for the app to function. This is §10's "offline-first" promise held invariant from a laptop to a cluster.

### 17.8 · Deployment modes

Five named levels, differing only in which providers are configured and how they scale — **not** in product behaviour (D2/D7). Each is a documented reference configuration, not a separate product.

**Level 1 — Local Development.** `npm run dev`. IndexedDB only; mock (or personal Google) account; no realtime backend (tabs collaborate via BroadcastChannel CRDT, §15.2); local intelligence (keyword/graph, no embeddings). Zero cloud, zero secrets. The everyday contributor experience and the honest floor the whole design rests on.

**Level 2 — Creator Cloud.** The current production shape: static SPA + `api/*` serverless on a PaaS (Vercel today), Google identity + Drive vault, Liveblocks realtime, optional cloud embeddings. Single user, multi-device, multiplayer with invited collaborators. Managed TLS, preview URLs, scale-to-zero. Target: an individual creator or a tiny group.

**Level 3 — Small Team.** Level 2 plus shared durable state (Supabase/Postgres) so team workspaces, memberships and ACLs live server-side rather than per-user Drive; optional cloud search/embeddings; still on a managed PaaS (Vercel / Railway / Render / Fly). Target: a team that wants shared projects and team-wide search without running infrastructure.

**Level 4 — Self-Hosted.** Docker Compose on the team's own host: web+api container, self-hosted realtime relay (y-websocket/PartyKit) *or* Liveblocks, Postgres/Supabase, MinIO/S3 object storage, a worker for indexing/memory/backups, a reverse proxy for TLS. The team owns its data end-to-end; identity can stay Google or move to SSO. Target: privacy-sensitive or air-gap-curious teams.

**Level 5 — Enterprise.** Level 4's services on Kubernetes/OpenShift with HA and horizontal scaling, **plus** SSO, audit, policy, centralized AI and a plugin marketplace mirror (§17.10) — all additive providers. Multi-region, optional air-gapped, BYO object storage and database. Target: organizations with compliance, scale and governance requirements.

| Aspect | L1 Local | L2 Creator | L3 Team | L4 Self-Hosted | L5 Enterprise |
|---|---|---|---|---|---|
| Runs on | dev server | PaaS (serverless) | PaaS | Compose (own host) | K8s / OpenShift |
| Identity | mock / Google | Google | Google | Google / SSO | SSO (SAML/OIDC) |
| Durable state | none (local) | Drive | Drive + Supabase | Supabase + Object | Supabase(HA) + Object |
| Realtime | tabs (CRDT) | Liveblocks | Liveblocks | self-host / Liveblocks | self-host (HA) |
| Intelligence | local | local + cloud opt | cloud opt | self-host models opt | centralized AI |
| Backups | export | Drive revisions | snapshots | snapshots → Object | offsite + retention |
| Scaling | — | auto (PaaS) | replicas | manual/profiles | HPA + `ScalingProvider` |
| Governance | — | — | — | basic | SSO+audit+policy |

### 17.9 · Docker

Docker is the backbone of Levels 4–5 and the reference for "runs on your own host." This is a **design**, not an implementation — no Dockerfile is written here.

**Dockerfile (design).** A multi-stage build: a **build stage** on a Node base runs `tsc --noEmit && vite build` to produce the static `dist/` plus the bundled backend handlers; a **runtime stage** on a minimal base serves the static assets and hosts the `api/*` handlers (via the `BackendProvider` on a container `RuntimeProvider`). Non-root user, read-only root filesystem where possible, a dedicated writable temp mount, a `HEALTHCHECK` hitting the readiness endpoint, and a single configurable `PORT`. The image contains **no secrets and no baked environment** — configuration is resolved at boot from the runtime config + secret store (§17.13), so the *same image* runs dev, staging and prod.

**Compose (design).** A service graph, each service optional via **profiles**:

```
services (Compose, design):
  web        static SPA + api handlers        (RuntimeProvider: container)   [core]
  realtime   self-hosted CRDT relay           (y-websocket / PartyKit)       [profile: realtime]
  worker     indexing · memory · backups      (RuntimeProvider: worker)      [profile: workers]
  db         Postgres / Supabase              (durable state, pgvector)      [profile: db]
  object     MinIO / S3-compatible            (assets + backups)             [profile: object]
  proxy      Caddy / Traefik                  (TLS termination, routing)     [profile: proxy]
  (enterprise add-ons: sso-bridge, audit-sink, policy)                        [profile: enterprise]
```

- **Volumes.** Named volumes for `db` data, `object` data, config and TLS certs; the app containers themselves stay stateless (they can be recreated freely — state lives in `db`/`object`).
- **Health.** Every service exposes a health/readiness check; `web` is not marked ready until `db`/`object` (when in-profile) are reachable, so orchestration never routes to a half-up instance.
- **Workers.** The `worker` service drains the intelligence `IndexJournal` and runs memory-refresh and scheduled `BackupProvider` jobs off the request path; it scales independently of `web`.
- **Profiles.** `minimal` (just `web` + `proxy`, using external managed `db`/`object`/realtime), `full` (all core + db + object + realtime + workers), `enterprise` (adds SSO/audit/policy). This lets one Compose file express L4-minimal through L5.

Nothing here bakes infrastructure into the app: Compose is one `DeploymentProvider` target describing how to *run* the same artifact, and the services map one-to-one onto the runtime plane of §17.4.

### 17.10 · Self-hosting

**Minimum requirements (L4-minimal).** A single host with ~2 vCPU / 4 GB RAM / 20 GB disk runs `web` + `proxy` against **external managed** `db`/`object`/realtime (e.g. hosted Postgres, a bucket, Liveblocks). This is the smallest honest self-host: you own the app process and your data's durable stores, with the heavy services delegated.

**Recommended architecture (L4-full).** ~4 vCPU / 8 GB RAM plus managed or co-hosted Postgres and object storage:

```
                       ┌────────── proxy (TLS, Caddy/Traefik) ──────────┐
        Internet ─────▶│  https://lattice.example.com                   │
                       └───┬───────────────┬───────────────┬───────────┘
                           ▼               ▼               ▼
                    web (SPA+api)     realtime relay    (assets via signed URLs)
                       │  │               │                     │
                 ┌─────┘  └──────┐        │                     │
                 ▼               ▼        ▼                     ▼
             Postgres        worker    (Yjs rooms)          object store
            (+pgvector)   (index/mem/    per project         (MinIO/S3)
                            backup)
```

Private networking between `web`/`worker`/`db`/`object`/`realtime`; **only `proxy` is publicly exposed**; `db`, `object` and the realtime relay are never directly reachable from the internet.

**Upgrade strategy.** Deployments move by **image tag**; the `DeploymentProvider.rollback` capability enables blue-green or rolling updates with automatic rollback on failed health checks. Database schema changes ship as **gated, forward-compatible migrations** run by an init job before the new `web` becomes ready; the intelligence index/graph are **derived and rebuilt** (§16.20), so an upgrade never risks that data. Config compatibility is versioned; an upgrade that needs new config fails readiness with a clear message rather than starting misconfigured.

**Backups.** The `BackupProvider` (§17.15) snapshots the durable stores (Postgres dump, object-store sync, CRDT binary snapshots via the existing `CRDTPersistenceAdapter`, §15.2) on a schedule with retention, encrypted at rest; restores are point-in-time and drilled as an acceptance criterion (§17.23). Because the client keeps a local working copy and Drive/GitHub retain their own histories, self-hosting adds a durable backup tier without ever being the *only* copy of a user's work.

### 17.11 · Enterprise

Enterprise (L5) is the strongest test of D7: it must add SSO, audit, policy, centralized AI, a marketplace mirror and cluster deployment **without changing what the product does**. The design achieves this by making every enterprise feature either an **additive provider** (a new implementation of an existing interface) or an **additive constraint** (policy that can only narrow, never widen). No product code branches on "enterprise."

| Capability | How it's added | Why product behaviour is unchanged |
|---|---|---|
| **SSO** | an `AuthProvider` implementation for SAML/OIDC that produces the **same `Account`/identity** the rest of the app already consumes; that identity still feeds the realtime room ACLs (§15.3) | the app sees an `Account`, exactly as with Google today — the identity *source* changes, not what identity *does* |
| **Audit** | a `LoggingProvider` audit sink that captures the events the app **already emits** (the `ActivityLog`, §7) plus server-side ACL/deploy events | audit *observes* existing events; it doesn't create new behaviour |
| **Policy** | a `PolicyProvider` evaluated **alongside** `permissions.ts` that can only **add** constraints (force local-only embeddings, restrict domains, disable public links, require approval) | policy can forbid, never permit beyond the permission matrix — it's a strict subtractive gate |
| **Centralized AI** | `EmbeddingProvider`/`SearchProvider`/(future)`AgentProvider` pointed at an **internal** gateway; keys server-side | same interfaces as §16; only the endpoint changes |
| **Marketplace mirror** | a `PluginProvider` registry pointed at an internal mirror URL (reserved until the plugin API ships) | plugins load from a different registry; the plugin runtime is identical |
| **Cluster deployment** | the K8s/OpenShift `DeploymentProvider` + `ScalingProvider` (§17.16) | orchestration changes; the running artifact does not |

**Air-gapped variant.** With SSO for identity, an internal AI gateway, an internal plugin mirror, and self-hosted realtime + object storage, an L5 deployment needs **no public internet** — every external dependency (Google identity, Liveblocks, cloud AI, the public plugin registry) has an internal substitute behind the same interface. The product is byte-for-byte the same build; only its providers point inward.

> **The enterprise invariant, stated plainly:** enterprise Lattice is community Lattice with more providers configured and a policy layer switched on. If a feature required forking product behaviour, it would violate D7 and the design would be considered wrong — the fix is to express it as a provider or a policy, not a branch.

### 17.12 · Deployment architecture (diagrams)

The full runtime topology at Level 5, showing every subsystem the prompt calls out (frontend, backend, realtime, workers, storage, integrations, plugin runtime, AI runtime, object storage, GitHub, Drive) and where each lives:

```
                                   ┌───────────────┐
                        Browser ──▶│  Frontend SPA │  (edge/CDN, static, cached)
                                   └───────┬───────┘
                                           │ HTTPS (proxy / ingress · TLS via CertificateProvider)
        ┌──────────────────────────────────┼───────────────────────────────────────┐
        │                                  ▼                                        │
        │   ┌──────────────┐   ┌────────────────────┐   ┌─────────────────────┐    │
        │   │  Backend     │   │   Realtime relay   │   │   Workers           │    │
        │   │  api/* via   │   │   (Yjs rooms /     │   │  index · memory ·   │    │
        │   │ BackendProv. │   │   Liveblocks or    │   │  backup · schedule  │    │
        │   │ (serverless/ │   │   self-host)       │   │  (RuntimeProvider:  │    │
        │   │  container)  │   │  server ACLs       │   │   worker)           │    │
        │   └──┬────────┬──┘   └─────────┬──────────┘   └──────────┬──────────┘    │
        │      │        │                │                         │               │
        │      ▼        ▼                ▼                         ▼               │
        │  ┌────────┐ ┌──────────┐  ┌──────────┐   ┌────────────┐ ┌────────────┐  │
        │  │Postgres│ │ AI runtime│ │ Plugin   │   │  Object    │ │  Cache     │  │
        │  │+pgvector│ │(embed/    │ │ runtime  │   │  storage   │ │ (mem/edge) │  │
        │  │durable │ │ agent     │ │(sandboxed│   │ (S3/MinIO) │ └────────────┘  │
        │  │state   │ │ gateway)  │ │ workers) │   │ assets+bkp │                 │
        │  └────────┘ └──────────┘  └──────────┘   └────────────┘                 │
        │                                                                          │
        │   External integrations (per-user, provider-mediated, unchanged):        │
        │      GitHub (code sync §6)      Google Drive (vault mirror §5)           │
        └──────────────────────────────────────────────────────────────────────────┘
             observed by MonitoringProvider + LoggingProvider · provisioned by
             DeploymentProvider · scaled by ScalingProvider · secrets via SecretProvider
```

The **same diagram collapses** as you descend the levels: at L4 the boxes are Compose services on one host; at L2/L3 backend is serverless, realtime is Liveblocks, storage is Drive/Supabase and there is no self-hosted relay or plugin/AI runtime; at L1 only the Frontend SPA and browser-side providers remain, everything else absent and honestly reported off. One topology, drawn once, instantiated at whatever density a deployment needs.

### 17.13 · Provider model (platform providers)

Eight platform providers, each an interface with honest capabilities, a local/default implementation and interchangeable alternatives. Together they are the entire control plane; product code depends on none of them.

```ts
// deploy/*  — control-plane provider family (used by tooling / CI / admin only)
interface DeploymentProvider  { /* build · deploy · rollback · preview · logs · health · env · domains · certs — §17.5 */ }
interface RuntimeProvider     { /* serverless | container | edge | worker | hybrid — §17.6 */ }
interface EnvironmentProvider { resolve(): Promise<AppConfig> }        // client-safe config, layered
interface SecretProvider      { get(key: string): Promise<string>; list(): Promise<string[]> } // server-only
interface MonitoringProvider  { metric(m: Metric): void; health(): HealthReport; alertRules(): AlertRule[] }
interface LoggingProvider     { log(line: StructuredLog): void; audit(event: AuditEvent): void; trace(span: Span): void }
interface BackupProvider      { snapshot(scope: BackupScope): Promise<Snapshot>; restore(id: SnapshotId): Promise<void>; list(): Promise<Snapshot[]> }
interface CertificateProvider { provision(domain: string): Promise<Cert>; renew(domain: string): Promise<Cert> }
interface ScalingProvider     { desired(subsystem: Subsystem): ScalePlan; apply(plan: ScalePlan): Promise<void> }
```

| Provider | Local / default | Interchangeable alternatives |
|---|---|---|
| **DeploymentProvider** | Docker (local image) | Vercel · Compose · Railway · Render · Fly · K8s · OpenShift |
| **RuntimeProvider** | container (one process) | serverless · edge · worker · hybrid |
| **EnvironmentProvider** | build-time `VITE_*` (today) | runtime `config.json` · injected `window.__LATTICE_CONFIG__` · provider env |
| **SecretProvider** | Vercel/`.env` (server-side) | Docker secrets · K8s Secrets · Vault · cloud secret managers |
| **MonitoringProvider** | none (honest "no metrics sink") | Prometheus · OpenTelemetry · hosted APM |
| **LoggingProvider** | stdout (structured JSON) | file · Loki · ELK · hosted log/audit sink |
| **BackupProvider** | Drive revisions (L2) | object-store snapshots · pg_dump · offsite |
| **CertificateProvider** | platform-managed TLS | Let's Encrypt (Caddy/cert-manager) · enterprise CA |
| **ScalingProvider** | manual (fixed replicas) | PaaS auto · K8s HPA · custom |

**EnvironmentProvider — solving the build-time-config problem (D5).** Lattice's `VITE_*` variables are **inlined into the client bundle at build time**; today, changing configuration means rebuilding and redeploying. That is acceptable for one Vercel deployment but fatal for "one artifact, many deployments." The `EnvironmentProvider` resolves configuration with a **precedence chain** evaluated at boot, so the *same build* is reconfigured without a rebuild:

```
resolve() precedence (highest wins):
   1. runtime  /config.json         fetched at app boot (self-host / enterprise)
   2. injected window.__LATTICE_CONFIG__   stamped by the server into index.html
   3. build-time VITE_*             the existing mechanism (backwards compatible)
   4. safe defaults                 fully-local, no-backend fallbacks
```

Only **client-safe** configuration (which backends are on, endpoint URLs, feature flags, public client ids) travels this path — never secrets. **Secrets stay entirely with the `SecretProvider`**, server-side, exactly as `LIVEBLOCKS_SECRET_KEY`/`GITHUB_CLIENT_SECRET`/`EMBEDDING_API_KEY` do now (D6). This two-plane split — a fetched, client-safe config plane and a server-only secret plane — is what lets a self-hosted or enterprise operator reconfigure a running Lattice (turn on SSO, point AI at an internal gateway, switch object stores) by editing `config.json` and rotating a secret, with **no rebuild**, while preserving the strict rule that no secret ever reaches the browser. It is fully backwards compatible: with no `config.json` present, resolution falls straight through to the current `VITE_*` behaviour.

### 17.14 · Observability

Observability is delivered through `MonitoringProvider` (metrics/health/alerts) and `LoggingProvider` (logs/audit/tracing), so a deployment plugs in whatever sink it already runs — or none, honestly.

| Signal | What it covers | Provider |
|---|---|---|
| **Logs** | structured JSON from `api/*` handlers and workers (request, error, job outcome) | `LoggingProvider` (stdout → file / Loki / ELK) |
| **Metrics** | request rate/latency, realtime room + connection counts, `IndexJournal` queue depth, embedding calls, worker lag, backup age | `MonitoringProvider` (→ Prometheus / OTel) |
| **Tracing** | W3C `traceparent` propagated across frontend → `api/*` → workers → stores, so a slow save is followable end-to-end | `LoggingProvider.trace` (→ OTel) |
| **Alerts** | rule set: error-rate spikes, realtime disconnect storms, worker backlog, failed backups, cert expiry | `MonitoringProvider.alertRules` |
| **Dashboards** | operator views built from the metrics above (per subsystem of §17.12) | monitoring backend |
| **Audit** | the app's existing `ActivityLog` (§7) plus server-side ACL changes, role mints (§15.3), deploys and policy decisions | `LoggingProvider.audit` (append-only sink) |
| **Health / readiness** | per-service `/health` + `/ready` (used by `DeploymentProvider.health` and orchestration gating) | app-exposed, provider-scraped |
| **Status** | an aggregate status page (internal or public) derived from health + alerts | monitoring backend |

Two honesty rules carry over from the product: **the client stays quiet by default** (no telemetry beacons; any client metrics are opt-in and PII-free), and **a missing sink is reported, not faked** — with no `MonitoringProvider` configured, the admin surface says "no metrics sink configured" rather than showing empty graphs as if they were healthy. Audit reuses events the app *already emits*, so turning on audit is a matter of pointing them at a durable sink, not instrumenting new behaviour.

### 17.15 · Backup

`BackupProvider` gives every server-bearing deployment durable, restorable snapshots. It composes the sources Lattice already has rather than inventing a new store of truth.

**Snapshot scopes.** `project` (one project's vault + assets + CRDT snapshot), `workspace` (all its projects), and `instance` (full deployment: durable state + object store + config). Each snapshot is content-addressed, timestamped, retained per a policy, and **encrypted at rest**.

**Sources composed into a snapshot:**

| Source | What it captures | Reuses |
|---|---|---|
| Durable state (Postgres/Supabase or Drive) | vault JSON, membership, ACLs, memory | `StorageProvider` durable tier |
| Object storage | asset binaries | S3/MinIO |
| CRDT binary snapshots | exact co-editing state | existing `CRDTPersistenceAdapter` (§15.2) |
| Config (client-safe) | how the instance is wired | `EnvironmentProvider` output (never secrets) |

**Project / Workspace backup** are the user-facing granularities: an owner can snapshot a single project (for archival or migration) or a whole workspace, reusing the version-history plumbing (§7) for project-level restores. **Drive backup** and **Supabase backup** are the store-specific mechanisms behind the scope — Drive's own revision history and trash (§5) already provide one recoverable tier for L2, while L4/L5 add scheduled `pg_dump` + object-store replication offsite.

**Restore** is point-in-time and scoped: restoring a `project` reuses the version-restore path (with an automatic pre-restore backup, exactly as §7 does today), so a restore is itself reversible. **Rollback** spans two axes: **application rollback** (revert to a prior deployment via `DeploymentProvider.rollback`) and **data rollback** (restore a snapshot) — kept separate so an operator can roll back code without touching data, or vice-versa. Restore drills — a periodic, verified restore into a scratch environment — are an acceptance criterion (§17.23), because a backup that has never been restored is a hope, not a backup. And, as always, the client's local working copy plus Drive/GitHub histories mean the server backup tier is an *added* safety net, never the sole copy of anyone's work.

### 17.16 · Scaling

`ScalingProvider` expresses desired capacity per subsystem; the concrete mechanism (PaaS autoscale, K8s HPA, manual replicas) is the provider's business. The design's job is to keep each subsystem **independently scalable**, which in turn depends on each being either stateless or explicitly sharded.

| Subsystem | Axis | How it scales |
|---|---|---|
| **Frontend (static)** | horizontal | stateless; CDN/edge replicas, trivially scaled and cached |
| **Backend `api/*`** | horizontal | stateless (identity from token, ACL from store); serverless auto-scales, containers scale by replica count behind a load balancer |
| **Realtime** | horizontal (sharded) | Liveblocks scales for you; a self-hosted relay shards by **room = `projectId`** via consistent hashing, so a project's room is served by one node and rooms spread across the fleet |
| **Workers** | horizontal | queue-based; the `IndexJournal` and job queues are drained by N workers with concurrency caps; add workers to clear backlog |
| **Search** | horizontal (read) | managed vector DB / Postgres read replicas; local search scales with the client |
| **Embeddings** | horizontal + throttled | the cloud embed proxy scales by replica; calls are **batched, rate-limited and cached** (from §16.15) so cost/throughput stay bounded |
| **AI** | horizontal + quota | the AI gateway scales by replica with per-tenant concurrency/quota limits |
| **Plugins** | horizontal (isolated) | sandboxed plugin workers with per-plugin resource caps (reserved until the plugin runtime ships) |
| **Database / durable state** | vertical + read replicas | the one primarily-vertical tier; HA via primary + replicas + failover |

The two **stateful pins** are the database and the realtime layer; everything else is stateless and scales horizontally without coordination. Horizontal scaling is the default for stateless tiers (frontend, backend, workers, proxies); vertical scaling plus replicas covers the database. HA at L5 means multi-replica, multi-AZ stateless tiers in front of an HA database and a sharded realtime fleet — expressed as `ScalePlan`s the `ScalingProvider` applies, never as changes to product code.

### 17.17 · Security

Phase 10 generalizes the security posture the product already holds (§15.10) into provider-shaped, deployment-agnostic controls.

- **Secrets.** Never in the client bundle — the `VITE_*`/no-prefix rule becomes the `SecretProvider` contract (D6). Secrets live in the platform's store (Vercel env / Docker secrets / K8s Secrets / Vault / cloud secret manager), are injected server-side only, and are rotatable without a rebuild (§17.13).
- **Certificates.** TLS everywhere public, provisioned by `CertificateProvider` (platform-managed, Let's Encrypt via Caddy/cert-manager, or an enterprise CA); auto-renewal with expiry alerts (§17.14).
- **Network.** Private networking between `web`/`worker`/`db`/`object`/`realtime`; **only the proxy/ingress is public**; databases, object stores and self-hosted relays are never internet-exposed (§17.10). East-west traffic stays on the internal network.
- **Zero trust.** Every request is authenticated and authorized server-side — Google/SSO tokens are verified against the issuer (never trusting a client-claimed identity or role, exactly as `api/realtime/auth.ts` already does), and realtime ops are enforced against room ACLs. Extended in L5 to **service-to-service mTLS** between workers and internal services, so an internal foothold still can't move laterally unauthenticated.
- **Encryption.** TLS in transit; at-rest encryption via the storage/backup providers; CRDT snapshots and backups encrypted at rest; optional client-side field encryption for the most sensitive enterprise deployments.
- **Provider isolation.** Each provider's blast radius is bounded: a compromised embedding endpoint sees only consented, secret-redacted text for one call (§16.21); a compromised object store holds encrypted blobs, not tokens; the deployment provider's credentials live in CI, not in the runtime. No single provider compromise yields the whole system, because no provider holds more than its interface needs.

The reused primitives are concrete, not aspirational: **server-side token verification** (`api/realtime/*`), **secret detection** (`src/lib/security/secrets.ts`), **sandboxed iframes** with `referrerPolicy=no-referrer` (§7), and the **shared permission matrix** (`permissions.ts`) enforced identically in UI, realtime server and intelligence layer. Phase 10 spreads these across every deployment mode rather than inventing new ones.

### 17.18 · Deployment matrix

The consolidated capability grid — what each `DeploymentProvider` supports, generated from the providers' self-reported `capabilities` (like `formatMatrix`, §15.8, so code and docs cannot drift). `✅` native, `◑` via a companion provider, `—` not supported (and honestly reported as such).

| Capability | Vercel | Docker | Compose | Railway | Render | Fly | K8s | OpenShift |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Build | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Deploy | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Rollback | ✅ | ◑ tag | ◑ tag | ✅ | ✅ | ✅ | ✅ rev | ✅ rollout |
| Preview URLs | ✅ | — | — | ◑ | ✅ | ◑ | ◑ | ◑ Route |
| Logs | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Health | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Env vars | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Domains | ✅ | ◑ proxy | ◑ proxy | ✅ | ✅ | ✅ | ◑ ingress | ◑ Route |
| Managed TLS | ✅ | ◑ Caddy | ◑ Caddy | ✅ | ✅ | ✅ | ◑ cert-mgr | ◑ operator |
| Websocket realtime (self-host) | ◑ ext | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Object storage | ◑ ext | ◑ | ✅ MinIO | ◑ | ◑ | ✅ | ✅ | ✅ |
| Workers / cron | ◑ ext | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Horizontal scale | ✅ auto | — | ◑ | ✅ | ✅ | ✅ | ✅ HPA | ✅ HPA |
| SSO | ◑ | ◑ | ◑ | ◑ | ◑ | ◑ | ◑ | ✅ |
| Audit sink | ◑ | ◑ | ◑ | ◑ | ◑ | ◑ | ✅ | ✅ |
| Air-gap | — | ◑ | ✅ | — | — | ◑ | ✅ | ✅ |
| Typical level | L2–L3 | L4 | L4 | L2–L3 | L2–L3 | L3–L4 | L5 | L5 |

The matrix is the honest map from "where do I want to run this?" to "what will I get?" — and its `◑` cells name the companion provider (proxy, cert-manager, external object store) that closes the gap, so nothing is a dead end, just a configuration.

### 17.19 · Folder structure (specification)

```
deploy/                          # control plane — NOT shipped in the browser bundle
  DeploymentProvider.ts          # interface + capabilities
  RuntimeProvider.ts
  EnvironmentProvider.ts SecretProvider.ts
  MonitoringProvider.ts LoggingProvider.ts
  BackupProvider.ts CertificateProvider.ts ScalingProvider.ts
  deployModel.ts  matrix.ts      # types + code-generated capability matrix (§17.18)
  providers/
    vercel/  docker/  compose/  railway/  render/  fly/  kubernetes/  openshift/
                                 # one folder per DeploymentProvider implementation
infra/                           # declarative deployment assets (design targets)
  docker/     Dockerfile  Dockerfile.worker  .dockerignore
  compose/    compose.yaml  compose.full.yaml  compose.enterprise.yaml
  k8s/        (manifests / Helm chart)
  openshift/  (templates / operator config)
  proxy/      Caddyfile / traefik.yaml
api/                             # existing serverless handlers — now runtime-adapted
  _lib/backend.ts                # BackendProvider: handler registry runnable on any runtime
  github/oauth.ts  realtime/auth.ts  realtime/rooms.ts  intelligence/embed.ts
src/lib/config/
  runtimeConfig.ts               # EnvironmentProvider client: fetch /config.json, layer with VITE_*
  appConfig.ts                   # typed AppConfig + safe defaults
public/
  config.example.json            # runtime-config template for self-host / enterprise
```

Two rules the layout encodes: **`deploy/` and `infra/` never import from `src/`** (the control plane doesn't depend on product code), and **`src/` never imports from `deploy/`** (product code never depends on the control plane) — the one-way coupling of §17.4 made structural. The only bridge is `src/lib/config/runtimeConfig.ts`, which *reads* a config file the deployment produced but knows nothing about how it was produced.

### 17.20 · Lifecycle

The deployment lifecycle, provider-mediated end to end:

```
  build ──▶ provision ──▶ deploy ──▶ verify ──▶ promote ──▶ observe ──▶ (rollback?)
   │           │            │          │           │           │            │
DeploymentP  Secret/Env/  Runtime   health/     Deployment  Monitoring/  Deployment
 .build()    Certificate  Provider  readiness   Provider    Logging      Provider
             Provider     .bind()   smoke tests .promote()  Provider     .rollback()
```

1. **build** — `DeploymentProvider.build` runs the existing `tsc --noEmit && vite build` plus the backend bundle → one `BuildArtifact` (D2).
2. **provision** — `EnvironmentProvider` resolves client-safe config, `SecretProvider` stages secrets, `CertificateProvider` ensures TLS.
3. **deploy** — the `RuntimeProvider` binds each `api/*` handler, worker and (optional) relay to its execution model; the static SPA goes to edge/CDN.
4. **verify** — health/readiness gates plus smoke checks: `/api/health` responds, realtime auth mints a token, the durable store and object store are reachable, a trivial search returns. A failed gate **stops the rollout**.
5. **promote** — preview → production (or blue-green swap); on any provider without preview URLs this is a direct gated deploy.
6. **observe** — `MonitoringProvider`/`LoggingProvider` watch the new deployment; alert rules arm.
7. **rollback** — a failed health check or an alert can trigger `DeploymentProvider.rollback` to the last good deployment automatically.

**Provider selection at boot.** The *browser app* reads only its resolved `AppConfig` (which application providers are on) — it never selects a deployment provider. Deployment-provider selection happens in CI/ops from the target and available credentials (`isAvailable(env)`), so the same artifact is directed to Vercel or K8s by configuration, not by code.

### 17.21 · Migration strategy

- **From today's Vercel-only setup.** Purely additive and backwards compatible: introduce the `EnvironmentProvider` runtime-config shim (with `VITE_*` still working as the lowest-precedence layer, §17.13), extract the `api/*` handlers behind a `BackendProvider` so they can also run off-Vercel, and add `DeploymentProvider` adapters. **No product code changes and no data migration** — the existing Vercel deployment keeps working throughout, now as one `DeploymentProvider` among several.
- **From the old OpenShift-centric Phase 10.** OpenShift is reframed as **one `DeploymentProvider`** (`deploy/providers/openshift/`) rather than the mandated target; any prior OpenShift assets fold into `infra/openshift/`. Nothing about the product is OpenShift-shaped anymore, which is the entire point of this rewrite.
- **Moving between providers (no data loss).** Because storage is provider-abstracted and the vault is portable (JSON bodies + object blobs + GitHub + CRDT snapshots), migrating deployments means either **pointing the new deployment at the same storage/realtime providers** (instant — same data, same build, new control plane) or running a `BackupProvider` snapshot on the old and `restore` on the new. Either way the artifact is identical and the data is preserved; there is no "export/reimport into a different product" step, because it is the same product.
- **Level upgrades.** Moving L2→L3→L4→L5 is switching providers on, not re-platforming: add Supabase (L3), then containerize with object storage and a self-hosted relay (L4), then orchestrate with SSO/audit/policy (L5). Each step is reversible and touches configuration, not code.

### 17.22 · Roadmap

- **Future deployment providers** — Cloudflare (Workers + R2 + Pages), AWS (Cloud Run-style via App Runner / ECS Fargate + S3), Azure Container Apps, GCP Cloud Run, Netlify, Coolify, Deno Deploy — each a new `deploy/providers/*` folder implementing the same interface.
- **Future enterprise features** — SCIM user provisioning, data-residency pinning per workspace, bring-your-own-key (BYOK) encryption, VPC peering, private-link connectors, and a full admin console over the platform providers.
- **Future cloud capabilities** — multi-region active-active durable state, edge-resident CRDT (bringing realtime closer to users), and a managed "Lattice Cloud" offering that is itself just one `DeploymentProvider` configuration of this architecture — the hosted product and the self-hosted product staying the same codebase, which is the promise this phase exists to keep.

### 17.23 · Acceptance criteria (targets)

Phase 10 is complete when, measurably:

- [ ] **One artifact, many targets:** the *same* `BuildArtifact` deploys and runs on **at least two** `DeploymentProvider`s (e.g. Vercel and Docker Compose) with **no product code change** — proven in CI.
- [ ] **Zero-config local still holds:** with all cloud/deployment env empty, `npm run dev` (L1) runs fully local exactly as today; nothing in Phase 10 regresses the local-first floor.
- [ ] **Config, not rebuild:** changing a client-safe setting via `/config.json` reconfigures a running deployment **without a rebuild** (D5), while `VITE_*` continues to work as the fallback layer.
- [ ] **Secrets never in the client:** an automated check confirms no secret value appears in the built bundle; all secrets resolve through `SecretProvider` server-side (D6).
- [ ] **Provider interfaces exist** for all eight platform providers with honest `capabilities`, a local/default implementation each, and `isAvailable()` gating; the **deployment matrix (§17.18) is code-generated** from those capabilities and cannot drift.
- [ ] **Backend runs off-Vercel:** the `api/*` handlers run unchanged as serverless functions *and* as container routes via `BackendProvider` on the selected `RuntimeProvider`.
- [ ] **Self-host brings up the full stack:** the Compose `full` profile stands up web + realtime relay + workers + db + object + proxy, all health-gated, serving the same app (L4).
- [ ] **Health-gated deploys + rollback:** a deploy whose smoke checks fail is stopped and rolled back automatically via `DeploymentProvider.rollback`.
- [ ] **Backup/restore round-trip:** a `BackupProvider` snapshot restores into a clean environment with the project intact (a verified restore drill, not just a stored snapshot).
- [ ] **Enterprise is additive:** SSO produces the same `Account`, audit captures existing `ActivityLog` events, and a `PolicyProvider` can only *narrow* access — demonstrated with **no branch on "enterprise" in product code** (D7).
- [ ] **Observability plugs in or reports absent:** metrics/logs/traces/audit flow to a configured sink, and an unconfigured sink is honestly reported, never faked.
- [ ] **Scaling is independent:** each stateless subsystem scales horizontally without coordination; the realtime relay shards by `projectId`; documented `ScalePlan`s apply via `ScalingProvider`.
- [ ] **Coherence preserved:** `StorageProvider`, `RealtimeProvider`, and the §16 `SearchProvider`/`EmbeddingProvider` run unchanged across all modes; `BackendProvider`/`AutomationProvider`/`DesignProvider`/`PluginProvider` have a reserved, documented place in the topology.

> **Phase 10 in one line:** infrastructure becomes the last thing to hide behind an interface — after which Lattice is not "a Vercel app that might run elsewhere," but *a single, honest, local-first product that runs anywhere, and happens to have a good default cloud.*

## 18 · Folder structure (source)

```
api/
  github/oauth.ts              # Vercel function: GitHub OAuth token exchange
src/
  App.tsx                      # providers + login gate + mode router
  types/model.ts               # entities incl. Project/Account/SyncState/BoardSection/WebEmbed
  types/collab.ts              # Phase 7: roles, members, invites, presence, comments, activity, versions
  store/useStore.ts, seed.ts   # vault store (persisted, versioned migration), useUiStore.ts
  lib/
    env.ts                     # VITE_* configuration
    auth/                      # AuthService (Google GIS / mock) + AccountProvider
    collab/                    # Phase 7: hub + providers (local/drive-polling/realtime),
                               #   permissions, members, invites, presence, comments,
                               #   activity, versions, board/document sync, ConflictResolverV2
    sync/                      # SyncEngine + ConflictResolver + syncStore
    storage/                   # StorageProvider (IndexedDB) + GoogleDriveStorageProvider
    github/GithubCodeProvider.ts
    projects/                  # ProjectRegistry + ProjectStore
    registry/fileKinds.tsx     # FileKindRegistry + FileKindIcon
    registry/documents.ts      # DocumentRegistry + EditorRegistry
    web/WebEmbedService.ts     # URL sanitization + embeds
    board/sections.ts          # section geometry/ordering helpers
    import/ export/ convert/ assets/ code/ richdoc/ sheet/  # engines (Phases 1–4)
  components/
    Sidebar.tsx TopBar.tsx CommandPalette.tsx Inspector.tsx DocumentView.tsx
    ui/                        # Phase 7: Toaster, ConfirmDialog (confirm/prompt), ShortcutsDialog
    collab/                    # Phase 7: ShareDialog, PresenceAvatars, BoardPresenceLayer,
                               #   CommentPins, CollabPanel (comments/activity/versions), ReadOnlyBanner
    account/                   # LoginScreen + ProfileMenu
    projects/ProjectSwitcher.tsx
    github/GithubDialog.tsx
    workspaces/ModeWorkspaces.tsx   # Sheet/Code/Presentation modes + empty states
    board/                     # canvas, cards, SectionNode, WebEmbedCardNode
    richdoc/ code/ sheet/ preview/  # editors & previews
```

## 19 · Vault structure (virtual, mirrors cloud + future disk layout)

```
/projects/<id>    project spaces (config in project.json when synced)
  /notes /documents /spreadsheets /presentations /code /boards /assets /imports /config
```
