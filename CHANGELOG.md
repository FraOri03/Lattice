# Changelog

All notable changes to Lattice are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

> **On versioning:** no Git tags or GitHub releases exist yet. The historical entries below
> are **reconstructed from the project's development phases**, using the phase→version
> mapping already present in the code (`src/lib/env.ts` defaults to `0.6.0` = Phase 6;
> `.env.example` sets `0.8.0` = Phase 8). Dates are the **real Git author dates** of the
> phase commits, not invented. The roadmap (future work) lives in
> [ROADMAP.md](ROADMAP.md) and [GitHub Issues](https://github.com/FraOri03/Lattice/issues).

## [Unreleased]

### Changed

- Reorganized project documentation: the roadmap moved from the README into GitHub Issues
  and a GitHub Project; detailed docs moved into `docs/`; the README is now a concise
  entry point. Added `ROADMAP.md`, `CONTRIBUTING.md`, this changelog, issue/PR templates,
  and light documentation CI.

## [0.8.0] — 2026-07-11 — Phase 8 & 8.5

### Added

- **Production realtime multiplayer** — Liveblocks + Yjs CRDT co-editing for rich
  documents (y-prosemirror), code (y-monaco) and boards (granular CRDT ops), with live
  cursors/selections and presence. Config-gated behind `VITE_REALTIME_BACKEND=liveblocks`
  + Google sign-in.
- **Server-enforced permissions** — two Vercel functions verify Google identity
  (audience-checked) and mint per-role scoped Liveblocks room tokens; the same
  `permissions.ts` matrix runs on client and server.
- **Workspaces** — a `Workspace → Project` layer with create/rename/archive and safe
  deletion (projects move to Personal).
- **Area comments** (click = pin, drag = rectangle) and **Comments 2.0** (reactions,
  assignment, due dates); a **notification center** with deep links.
- **Presentation engine v1** — real slide editor (960×540), text/shapes/images, themes,
  speaker notes; **PDF and PPTX export** (basic fidelity); **PPTX/ODP import** to editable
  decks with per-file conversion reports.
- **Presentation-in-Board (8.5)** — decks are now first-class board cards
  (`PresentationCardNode`, compact/expanded/full states, drag-and-drop, import as editable
  deck). [#7](https://github.com/FraOri03/Lattice/issues/7)
- **Completed format pipeline** — native DOCX (WordprocessingML) export; a
  `formatMatrix` single source of truth; a `ConversionBackendProvider` seam (local /
  remote / disabled); 3D asset bundles with missing-dependency diagnostics.
- **Version History 2.0** — snapshot bodies ≤200 KB sync through the collab CRDT doc.
- A `test` script (`vitest run`) and the first unit tests.

### Changed

- Toolbar icon semantics unified via `ActionIcons.tsx`; toolbar dividers group controls by
  purpose.
- `RealtimeCollaborationProvider` promoted from placeholder to production; the honest
  realtime status chip shows the exact setup checklist when unconfigured.

### Security

- Markdown renderer collapses `javascript:`/`data:` URLs in links/images (scheme
  allow-list) on top of HTML escaping.
- Env/credential-file secret detection on import (privacy warning + metadata flag);
  committing flagged files to GitHub requires explicit danger re-confirmation.
- Realtime auth verifies Google tokens server-side with an audience check; the browser's
  claimed role is never trusted.

### Known issues

- A full senior UX/UI audit (Phase 8.5) documented gaps now tracked as issues:
  canvas keyboard accessibility ([#8](https://github.com/FraOri03/Lattice/issues/8)),
  realtime honesty propagation ([#9](https://github.com/FraOri03/Lattice/issues/9)),
  navigation/IA ([#10](https://github.com/FraOri03/Lattice/issues/10)) and performance
  ([#11](https://github.com/FraOri03/Lattice/issues/11)). See
  [docs/limitations.md](docs/limitations.md).

## [0.7.0] — 2026-07-10 — Phase 7

### Added

- **Collaboration engine** — project members & roles (owner/admin/editor/commenter/
  viewer) with a single permission matrix; link-based invitations; presence (avatars,
  per-user location) real across tabs; live board collaboration (cursors, selection,
  live card/section movement); comments (pins + threads, replies, resolve/reopen,
  @mentions); activity log; version history (snapshots, restore, duplicate, line diff);
  role-based read-only with "preview as role".
- **Provider architecture** — `CollaborationProvider` transport interface with the
  Local (BroadcastChannel), Drive-polling (~20s) and Realtime (then placeholder) providers
  behind `CollabHub`; structure-aware merging (`ConflictResolverV2`).
- **Code collaboration** — soft file locks with request-control and owner/admin
  force-unlock.

### Changed

- **UX/UI audit fix pass** — global toast system + styled confirm/prompt dialogs replacing
  native `alert`/`confirm`/`prompt`; `:focus-visible` ring; broad aria-labels;
  `prefers-reduced-motion`; context breadcrumb in every mode; empty-board state; shortcuts
  overlay (Ctrl+/).

## [0.6.0] — 2026-07-09 — Phase 6

### Added

- **Projects** — create/rename/archive/delete/star, icon/color, switcher; all content
  scoped to the active project; per-project cloud folders.
- **Accounts** — personal account area, login screen, profile menu, connected-services
  status; Google sign-in (real when configured, honest local mock otherwise).
- **Google Drive cloud sync** — offline-first push/pull with newest-wins conflict handling
  (single-user, multi-device).
- **GitHub code sync** — connect (OAuth or PAT), link a repo, browse/import code files,
  commit to a feature branch, pull; default branch protected.
- **Board QOL** — Figma-like sections (frames, group-move, minimap), web embed cards
  (sandboxed iframe + link-preview fallback), the 6-mode top navigation, command palette
  (Ctrl/Cmd+K), quick create, recents, filters, sync/offline indicators.

### Fixed

- Google Drive activation in production + Drive diagnostics (hotfix).

## [0.1.0] — 2026-07-09 — Phases 1–4 (initial)

### Added

- Universal import (PDF, Office, media, 3D, code) with an asset library and previews.
- Markdown notes with `[[wikilinks]]`, backlinks and tags.
- Rich document editor (Tiptap), code workspace (Monaco), spreadsheet engine with a
  dependency-free `FormulaEngine`.
- Infinite board with cards for every entity kind; visual card linking.
- Dark/light theme; JSON project export/import.

[Unreleased]: https://github.com/FraOri03/Lattice/compare/main...HEAD
