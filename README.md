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

## 15b · Phase 9 roadmap

- Anonymous read-only **public viewer** (server groundwork exists: room `defaultAccesses` + metadata flags).
- Unified transfer dialog (import planning UI); cell-level sheet CRDT; doc-range comment anchors.
- Lazy three.js; CRDT subdocument partitioning for very large projects; PR-based GitHub flow; File System Access API vault; plugin API; billing; web clipper; AI assistant; mobile UI.

## 16 · Folder structure (source)

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

## 17 · Vault structure (virtual, mirrors cloud + future disk layout)

```
/projects/<id>    project spaces (config in project.json when synced)
  /notes /documents /spreadsheets /presentations /code /boards /assets /imports /config
```
