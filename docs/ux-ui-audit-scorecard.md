# Lattice UX/UI Scorecard — after Phases 1–8

Companion to [`ux-ui-audit-phase-8.md`](./ux-ui-audit-phase-8.md). Scores are 0–10, evidence-based, and explained. Verification: `✅ code` · `🖥️ browser` · `📄 doc`.

| # | Dimension | Score | Trend |
|---|---|---:|---|
| 1 | Product coherence | 7.0 | ↑ (was ~6.0 before Presentation-in-Board) |
| 2 | Information architecture | 6.5 | → |
| 3 | Navigation | 7.0 | ↑ (palette/quick-create/recents fixes) |
| 4 | Board UX | 7.5 | ↑ (presentation card) |
| 5 | Document UX | 7.5 | → |
| 6 | Spreadsheet UX | 7.0 | → |
| 7 | Presentation UX | 6.5 | ↑ (was ~5.0; board gap closed) |
| 8 | Code UX | 8.0 | → |
| 9 | Collaboration UX | 7.5 | → |
| 10 | Cloud/account UX | 7.0 | → |
| 11 | Visual consistency | 8.0 | → |
| 12 | Accessibility | 5.5 | → |
| 13 | Performance perception | 6.5 | → |
| 14 | Error handling | 7.0 | → |
| 15 | Onboarding | 6.0 | → |
| — | **Overall UX** | **7.0** | ↑ |
| — | **Overall UI** | **7.5** | → |

---

## Rationale

### 1 · Product coherence — 7.0
One token set, one `CardChrome`, one dialog/toast language, one `FileKindRegistry`, and a shared `permissions.ts` create real cohesion (`✅`). Points lost because content types weren't uniformly threaded through every surface — Presentation was a full entity/mode/import target but not a board card, Quick Create item, or palette entry (`✅ 🖥️`), the clearest "bolted-on" evidence (now remediated). Split-as-mode and Workspaces-for-solo add conceptual weight. **To reach 8.5:** demote Split to a layout toggle, auto-hide Workspaces solo, add per-entity backing chips.

### 2 · Information architecture — 6.5
The underlying model ("entities owned by projects; cards are views; cloud mirrors") is strong (`📄 ✅`), but the surface IA is 4–5 levels deep (Workspace→Project→Mode→Entity→Card), "Board" means three things, and the asset/entity duality leaks (import creates both a preserved asset and an editable sibling — `ImportService.ts:184-235`). Users can't reliably predict where a thing lives without learning. **To reach 8:** simplify nesting, unify Notes/Documents entry, teach the model.

### 3 · Navigation — 7.0
Clear 6-mode switcher (`role="tablist"`), persistent breadcrumb in every mode (`TopBar.ContextBreadcrumb`), command palette, shortcuts overlay, honest sync/realtime chips (`✅ 🖥️`). This audit added the missing Presentation to Quick Create + palette create/search and fixed sidebar recents dropping decks. Held back by no browser back/forward (SPA with no router), thin per-entity deep links, and label-shedding at narrow widths. **To reach 8:** browser history + entity deep links.

### 4 · Board UX — 7.5
The centerpiece: React Flow canvas, Figma-style sections with reparenting, minimap/zoom, presence cursors + manipulation outlines with one-authoritative-drag arbitration, comments (pins + drawn areas), universal file drop, URL-paste embeds, honest read-only, first-run empty state (`✅ 🖥️`). Now holds every content type including decks. Lost points: no keyboard operability (A11Y-1), no visible undo/redo, no node virtualization, off-screen animation loops. **To reach 9:** canvas keyboard + undo + virtualization.

### 5 · Document UX — 7.5
Tiptap CRDT co-editing, slash menu, outline, wikilinks/backlinks (digested), asset embeds, tables/tasks/callouts, DOCX/ODT/RTF in, many formats out, inline card editor (`✅`). Lost points: three competing metaphors (Notion/Word/Obsidian) with no explicit positioning; doc-range comment anchors not exact; no in-editor virtualization. **To reach 9:** pick and communicate the metaphor; exact comment anchors.

### 6 · Spreadsheet UX — 7.0
Custom virtualized grid, dependency-free formula engine with cycle guard, formula bar, sheet tabs, cell inspector, XLSX/CSV/ODS import, live cell presence, board card with lazy mini-grid (`✅`). Lost points: save-granular sync (not cell CRDT) with silent-overwrite risk surfaced only in the README; small function set; ODS export missing. **To reach 8.5:** in-sheet co-edit notice now, cell-level CRDT later, function help.

### 7 · Presentation UX — 6.5
A genuinely real v1 editor (960×540 canvas, text/image/shape, z-order, themes, notes, PDF+PPTX export, PPTX/ODP import with honest fidelity reports) (`✅ 🖥️`). This audit closed the flagship gap (board integration: card, compact/expanded, slide navigator, drag, import-as-deck, inspector, serialization, realtime/permissions). Still missing: presenter/slideshow mode (the mode can't actually *present*), master slides, templates, slide reuse. **To reach 8:** presenter mode + templates.

### 8 · Code UX — 8.0
The most complete surface: Monaco (lazy), tabs/tree, 30+ languages, y-monaco CRDT with labeled cursors, Collaborative/Checkout policy, GitHub connect+link+browse+commit(feature branch)+pull with protected default branch, env secret detection with danger re-confirm, board code card (`✅`). Lost points: minimal diff/conflict UX, no PR flow yet, Monaco a11y not surfaced. **To reach 9:** PR flow + conflict UX + a11y surfacing.

### 9 · Collaboration UX — 7.5
Server-enforced ACLs via a single shared matrix, per-role room tokens ("viewers can't write a CRDT byte"), CRDT docs/code/boards, presence/cursors/selections, comments (pins/areas/reactions/assignee/due), activity, versions with restore, read-only banners (`✅`). Lost points: the collaboration *UI* (presence/Share) doesn't visibly downgrade when realtime is off, risking a false sense of live remote collaboration (COL-1); role changes need re-open in places. **To reach 9:** propagate the realtime off-state to presence/share surfaces.

### 10 · Cloud/account UX — 7.0
Honest login (Google or explicit mock), `drive.file`-scoped sync, offline-first push/pull with newest-wins + conflict backups, clickable Drive status chip, diagnostics dialog, GitHub code sync, env-gated feature degradation (`✅ 🖥️`). Lost points: identity-vs-storage distinction under-explained; manual token-expiry recovery; no "Connections" hub; implicit admin bootstrap. **To reach 8.5:** identity/storage cue + auto-reauth + connections hub.

### 11 · Visual consistency — 8.0
Strong: one token set, theme-aware, `ActionIcons` semantic registry (fixed inverted import/export), `ToolbarDivider` grouping, one card chrome, consistent utility classes, unified kind icons (`✅`). Lost points: color-only status, top-bar density collapse, some hard-coded hex, duplicated kind maps. **To reach 9:** tokenize remaining hex, add status redundancy.

### 12 · Accessibility — 5.5
Real positives: global focus-visible, broad aria-labels, reduced-motion, role usage, slide numeric fields as a drag alternative (`✅`). But the core canvas is not keyboard-operable (Critical), status is color-dependent, target sizes dip below 24 px, live-region announcements are incomplete, and editor/grid SR names are thin. This is the score most limiting "public release." **To reach 7.5:** canvas keyboard + color redundancy + live regions.

### 13 · Performance perception — 6.5
Good perceived-perf hygiene: skeletons on every lazy chunk, throttled cursors/drags, batched CRDT commits, import progress (`✅`). But main bundle is 700 kB gz with three.js inside, Monaco is 865 kB, and there's no board virtualization — off-screen 3D animation loops made the renderer unresponsive during this audit. **To reach 8:** lazy three.js + virtualization + pause off-screen loops.

### 14 · Error handling — 7.0
The honesty ethos pays off: toasts, promise-based danger dialogs, honest sync/realtime/conversion states, Drive diagnostics, missing-entity placeholders, relink flow, conflict backups (`✅`). Lost points: some recovery affordances (retry/reauth) and a few silent recovery paths (normalize fallbacks, restore failure) that should notify. **To reach 8.5:** add retry/reauth and "recovered X" notices.

### 15 · Onboarding — 6.0
Good empty states with jump lists in every mode and a first-run board state (`✅ 🖥️`). But there's no product tour, the mental model is never taught, and the richest concepts (entities-vs-cards, local-vs-cloud, roles) are discovered by trial. **To reach 8:** a short tour + an annotated starter board + inline model hints.

### Overall UX — 7.0 / Overall UI — 7.5
A powerful, honest, cohesive platform whose UX is throttled by IA depth, canvas accessibility, and (previously) incomplete surface threading; whose UI is professional and consistent with density risks at the edges. Both trend up after this audit's coherence fixes.
