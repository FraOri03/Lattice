# Lattice UX/UI Remediation Roadmap — post Phase 8

Companion to [`ux-ui-audit-phase-8.md`](./ux-ui-audit-phase-8.md). Priorities: **P0 blocking · P1 before public beta · P2 before broader adoption · P3 refinement.** Effort: XS/S/M/L/XL. IDs cross-reference the audit issue register (§20).

---

## P0 — Blocking (fix before any further expansion)

### P0.1 · Presentation-in-Board (LAT-1) — ✅ DONE in this audit
- **Rationale:** the board is the product's "universal surface," yet the deck — the most visual content type — could not be a card. It broke the core product promise and made Presentation feel bolted-on.
- **Dependencies:** none (presentation entity + generic `addCard`/CRDT node serialization already existed).
- **Expected UX benefit:** decks become first-class board citizens (compact summary, expanded slide preview + navigator, drag-in, import-as-deck, inspector, double-click to workspace); "Board holds everything" becomes true.
- **Implementation risk:** low — additive card type; no data migration; rides existing serialization/permissions/comments.
- **Effort:** L (delivered).
- **Acceptance:** deck insertable from toolbar + Quick Create + drag from sidebar; imported PPTX/ODP lands as an editable deck card; compact/expanded/navigator render; double-click opens workspace; inspector edits title/mode/opens/deletes; deleting a deck removes its cards on all boards; typecheck+build+tests green. **All met.**

> With P0.1 delivered, no other P0 remains. The next tier is P1.

---

## P1 — High priority (before public beta)

> **Status:** P1.1–P1.5 shipped in Phase 9 (issues #8–#11). See [`accessibility.md`](accessibility.md), [`collaboration.md`](collaboration.md), [`navigation.md`](navigation.md), [`performance.md`](performance.md). P1.6 (responsive tiers) remains open.

### P1.1 · Board canvas keyboard accessibility (LAT-2) — ✅ DONE (Phase 9)
- **Rationale:** the core interaction surface is mouse-only; keyboard and screen-reader users are excluded (WCAG 2.1.1 — Critical).
- **Dependencies:** none; interacts with LAT-15 (undo).
- **Benefit:** the product becomes operable without a mouse; unblocks public-release accessibility.
- **Risk:** medium — must integrate with React Flow's focus model without breaking pointer flows.
- **Effort:** L.
- **Acceptance:** Tab reaches cards (roving tabindex); arrows move a selected card; Enter opens; a keyboard-invokable "add card" menu exists; focus is always visible; DnD has a documented keyboard alternative.

### P1.2 · Propagate realtime off-state to presence/Share (LAT-3, COL-1) — ✅ DONE (Phase 9)
- **Rationale:** presence avatars and Share are always shown, implying live remote collaboration even when `VITE_REALTIME_BACKEND` is unset — the one place the product's otherwise-excellent honesty leaks.
- **Dependencies:** `hasRealtimeBackend`, `RealtimeStatusChip` state.
- **Benefit:** users understand when "collaboration" means tabs+Drive vs true realtime.
- **Risk:** low.
- **Effort:** S.
- **Acceptance:** when realtime is off, presence/Share surfaces carry a "local / Drive only" affordance; no UI implies remote realtime that isn't configured.

### P1.3 · Lazy-load three.js (LAT-4, PERF-1) — ✅ DONE (Phase 9)
- **Rationale:** ~170 kB gz of three.js sits in the 700 kB main bundle though only 3D previews/cards use it.
- **Dependencies:** 3D viewer (`ThreeDViewer`, `cards.tsx ThreeScene`).
- **Benefit:** faster first paint for the common (no-3D) case.
- **Risk:** low-medium — add a Suspense boundary + skeleton for 3D.
- **Effort:** M.
- **Acceptance:** main bundle drops ≈ 170 kB gz; 3D cards/preview load via a lazy chunk with a skeleton; no regression to 3D rendering.

### P1.4 · Board virtualization + pause off-screen animation loops (LAT-5, PERF-2, BRD-3) — ✅ DONE (Phase 9)
- **Rationale:** every card mounts; 3D cards run continuous `requestAnimationFrame`/OrbitControls loops even off-screen — this made the renderer unresponsive during the audit (screenshot timeouts on a 7-card seed board with one 3D card).
- **Dependencies:** P1.3 helps.
- **Benefit:** large/rich boards stay interactive.
- **Risk:** medium.
- **Effort:** L.
- **Acceptance:** off-screen cards pause their loops (IntersectionObserver); a 100+ card board pans/zooms without stalling; CPU idle when the board is static.

### P1.5 · Browser history / back-forward (LAT-6, NAV-1) — ✅ DONE (Phase 9)
- **Rationale:** the SPA has no router; Back exits the app instead of returning to the prior mode/entity.
- **Dependencies:** interacts with LAT-7 (Split) and deep links (NAV-6).
- **Benefit:** matches universal browser expectation; enables entity deep links.
- **Risk:** medium — map app state ↔ history without fighting existing hash-based invite handling.
- **Effort:** M.
- **Acceptance:** Back/Forward move between recently viewed modes/entities; refresh restores the current view; invite hash still works.

### P1.6 · Responsive tiers + drawer inspectors + honest blocking (LAT-12, RSP-1/2/3)
- **Rationale:** fixed-width sidebar/inspectors starve the canvas below ~1100 px; there is no mobile story (nothing blocks a phone, but Monaco/Sheet/Presentation are unusable).
- **Dependencies:** none.
- **Benefit:** usable on laptops/tablets; honest, non-broken mobile.
- **Risk:** medium.
- **Effort:** L.
- **Acceptance:** below a breakpoint, sidebar/inspector become drawers and the top nav collapses to a menu; a defined **Mobile = read-only viewer + comments** tier; unsupported editors show an honest "best on desktop" message instead of breaking.

---

## P2 — Medium priority (before broader adoption)

### P2.1 · Demote Split from mode to layout toggle (LAT-7, NAV-2, IA-1)
- Rationale: Split is a layout, not a peer mode; it confuses the "what is a mode" model. Benefit: simpler IA. Risk: low-medium (touches nav + `modeAfterOpen`). Effort: M. Acceptance: Split is a toggle on Board/Doc; opening an entity no longer implies a distinct mode.

### P2.2 · Auto-hide Workspaces for single-workspace accounts (LAT-8, IA-2)
- Rationale: Workspaces are organizational-only and add a nesting level with no access boundary for solo users. Benefit: shallower IA. Risk: low. Effort: S. Acceptance: the workspace breadcrumb/switcher only appears when ≥ 2 workspaces exist.

### P2.3 · Presenter / slideshow mode (LAT-9, PRZ-2)
- Rationale: the "Presentation" mode edits slides but cannot *present* them. Benefit: fulfills the mode's namesake job. Risk: low-medium. Effort: M. Acceptance: a full-screen present view with next/prev, speaker notes (optionally on a second screen), and Esc to exit.

### P2.4 · In-sheet co-editing notice (LAT-10, SHT-1)
- Rationale: sheet co-editing is save-granular (last-writer-wins), disclosed only in the README; presence implies live merge. Benefit: prevents silent overwrites. Risk: low. Effort: S (notice) / XL (real cell CRDT, later). Acceptance: an in-sheet banner states edits are save-level while another editor is present.

### P2.5 · Status redundancy (color + icon + text) (LAT-11, UI-1, A11Y-2)
- Rationale: sync/role/presence/realtime/minimap encode meaning by color alone (WCAG 1.4.1). Benefit: colorblind-safe, clearer. Risk: low. Effort: S. Acceptance: no status conveyed by color alone.

### P2.6 · Identity-vs-storage cue (LAT-13, CLD-3)
- Rationale: signing in with Google (identity) is not the same as connecting Drive (storage); users expect sign-in to back up. Benefit: fewer "where's my data" surprises. Risk: low. Effort: XS. Acceptance: a one-line "signed in ≠ synced — connect Drive to back up" near the Drive chip/account menu.

### P2.7 · Visible board undo/redo (LAT-15, BRD-2)
- Rationale: no visible undo for destructive board ops. Benefit: recoverability/confidence. Risk: low-medium. Effort: M. Acceptance: an undo control + Ctrl/Cmd+Z restores the last board mutation.

### P2.8 · Onboarding tour / mental-model intro (LAT-18)
- Rationale: the entities-vs-cards / local-vs-cloud / roles model is never taught. Benefit: faster time-to-value. Risk: low. Effort: M. Acceptance: a dismissible 3-step tour or an annotated starter board on first run.

### P2.9 · Admin bootstrap / first-run ownership moment (CLD-3)
- Rationale: ownership is set implicitly (`ensureOwner` on project open); there's no explicit "you're the owner" moment or production-auth first-run. Benefit: clarity for teams. Risk: low. Effort: S. Acceptance: first project creation clearly states the creator is owner and what that grants.

---

## P3 — Refinement (polish & optimization)

### P3.1 · "Decks" sidebar filter chip (LAT-14, NAV-7)
- Presentations only render under the "All" filter; add a chip so they can be filtered *to*. Effort XS. Acceptance: a filter shows decks.

### P3.2 · Standard preview-failure fallback (LAT-16, AST-2)
- Unify "can't preview + download original" across TIFF/unsupported/blank cases. Effort S. Acceptance: one consistent fallback component.

### P3.3 · Dedupe recent-kind icon maps (LAT-17, UI-4)
- `Sidebar.RECENT_KIND` and `CommandPalette.RECENT_KIND_ICON` duplicate logic. Effort XS. Acceptance: one shared map.

### P3.4 · Minimap kind colors (BRD-4)
- Encode card kind (not just section color) in the minimap. Effort S. Acceptance: kinds distinguishable in the minimap by more than one muted color.

### P3.5 · Slide-level linking (PRZ-4)
- Now that a deck card has a slide navigator, allow linking/backlinking to a specific slide. Effort M. Acceptance: `[[Deck#3]]`-style references focus a slide.

### P3.6 · Tokenize remaining hard-coded hex (UI-3)
- Replace `text-[#f24822]` / `#0d99ff` literals with tokens. Effort S. Acceptance: no raw status/accent hex in components.

### P3.7 · Browsable capability matrix (AST-3)
- Surface `formatMatrix` as a user-visible reference (what's editable/preview/preserved). Effort S. Acceptance: a "Supported formats" view.

---

## Sequencing summary

```
Now (done):     P0.1 Presentation-in-Board ✔
Sprint 1 (P1):  a11y canvas · realtime honesty · lazy three.js · board virtualization · history · responsive tiers
Sprint 2 (P2):  Split→toggle · hide Workspaces solo · presenter mode · sheet notice · status redundancy · identity cue · undo · onboarding · admin moment
Backlog (P3):   decks chip · preview fallback · dedupe maps · minimap colors · slide links · tokens · format reference
```

**Guiding principle:** protect the product's honesty ethos — every degraded/off state must remain visibly honest, and every new capability (starting with the presentation card) must be threaded through *all* surfaces (create, insert, search, recents, inspector, permissions, serialization) so nothing feels bolted on again.
