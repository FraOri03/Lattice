# Features

An honest, evidence-based inventory of what Lattice does today. Statuses are assigned
from the source in `src/` and the project's own UX/UI audit (issue
[#5](https://github.com/FraOri03/Lattice/issues/5)), not from marketing.

## Status legend

| Status | Meaning |
|---|---|
| **Stable** | Implemented and works reliably in the primary context (local, single-user). |
| **Beta** | Implemented and functional, but newer, config-gated, or with documented fidelity limits. |
| **Experimental** | Implemented but requires external configuration and is not turnkey — treat as alpha. |
| **Partial** | Only part of the described capability exists; the rest is tracked as an issue. |
| **Planned** | Not built yet; lives in the [roadmap](../ROADMAP.md) as an issue. |

> **Overall maturity:** late-alpha / early-beta for single-user local work; **alpha** for
> team / realtime (works, but gated behind configuration and honest about it). No public
> release has been cut. See [limitations.md](limitations.md).

## Editing surfaces

| Feature | Status | Notes |
|---|---|---|
| Markdown notes (`[[wikilinks]]`, backlinks, tags) | Stable | Obsidian-style linked notes. |
| Rich documents (Tiptap / ProseMirror) | Stable | Headings, lists, tables, tasks, callouts, wikilinks, asset embeds; CRDT-native. |
| Code workspace (Monaco) | Stable | 30+ languages, digested metadata, GitHub link metadata per file. Strongest surface. |
| Spreadsheets (virtualized grid + `FormulaEngine`) | Stable | Dependency-free formula engine; small function set (see [limitations.md](limitations.md)). |
| Presentation editor (960×540 canvas) | Beta | Slides, text/shapes/images, themes, speaker notes; **no presenter/slideshow mode yet**. |
| Infinite board (React Flow) | Stable | Cards reference entities; every entity kind can be a card. |
| Board sections (Figma-like frames) | Stable | Rename/resize/recolor/collapse, group-move, minimap. |
| Web embed cards | Stable | Sandboxed iframe + link-preview fallback; URL sanitized on creation. |

## Import / export

| Feature | Status | Notes |
|---|---|---|
| Universal import (PDF, Office, media, 3D, code) | Stable | Pipeline with progress reporting; see [file-formats.md](file-formats.md). |
| DOCX export (native WordprocessingML) | Beta | Since Phase 8. |
| PPTX export | Beta | Valid PresentationML — **basic fidelity** (text/shapes/images; no themes/animations). |
| PDF export (docs/sheets/decks) | Beta | Vector via lazy jsPDF. |
| XLSX / CSV export | Stable | Via lazy SheetJS. ODS export not implemented (reported on import). |
| PPTX / ODP import → editable deck | Beta | Masters/themes/animations flattened (per-file report); source preserved. |
| JSON project export / import | Stable | Full project round-trip. |
| Legacy DOC / PPT / high-fidelity conversion | Planned | Requires the external conversion backend ([integrations.md](integrations.md)). |

## Organization

| Feature | Status | Notes |
|---|---|---|
| Projects (create/rename/archive/delete/star, icon/color, switcher) | Stable | All lists/search/palette/boards scoped to the active project. |
| Workspaces (`Workspace → Project`) | Beta | Organizational only; enforcement stays per-project. |
| Command palette (Ctrl/Cmd+K), quick create, recents, filters | Stable | Create anything, switch modes/projects/theme, search. |
| Dark / light theme | Stable | One design-token set across surfaces. |

## Account & cloud

| Feature | Status | Notes |
|---|---|---|
| Google sign-in (OAuth via GIS) | Beta | Real when `VITE_GOOGLE_CLIENT_ID` is set; honest local mock otherwise. |
| Google Drive sync (offline-first, single-user multi-device) | Beta | Newest-wins conflicts with backups; **not** multi-user collaboration. |
| GitHub code sync (connect, link repo, browse, import, commit, pull) | Beta | Code documents only; commits only on explicit action; default branch protected. |

## Collaboration

See [collaboration.md](collaboration.md) for the full model, permission matrix and honest limits.

| Feature | Status | Notes |
|---|---|---|
| Same-browser realtime (tabs/windows via BroadcastChannel) | Stable | Real, instant; makes every collaboration feature testable with no backend. |
| Drive-polling collaboration (durable state, ~20s) | Beta | Members/invites/comments/activity/versions via `collab.json`. |
| Cross-device realtime (Liveblocks + Yjs CRDT) | Experimental | Config-gated (`VITE_REALTIME_BACKEND=liveblocks` + Google sign-in); alpha per the audit. |
| CRDT co-editing for documents & code | Experimental | y-prosemirror / y-monaco; requires the realtime backend for cross-device. |
| Server-enforced permissions (scoped room tokens) | Experimental | Same `permissions.ts` matrix on client and server. |
| Comments (pins, areas, threads, replies, resolve, @mentions, reactions, assignment, due dates) | Beta | Area comments (click = pin, drag = rectangle). |
| Presence (avatars, cursors, per-user location) | Beta | Real across tabs; cross-device needs the backend. |
| Roles (owner/admin/editor/commenter/viewer) + preview-as-role | Beta | Matrix in one module. |
| Version history (snapshots, restore, duplicate, line diff) | Beta | Bodies ≤200 KB sync through the collab CRDT doc. |
| Activity log + notification center | Beta | Deep links that focus threads / zoom areas. |
| Anonymous read-only public share links | Planned | Server groundwork exists; tracked in the roadmap. |

## Accessibility & responsive

| Feature | Status | Notes |
|---|---|---|
| Global `:focus-visible`, aria-labels, reduced-motion | Stable | Applied across the chrome. |
| Keyboard alternative for slide geometry (numeric X/Y/W/H) | Stable | A genuine drag alternative in the slide inspector. |
| Board canvas keyboard operability | Planned | **Critical gap** — the canvas is pointer-only. Roadmap P1. |
| Status conveyed with icon + text (not color alone) | Partial | Several statuses are color-only today. Roadmap P2. |
| Responsive tiers / mobile viewer | Planned | Fixed panels starve the canvas below ~1100 px; no mobile story yet. |

## Deployment

| Feature | Status | Notes |
|---|---|---|
| Vercel deployment (Vite preset, SPA rewrites, serverless functions) | Beta | `vercel.json` + `api/*`; see [setup.md](setup.md) and [integrations.md](integrations.md). |
