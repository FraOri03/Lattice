# Lattice

A **local-first unified creative workspace** — Obsidian-style linked notes, a Figma-style
infinite board with sections, a Word/Notion-style rich document editor, a VS Code-style
code workspace with GitHub sync, an Excel-style spreadsheet engine, and a slide editor,
all organized into **projects** inside **workspaces**, with optional Google Drive cloud
sync and CRDT realtime collaboration.

One vault holds every kind of thing you work with — notes, documents, spreadsheets, decks,
boards, code and imported files — and every one of them can be a **card** on an infinite
canvas, linked visually and semantically.

> **Documents and assets are entities. Cards are views of them. Projects own them. The cloud mirrors them.**

## Project status

**Alpha / experimental.** Functionally broad, but no public release has been cut (no Git
tags, no CI). Based on the project's own [UX/UI audit](https://github.com/FraOri03/Lattice/issues/5):
single-user local work is the most mature (late-alpha / early-beta); team & realtime
features work but are **config-gated and alpha**. Cloud and realtime features degrade
honestly when unconfigured — nothing is faked. See [docs/limitations.md](docs/limitations.md).

## Features

- **Six editing surfaces** — board, rich documents, markdown notes, spreadsheets, slide
  decks, and a Monaco code workspace.
- **Infinite board** — Figma-like sections, web-embed cards, and a card view for every
  entity kind.
- **Universal import/export** — PDF, Office (DOCX/XLSX/PPTX/ODF), media, 3D, code;
  DOCX/PPTX/PDF export. See [docs/file-formats.md](docs/file-formats.md).
- **Projects & workspaces** — everything scoped to the active project; command palette,
  quick create, recents, dark/light theme.
- **Cloud sync** — offline-first Google Drive backup (`drive.file` scope; single-user,
  multi-device).
- **GitHub code sync** — connect a repo, import/commit code documents to a feature branch.
- **Collaboration** — roles & server-enforced permissions, presence, comments, version
  history, and CRDT co-editing (Liveblocks + Yjs) when configured. See
  [docs/collaboration.md](docs/collaboration.md).

A full, status-tagged inventory is in [docs/features.md](docs/features.md).

## Tech stack

React 19 · TypeScript · Vite 6 · Zustand · Tiptap (ProseMirror) · Monaco · React Flow ·
Yjs + Liveblocks (CRDT realtime) · SheetJS · jsPDF · three.js · Tailwind CSS. Deployed on
Vercel with serverless functions for GitHub OAuth and realtime auth.

## Quick start

```bash
npm install
npm run dev        # → http://localhost:5173
```

With no configuration the app runs fully local (mock account, sync disabled, GitHub via
personal access token, realtime limited to tabs of one browser).

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (HMR) at http://localhost:5173 |
| `npm run build` | Typecheck + production build → `dist/` |
| `npm run typecheck` | TypeScript typecheck only |
| `npm test` | Unit tests (Vitest) |
| `npm run preview` | Serve the production build locally |

### Minimal configuration

Everything is optional. Copy the template and fill in only what you need:

```bash
cp .env.example .env.local
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
| Main bundle (React, board, Tiptap, Yjs) | **550 kB** | initial (three.js removed in Phase 9 — see §15c.5) |
| three.js (viewer/scene) | 154 kB | **lazy** (Phase 9 — only 3D previews/cards) |
| Monaco code editor | 865 kB | lazy (Code mode) |
| SheetJS (xlsx) | 161 kB | lazy (first sheet import/export) |
| jsPDF | 129 kB | lazy (PDF export) |
| Realtime SDK (Liveblocks) | 54 kB | lazy (only when configured) |
| Presentation workspace | 5.8 kB | lazy |
| Spreadsheet workspace | 8.7 kB | lazy |

Skeleton/loading states cover every lazy module. Presence cursors are throttled (60 ms), drags (50 ms), board CRDT commits batched (80 ms). **Phase 9 update:** three.js is no longer in the main bundle — it is a dedicated lazy chunk, and off-screen 3D/media animation loops are suspended (§15c.5).

### 15.12 Known limitations (Phase 8)

- **Public no-login share links are not built.** Sharing is role-based and server-enforced; the Share dialog says exactly that and points to the real alternatives (HTML/PDF/DOCX/PPTX exports, vault files). An anonymous read-only viewer is the Phase 9 item.
- The unified import/export **transfer dialog** (plan → confirm → report in one surface) is partial: per-file progress, error reporting and conversion reports exist, but the planning step before import is not a dedicated dialog yet.
- Version snapshot payloads over 200 KB stay device-local (index syncs; smaller bodies sync through the collab CRDT doc).
- Sheet editing is body-level sync (save-granular), not cell-level CRDT; sheet/deck *presence* is live.
- Board same-node conflicts resolve last-writer-wins per node (different nodes never conflict); doc-range-anchored comments inside rich documents are not anchored to exact ranges yet.
- PPTX/ODP import flattens masters/themes/animations (reported per file); PPTX export is basic fidelity by design.
- Realtime requires Google sign-in (identity source); local mock accounts stay tabs-only + Drive.

| Variable | Unlocks |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google sign-in + Drive sync |
| `VITE_GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` | One-click GitHub OAuth (PAT works without it) |
| `VITE_REALTIME_BACKEND=liveblocks` + `LIVEBLOCKS_SECRET_KEY` | Cross-device realtime |

Full setup, provider configuration and deployment are in [docs/setup.md](docs/setup.md)
and [docs/integrations.md](docs/integrations.md).

> **Deployment:** the repo is Vercel-ready (`vercel.json` + `api/`), but no public demo
> URL is published in this repository. Deploy your own following
> [docs/setup.md](docs/setup.md#deployment-vercel).

## Roadmap

Planning lives in **GitHub Issues and a GitHub Project**, not in this README.

- **GitHub Project — _Lattice Roadmap_:** _pending — see [ROADMAP.md](ROADMAP.md#creating-the-github-project) for the setup commands._ <!-- Replace with the Project URL once created. -->
- **Roadmap overview & conventions:** [ROADMAP.md](ROADMAP.md)
- **Open issues:** https://github.com/FraOri03/Lattice/issues
- **What already shipped:** [CHANGELOG.md](CHANGELOG.md)

## Documentation

| Doc | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Data model, stores, services, CRDT layer, source layout |
| [docs/features.md](docs/features.md) | Status-tagged feature inventory |
| [docs/setup.md](docs/setup.md) | Install, commands, build, test, deploy, troubleshooting |
| [docs/integrations.md](docs/integrations.md) | Google, Drive, GitHub, Liveblocks, conversion backend |
| [docs/collaboration.md](docs/collaboration.md) | Realtime model, permission matrix, honest limits |
| [docs/file-formats.md](docs/file-formats.md) | Import/export support matrix and fidelity |
| [docs/limitations.md](docs/limitations.md) | Known limitations and the security model |

## 15c · Phase 9 (P1) — accessibility, navigation & performance

The Phase 8.5 audit's **P1** items (§15b) — the ones gating public beta — are implemented. Details live in dedicated docs: [`docs/accessibility.md`](docs/accessibility.md), [`docs/navigation.md`](docs/navigation.md), [`docs/performance.md`](docs/performance.md), [`docs/collaboration.md`](docs/collaboration.md).

### 15c.1 Board keyboard accessibility (`LAT-2`, was Critical)

The infinite board is now fully operable without a mouse, layered on React Flow's focus model rather than replacing it. React Flow keeps every card **Tab-focusable** (`nodesFocusable`) while its own key handling is turned **off** (`disableKeyboardA11y`), so a single tested controller (`useBoardKeyboard` over the pure `src/lib/board/keyboardNav.ts`) owns all board keys with no double-firing.

| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Move focus between cards; the focused card is selected and announced |
| Arrow keys | Move the focused card (10 px) |
| `Shift`+Arrow | Move in coarse steps (50 px) |
| `Alt`+Arrow | Move in precise steps (1 px) |
| `Enter` | Open the focused card's entity in its workspace |
| `L` | Start a keyboard connection from the focused card; `Enter`/`L` on another card completes it, `Esc` cancels |
| `Delete` / `Backspace` | Delete the selection (or the focused card) |
| `A` | Open the keyboard-navigable **Add card** menu |
| `Esc` | Cancel a link / close the add menu |

Shortcuts **never fire inside an editor** — inputs, textareas, contenteditable (Tiptap), Monaco and the spreadsheet grid are all excluded (`isEditableTarget`). Every action announces through one polite `aria-live` region (`src/lib/a11y/announcer.ts` → `<LiveRegion/>`): selection, move (with coordinates), link, add and delete. The board region is a `role="application"` with an `aria-describedby` instructions block; cards carry accessible names ("Document card: Roadmap"). Pointer drag-and-drop, box-select and connection-handle dragging are untouched.

### 15c.2 Status is never colour-only (`LAT-11` / A11Y-2)

Sync, Drive, realtime, roles, presence and the minimap now encode state with **icon/shape + text + accessible name**, colour only reinforcing. The realtime chip shows a distinct icon per state (check / spinner / alert / cloud-off / lock) so statuses that share a colour stay distinguishable; the Drive chip uses a warning glyph for errors; presence carries a scope badge; the minimap has an `ariaLabel`. `:focus-visible` and `prefers-reduced-motion` are preserved.

### 15c.3 Collaboration honesty propagated (`COL-1` / issue #9)

The honesty of the realtime chip now reaches every collaboration surface, from **one source of truth** — `src/lib/collab/collabPresentation.ts` derives the tier from the active provider's real capability signals (a configured backend **and** a Google identity), not scattered env reads:

- **realtime** — Liveblocks + Yjs across devices (only when `VITE_REALTIME_BACKEND=liveblocks` + Google sign-in);
- **drive** — Google Drive polling (~20 s), no live cross-device presence;
- **local** — BroadcastChannel, tabs of this one browser.

Presence avatars carry a "same browser" / "Drive" scope badge, the Share button and dialog state the exact scope, and the Share dialog shows one honest banner — so no avatar or control implies live remote collaboration that isn't configured. The realtime setup checklist stays available; nothing is simulated.

### 15c.4 Browser back/forward + deep links (`NAV-1` / issue #10)

A tiny centralized abstraction (`src/lib/nav/navUrl.ts` + `useUrlHistory`) binds the **navigable identity** — project · mode · board · the single open entity — to the History API:

```
store change (project/mode/board/entity) ──▶ history.pushState
Back / Forward (popstate)                ──▶ store.applyNav
direct load / refresh                    ──▶ restore from ?p=…&m=…&b=…&e=…
```

Back no longer exits the app; refresh and direct links restore the view; **invalid ids degrade safely** (unknown project → current, bad board → the project's first, missing entity → dropped, bad mode → `board`). Transient churn (selection, drag, typing) never touches history — a `navKey` dedup + an `applying` guard prevent React↔URL↔popstate loops. The existing `#invite=` hash flow is preserved (history owns the search string, never the hash). Split-as-mode and Workspace nesting (the Medium items) were intentionally left out of scope.

### 15c.5 Performance — lazy three.js + off-screen pausing (`LAT-4`/`LAT-5`)

**three.js left the main bundle.** It is imported only through lazy boundaries (`ThreeScene.tsx` for `embed3d` cards, `ThreeDViewerLazy.tsx` for asset models), and a `manualChunks` rule keeps it in one dedicated `three` chunk.

| Chunk (gzip) | Before | After |
|---|---:|---:|
| **main `index`** | **700.5 kB** (incl. three.js) | **549.7 kB** |
| `three` (lazy) | — | 153.6 kB |
| `ThreeScene` / `ThreeDViewer` (lazy) | — | 0.9 / 2.6 kB |

The main entry chunk dropped **≈ 151 kB gzip** and no longer contains three.js. 3D previews and cards render via a Suspense skeleton.

Off-screen and idle work is suspended (`src/lib/perf/`): an `IntersectionObserver` (`useInViewport`) plus page-visibility gate every 3D scene, so `requestAnimationFrame`, OrbitControls auto-rotate and continuous rendering **stop** when a card is off-screen, the tab is hidden, or the board is inactive; the asset viewer renders **on-demand** (a frame only on interaction/damping/resize — zero frames while a model sits still). A `ViewerBudget` caps concurrent live 3D scenes (4), expensive media (video) defers its player until first on-screen, and a dimensionally-stable placeholder holds every un-mounted card so edges and layout never shift. This is deliberate **content-windowing** (card chrome stays mounted; only heavy content suspends) rather than React Flow's destructive `onlyRenderVisibleElements`, so selected/dragged/linked cards and CRDT/editor state are never lost. A static board with no visible 3D runs no animation loops.

## 15c · Phase 9.5 — Project Graph View

A **Lattice-native Graph View inspired by Logseq's graph interaction
principles** — an automatically generated **relationship browser**. Graph is a
**view of the content**, not a section: open it from the **Graph** tab in the
top navigation, the command palette ("Open Graph view"), or **`G G`**. It can
fill the single pane, or sit in the second pane beside an editor when Split is
on. The top navigation is two clusters — **[Board · Graph]** and
**[Split · Document · Sheet · Presentation · Code · Photo]** — where Graph is a
view and Split a layout, so either can be active *together with* a section.

**Graph vs Board — kept distinct on purpose.** Board is a *manually arranged
creative workspace* (you place cards; positions are content). Graph is an
*automatically generated relationship browser* (the app derives the picture;
positions are a view, never a source of truth). Graph is read-only — selecting
and focusing are inspection states; opening a node hands off to its native
workspace.

**Renderer.** A **custom Canvas 2D renderer with a Web-Worker force layout** —
no new runtime dependencies, no new license surface, full control over Lattice's
design tokens, and trivial code-splitting. React Flow (which the Board uses) was
rejected for the graph: it is built for manual node editors, not automatic
relationship layout at scale. Sigma/Graphology/Pixi/Cytoscape were evaluated and
declined on footprint/fit (all MIT — see `docs/graph-view-licensing.md`).

**Relationship sources (all real, all typed & explainable).** Wikilinks/
backlinks (notes, documents, code — resolved by title), Board → Entity
membership and drawn board edges, imported **source assets** (DOCX/XLSX/PPTX →
editable entity) and 3D bundle dependencies, embedded assets, tags (shared tag
nodes → clusters), and GitHub-linked code. Project hub, card instances,
comments, versions and users are opt-in (off by default to avoid noise). Every
node mirrors a real entity; unresolved links never invent nodes.

**Scopes & features.** Project Graph and Local Graph (depth 1–5); force / grid /
radial layouts (deterministic, stable across reloads); search; per-kind and
per-relationship filters that remove hidden nodes from the data (so they can't
be clicked or found); a context inspector that **explains why each relationship
exists**; empty/loading/error states that always say why.

**Permissions.** Graph respects Lattice's per-project model — every entity is
filtered to the active project before it reaches the renderer, so no other
project's entities, titles or counts leak. Viewer/Commenter get the same graph
visibility (read-only) plus their existing abilities.

**Performance.** Lazy-loaded (`GraphWorkspace` chunk ≈ 50 kB / 16 kB gz; worker
its own chunk; **no main-bundle impact** beyond a tiny settings decoder). Build
+ layout run in a Web Worker; no perpetual animation; off-screen culling and
capped labels. Tiers: Small ≤ 500 · Medium ≤ 5,000 · Large ≤ 20,000 · Extreme >
20,000. Measured: 20,000 nodes / ~61,000 edges index in ~0.12 s and lay out in
~2–6 s in-worker.

**Accessibility.** Full keyboard traversal of the canvas (arrows move / traverse
connected nodes, Enter open, Space select, Esc clear), an `aria-live` status
line, an always-available **structured list view** as a screen-reader
alternative, reduced-motion support, fixed-size mode, and icon+shape+label
redundancy (never colour-only).

**Known limitations.** Edge-only selection is via the inspector's relationship
rows (canvas hit-testing is node-first); comment/version/user edges are wired as
seams but not populated in v1 (they need collaboration data); the Local Graph
sidebar panel (`LocalGraphPanel`) exists but is not yet embedded in other modes;
AI "suggested-related" edges are a reserved seam for Phase 9.5 Project
Intelligence, visually distinguished and never mixed into verified
relationships.

Docs: `docs/graph-view-architecture.md`, `graph-view-data-model.md`,
`graph-view-interactions.md`, `graph-view-accessibility.md`,
`graph-view-performance.md`, `graph-view-licensing.md`. Settings/state are
additive (`ViewMode` gains `graph`; store gains per-project `graphSettings`) —
no data migration; the sections, palette, history, collaboration, Drive and
GitHub are unchanged.

### Information architecture — sections, views and layouts

The interface separates three things that a single `ViewMode` enum used to
conflate:

| Concept | What it is | Where it lives |
|---|---|---|
| **Section** | *what* you work on — Board, Document, Sheet, Presentation, Code, Photo | `viewMode` in `useStore`, chosen from the top navigation |
| **View** | *how* the content is shown — the native editor, or the **Graph** | `viewMode === 'graph'` (primary pane) or the second pane |
| **Layout** | one pane, or a **Split** with a resizable second pane | `src/store/workspaceLayoutStore.ts`, toggled by the **Split** tab |

Split and Graph sit in the top navigation next to the sections, but they are
**not** sections: they are a layout and a view, so they can be active *at the
same time* as one (the Split tab and the Document tab are both pressed when you
are editing a document beside the board). They also compose — "editor on the
left, Graph on the right" is a normal state. Existing deep links keep working:
`m=split` is still the URL token for the split layout, and a persisted
`viewMode: 'split'` is migrated on load. See
[docs/navigation.md](docs/navigation.md#split-is-a-layout-not-a-mode).

### Project calls — audio, camera and screen share (LiveKit)

A project can host a **call**, carried by LiveKit alongside — never inside —
the existing collaboration stack. Liveblocks + Yjs keep owning CRDT content,
presence, cursors, comments, roles and content permissions; LiveKit carries
only microphone, camera and screen share.

**Presence is not the call.** Having the project open puts you in presence;
joining the call is always an explicit action, and the topbar keeps the two
states distinct ("Join call" vs an "In call" chip). Once connected, a compact
**call island** sits bottom-right — mic, camera, screen share, device picker,
expand/collapse and leave — never a full-screen conference view. The call
survives moving between sections, toggling Split and opening the Graph,
because its provider is mounted above the workspace panes.

**Microphone and camera are OFF when you join**, and the browser is not asked
for device permission until you press a control.

Access is server-enforced: `api/realtime/media-token.ts` verifies the Google
identity, reads the role from the project ACL (never from the request body) and
signs a LiveKit token scoped to that project's room with only the capabilities
the role allows — so screen share is genuinely unavailable to a role that lacks
it, not merely hidden. The matrix and its rationale are in
[docs/collaboration.md](docs/collaboration.md). Without `VITE_LIVEKIT_URL`,
`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` and the realtime backend, calls are
disabled with an explanation and nothing is attempted.

## 15d · Photo mode — set & lighting planner

A **top-down photographic set planner**, last in the top nav (**… · Code ·
Photo**). Plan a shoot on a metric canvas: place cameras, lights, people and
props from a categorised library, arrange them against backdrops, and read the
resulting **2D light simulation** (cones, falloff and shadows recomputed from
each fixture's type, power, spread and position).

**What it adds.** A scene is a list of *shots*; each shot holds elements with
position, rotation and per-type parameters, edited through the inspector and the
timeline (shot list). Elements are drawn with the **Photoicons** top-down
artwork. An **AI set designer** (`src/lib/photo/ai.ts`) can propose a setup from
a prompt — it is **BYOK** (bring your own key) and degrades to an offline
heuristic when no key is present, so the mode is fully usable without any
network call. Scenes import/export as JSON.

**Board integration.** A `photo` **card type** puts a live preview of the
project's set on the board; double-clicking it opens Photo mode. The card
carries **no payload** — it reads the project's scene — so it travels through the
generic card path and needs no export-schema change.

**State & collaboration.** Photo scenes live in a **separate store**
(`src/store/photoStore.ts`) persisted to `localStorage` and keyed per project.
They are deliberately *outside* the Yjs document, so Photo mode adds nothing to
the CRDT payload and the `local`, `drive` and `realtime` (Yjs + Liveblocks)
modes behave exactly as before. Board photo cards sync like any other card, and
card creation is gated by the existing permission model (the canvas toolbar is
hidden when read-only).

**Known limitations.** The scene itself is **local-only**: it is not synced
through Drive or Liveblocks and is not part of the vault export, so collaborators
opening a shared board see the photo card but render their own local scene (use
scene JSON export/import to hand a set over). Lighting is a **2D approximation**
for planning, not a physically accurate render. The AI designer requires a
user-supplied key for its non-heuristic path.

## 16 · Folder structure (source)
## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: branch from `main`, pick or open an
issue, run `npm run build` and `npm test`, update the docs you touch, and link the issue
in your PR.

## License

Released under the **[CC0 1.0 Universal](LICENSE)** public-domain dedication — do whatever
you like with it, no attribution required.
