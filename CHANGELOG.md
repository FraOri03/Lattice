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

### Added

- **Lattice adapts to the window it is in.** The shell now has four tiers, and below the
  widest one it changes shape rather than overflowing. The sidebar and the inspector stop
  being docked under ~1100px and become drawers that overlay the content, each leaving an
  edge handle behind (focus moves in when one opens and back to the handle when it closes;
  Escape dismisses). The top bar folds instead of pushing itself off the screen: the
  breadcrumb has a floor and truncates rather than vanishing, the section labels come back
  only when the *bar* — not the window — is wide enough for them, and the eleven controls on
  the right leave in two groups into a `···` menu. Split is disabled below 1440px, with a
  tooltip that says why, because two panes at 1100px leave neither usable. The measured
  effect: a 1024px window went from 569px of horizontal page overflow and a 504px board
  canvas to **no overflow and a 1024px canvas**, and a 390px phone — which used to render
  1005px of content by silently zooming itself to 39% — now renders at 100%. Baseline,
  method and the tier model: [docs/responsive-audit-phase-12.md](docs/responsive-audit-phase-12.md).
- **The board inspector can be resized, collapsed and its tips shut.** It is docked in the
  same flex row as the canvas, so its fixed 280px came straight out of the working area —
  and the state it sits in most of the time (nothing selected) was seven lines of onboarding
  tips. The left edge is now a drag handle (220–520px, also operable from the keyboard as a
  `role="separator"`), the header carries a button that collapses the panel to a 36px rail
  that still names itself and offers the way back, and the tips are a disclosure that starts
  shut. Width and collapsed state persist across reloads — unlike the split pane, shutting a
  panel you find intrusive is a preference, not transient layout state.
- **Assets group themselves by board section** — the sidebar's asset library now shows a
  read-only group per board section that uses a file, above the flat list. Membership is
  read back from the board (a card's `data.assetId` plus its section `parentId`), so it can
  never drift; a file used by two sections appears under both, a file no section uses stays
  in the flat list, and manual folders still win over the automatic grouping.

### Changed

- **The three remaining inspectors (document, spreadsheet, code) behave like the board's.**
  They were still a hard-coded 280px `aside`, repeated three times, so the width, the rail
  and the way to shut the panel only existed on the Board. All four share one wrapper now,
  and one state serves them because only one section is on screen at a time.
- **The sidebar's small controls clear 24px** (WCAG 2.2 SC 2.5.8): seven 20×20 hover
  buttons, the 15px category rows and the 21px filter chips. A pointer-only nuisance before;
  below the Compact tier that panel is opened with a thumb.
- **The tab strip scrolls instead of squeezing.** It always had `overflow-x-auto`, but the
  tabs themselves never said `flex: none`, so they shrank to fit and the scroll never
  happened — a sixth open file quietly compressed the other five.
- **The displayed version is now a pinned release string: `Alpha v0.11.3.5`.** It used to
  be composed per build as `major.minor` from `package.json` plus a build number (minutes
  since 2025-01-01 UTC), which cannot express a four-part release, and the alternative pin
  (`VITE_APP_VERSION`) lives in a git-ignored `.env` so it cannot be committed. The release
  string now lives in `PINNED_VERSION` (`src/lib/version/buildStamp.ts`) and is shipped
  verbatim; clearing it (`''`) restores the automatic stamp, and `VITE_APP_VERSION` still
  overrides both. The cost of a pin is that two deploys of the same version are no longer
  distinguishable by it — the short commit sha beside the version in the account menu is
  what tells them apart. `package.json` moves to `0.11.3` so `major.minor` do not
  contradict the label, and unpinning cannot send the version backwards.
- **The tab strip is always drawn in a project**, empty session included. It used to hide
  itself until something was open, which made it invisible on the path most people take —
  Home, then a project, which lands on the Board section with nothing open — so a shipped
  feature read as a missing one. Empty it is deliberately not a `tablist` (a tab list with
  no tabs is a control a screen reader announces and then cannot enter) but a line of text
  in the same box, so nothing shifts when the first tab arrives.
- **The day ⇄ night reveal reaches the edges of the screen.** The circular wipe now leaves
  the pressed control at the control's own size rather than from a point, runs on an easing
  with a short tail, and finishes 12% past the furthest corner. The previous curve spent
  ~95% of the distance in its first third and then crept, so the circle appeared to stop
  short of the edges and the theme changed when the animation ended. The sun/moon glyph
  overshoots on the swap, which is what makes a 15px icon register as having moved.
- Reorganized project documentation: the roadmap moved from the README into GitHub Issues
  and a GitHub Project; detailed docs moved into `docs/`; the README is now a concise
  entry point. Added `ROADMAP.md`, `CONTRIBUTING.md`, this changelog, issue/PR templates,
  and light documentation CI.

### Fixed

- **The Google session was lost every few minutes.** The GIS token flow has no refresh
  token, so renewal is a `window.open` round-trip needing transient user activation, which
  background callers do not have. A failed renewal armed a "retry on the next gesture"
  listener that nothing stopped re-arming — and with Drive polling asking for a token every
  20s and the sync debounce every 10s, Google's window came back on click after click.
  Silent requests now carry the account `hint` (without it a browser holding several Google
  sessions answers with the account chooser, which is a visible sign-in prompt); failures
  back off (30s → 2m → 8m → 15m) instead of being retried by whichever background caller
  asks next; transient failures — dead network, blocked or COOP-undetectable popup, a
  round-trip Google never answered — no longer report the session as expired, so only a lost
  grant or three failures in a row escalates to "Reconnect Drive"; and a token arriving after
  its round-trip timed out is kept rather than dropped, which used to leave the app
  announcing an expired session while the browser held a valid token. Renewal is now
  scheduled ahead of expiry (re-synced on `visibilitychange`, since timers in a background
  tab are throttled) instead of being discovered by whoever hits the cliff first. Renewal
  still costs one brief Google window per token; removing it entirely needs the server-side
  authorization code flow.
- **Project calls could not start** — `POST /api/realtime/media-token` answered `500`
  (`TypeError: Cannot convert TrackSource microphone to string`). The LiveKit grant passed
  wire strings where `livekit-server-sdk` requires its numeric `TrackSource` enum, so
  signing the token threw. The capability → `TrackSource` mapping now lives in the
  endpoint, keeping the shared permission matrix dependency-free and browser-safe.

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
