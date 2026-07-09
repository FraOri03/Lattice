# Lattice

A **local-first unified creative workspace**: Obsidian-style linked notes, a Figma-style infinite board with sections, a Word/Notion-style rich document editor, a VS Code-style code workspace with GitHub sync, an Excel-style spreadsheet engine, projects, a personal account area, and Google Drive cloud sync — with universal file import and 3D asset embedding.

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
| Presentation editor | ⬜ **not built** — Presentation mode is an honest placeholder; imported PPTX/ODP stay preserved assets |
| Realtime collaboration | ⬜ Phase 7 — architecture prepared (see §13), not implemented |

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

The repo ships `vercel.json` (Vite framework preset, SPA rewrites that spare `/api/*`, immutable asset caching) and one serverless function, `api/github/oauth.ts` (the GitHub token exchange — the only server-side code).

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

## 13 · Phase 7 roadmap — realtime collaboration

Prepared seams (not implemented):

- **ConflictResolver** is the designated merge point — swapping newest-wins for CRDT/operation-log merging doesn't touch the sync plumbing.
- **SyncEngine** already separates snapshot metadata from bodies and tracks per-entity versions; an op-log can replace the timestamp diff.
- **Projects** are the natural sharing unit (`/Lattice/projects/<id>` maps to per-project ACLs).
- **AccountProvider** supports multiple providers per account (`Account.providers`).
- Presence, shared cursors, and a websocket transport (or Drive Realtime alternative) are net-new Phase 7 work, deliberately not faked today.

Also on the roadmap: presentation engine, File System Access API vault, DOCX/PDF export, plugin API, PR-based GitHub flow, remote-deletion management UI.

## 14 · Folder structure (source)

```
api/
  github/oauth.ts              # Vercel function: GitHub OAuth token exchange
src/
  App.tsx                      # providers + login gate + mode router
  types/model.ts               # entities incl. Project/Account/SyncState/BoardSection/WebEmbed
  store/useStore.ts, seed.ts   # vault store (persisted, versioned migration), useUiStore.ts
  lib/
    env.ts                     # VITE_* configuration
    auth/                      # AuthService (Google GIS / mock) + AccountProvider
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
    account/                   # LoginScreen + ProfileMenu
    projects/ProjectSwitcher.tsx
    github/GithubDialog.tsx
    workspaces/ModeWorkspaces.tsx   # Sheet/Code/Presentation modes + empty states
    board/                     # canvas, cards, SectionNode, WebEmbedCardNode
    richdoc/ code/ sheet/ preview/  # editors & previews
```

## 15 · Vault structure (virtual, mirrors cloud + future disk layout)

```
/projects/<id>    project spaces (config in project.json when synced)
  /notes /documents /spreadsheets /presentations /code /boards /assets /imports /config
```
