# Known limitations

An honest list of what is incomplete, degraded, or not yet built. Each limitation that
needs concrete work is tracked as a GitHub issue — see the [roadmap](../ROADMAP.md) and
the [GitHub issues](https://github.com/FraOri03/Lattice/issues). This file is the "what
isn't done" companion to [features.md](features.md).

## Project maturity

- **No public release has been cut.** No Git tags, no GitHub releases, no CI. The project's
  own UX/UI audit ([#5](https://github.com/FraOri03/Lattice/issues/5)) rates maturity as
  *late-alpha / early-beta for single-user local work; alpha for team / realtime*.
  Treat the app as **alpha / experimental**.
- **Test coverage is minimal** — one unit-test file (a board/presentation round-trip).
  Broad automated testing is roadmap work
  ([#20](https://github.com/FraOri03/Lattice/issues/20)).
- **Version strings are inconsistent** across the repo: `package.json` = `0.1.0`,
  `src/lib/env.ts` fallback = `0.6.0`, `.env.example` `VITE_APP_VERSION` = `0.8.0`. The
  effective current version is **0.8.0** (Phase 8). Reconciling these is a small cleanup.

## Accessibility

_Tracked in [#8](https://github.com/FraOri03/Lattice/issues/8)._

- **The board canvas is not keyboard-operable** (create/select/move/link are pointer-only,
  with no keyboard alternative to drag-and-drop). This is the headline accessibility gap
  (WCAG 2.1.1) and blocks public release.
- **Status is often conveyed by color alone** (sync, roles, presence, realtime, minimap) —
  needs icon + text redundancy (WCAG 1.4.1).
- Some custom color inputs / slide handles lack accessible names; a few targets dip below
  24 px; toast/status changes are not fully announced via `aria-live`.
- Preserved positives: global `:focus-visible`, broad aria-labels, `prefers-reduced-motion`,
  and the slide inspector's numeric X/Y/W/H fields as a real drag alternative.

## Performance

_Tracked in [#11](https://github.com/FraOri03/Lattice/issues/11)._

- **three.js ships in the main bundle** (~170 kB gz of the ~700 kB gz main chunk) though
  only 3D previews use it — it should be lazy-loaded.
- **No board node virtualization**; off-screen 3D cards run continuous
  `requestAnimationFrame` / `OrbitControls` loops. Large boards can become unresponsive.
- Measured production build (gzip): main **700 kB**, Monaco **865 kB** (lazy), SheetJS
  **161 kB** (lazy), jsPDF **129 kB** (lazy).

## Navigation & information architecture

_Tracked in [#10](https://github.com/FraOri03/Lattice/issues/10)._

- **No browser back/forward** — the SPA has no router; the Back button exits the app.
- ~~**"Board" is overloaded** … Split behaves like a layout but is presented as a peer
  mode.~~ **Fixed** (`LAT-7`/`NAV-2`/`IA-1`): Split is now a layout toggle in
  `workspaceLayoutStore` and Graph is a content view; neither is a section. See
  [navigation.md](navigation.md#split-is-a-layout-not-a-mode).
- **Workspaces add a nesting level** (`Workspace → Project → Mode → Entity → Card`) without
  enforcement — they should auto-hide for single-workspace accounts.
- No per-entity shareable deep link (only the `#invite=` hash).
- **The secondary pane's content is not deep-linkable.** A restored `m=split` link always
  opens the Board beside the primary pane; "editor + Graph" is transient view state.
- **Split pairs the primary section with the Board or the Graph only** — there is no
  arbitrary pane-to-pane composition, and Presentation/Photo are full-page sections where
  the Split control is disabled.
- **Vertical (stacked) split is modelled but not exposed.** `workspaceLayoutStore.direction`
  and the resizer both handle it; no UI control switches to it yet.
- **The bottom toolbar can still overlap the minimap at ≤1280 px.** Pre-existing board
  chrome behaviour, substantially reduced by the toolbar regroup (14 flat controls → 5
  grouped ones) but not eliminated.

## Board tools

- **No drawing/shape/pen tools, no Frames, no Groups, and no Dev Mode.** The board toolbar
  creates cards and sections; pan/zoom are React Flow's own controls. The toolbar is
  grouped by category (Structure · Create · Media · Annotate · More) but deliberately does
  **not** advertise tool families the product does not implement.

## Cloud, sync & collaboration

_Honesty gap tracked in [#9](https://github.com/FraOri03/Lattice/issues/9)._

- **Presence & Share imply realtime when it is off.** Without the realtime backend + Google
  sign-in, "live" means tabs of one browser + ~20s Drive polling; the chip is honest but
  the surrounding UI does not yet downgrade.
- **Sync is single-user** (multi-device for one account), timestamp-based (newest-wins with
  backups), not CRDT merges — for the Drive sync layer.
- **Deletions never propagate** to Drive by design; a remote-cleanup UI is future work
  ([#32](https://github.com/FraOri03/Lattice/issues/32)).
- **Invites are links, not e-mails** — there is no mail server.
- **Identity ≠ storage** — Google sign-in is identity; Drive `drive.file` is a separate
  storage consent. This distinction is under-explained in the UI.
- OAuth tokens live in browser storage (XSS-scoped; sign out to clear). The mock account
  never syncs anything.
- **No anonymous / public no-login share links** — sharing is role-based and
  server-enforced. The server groundwork exists; the viewer is roadmap work
  ([#25](https://github.com/FraOri03/Lattice/issues/25)).

## Editing surfaces

- **Presentation mode has no presenter/slideshow view**
  ([#15](https://github.com/FraOri03/Lattice/issues/15)) and no masters/animations; PPTX
  export is basic fidelity by design; PPTX/ODP import flattens masters/themes/animations
  (reported per file).
- **Spreadsheets** use a small function set (SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, IF,
  ROUND, ABS, SQRT; A1/`$A$1`/ranges; `#CYCLE!` guard) and body-level (save-granular) sync,
  not cell-level CRDT ([#17](https://github.com/FraOri03/Lattice/issues/17),
  [#27](https://github.com/FraOri03/Lattice/issues/27)).
- **Rich-document comments** are not anchored to exact text ranges yet
  ([#19](https://github.com/FraOri03/Lattice/issues/19)).
- **Board** has no visible undo/redo affordance
  ([#16](https://github.com/FraOri03/Lattice/issues/16)).
- ODT/RTF conversion fidelity is basic (tables/images limited); ODS export is not available.

## Storage & platform

- Vault **metadata lives in localStorage** (~5 MB budget); binaries and document bodies
  live in IndexedDB.
- **GitHub sync is text-only** (code documents); binary assets are out of scope by design.
- **No responsive / mobile story** — fixed-width panels starve the canvas below ~1100 px;
  Monaco/Sheet/Presentation are unusable on a phone. Explicit device tiers are roadmap work
  ([#14](https://github.com/FraOri03/Lattice/issues/14)).
- Web-embed favicons load from `<origin>/favicon.ico` (an external request by nature); some
  sites block framing and need the link-preview mode.

## Security notes (documented, not defects)

- Realtime auth verifies Google tokens server-side with an **audience check**; role scopes
  are minted server-side; the browser's claimed role is never trusted.
- Markdown links/images collapse `javascript:`/`data:` URLs to `#` (scheme allow-list) on
  top of HTML escaping; SVG previews render through `<img>`; web-embed iframes keep
  `sandbox` + `referrerPolicy=no-referrer` + http(s)-only URL sanitization.
- Env/credential files get heuristic secret detection on import (privacy warning + metadata
  flag); committing flagged files to GitHub requires an explicit danger re-confirmation.
