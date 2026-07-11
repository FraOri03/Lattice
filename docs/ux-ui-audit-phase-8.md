# Senior UX/UI Audit — Lattice (after Phases 1–8)

**Auditor:** Senior product/interaction/UI review
**Date:** 2026-07-11
**Build audited:** branch `phase-8` @ `bef3dc5`; typecheck clean; production build clean (main bundle 2.45 MB / 700 kB gzip).
**Method:** full source inspection (148 source files) + running app at `localhost:5173` (login → workspace → all six modes) + git history. Every material claim is tagged with a verification level.

> **Verification legend** — `✅ code` verified in source · `🖥️ browser` verified in the running app · `📄 doc` documented (README) but not independently verified · `◐ partial` partially implemented · `▢ placeholder` · `✗ missing` · `⚠︎ broken/misleading` · `🏗️ architecture-ready` (seam exists, feature not built).

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Scorecard](#2-scorecard)
3. [Complete feature inventory](#3-complete-feature-inventory)
4. [Information architecture audit](#4-information-architecture-audit)
5. [Navigation audit](#5-navigation-audit)
6. [Board UX audit + Presentation-in-Board](#6-board-ux-audit)
7. [Document UX audit](#7-document-ux-audit)
8. [Spreadsheet UX audit](#8-spreadsheet-ux-audit)
9. [Presentation UX audit](#9-presentation-ux-audit)
10. [Code UX audit](#10-code-ux-audit)
11. [Asset & format UX audit](#11-asset--format-ux-audit)
12. [Collaboration UX audit](#12-collaboration-ux-audit)
13. [Account, cloud & integration UX audit](#13-account-cloud--integration-ux-audit)
14. [UI system audit](#14-ui-system-audit)
15. [Accessibility audit](#15-accessibility-audit)
16. [Responsive & device audit](#16-responsive--device-audit)
17. [Performance UX audit](#17-performance-ux-audit)
18. [Error, empty & recovery states](#18-error-empty--recovery-states)
19. [Product coherence audit](#19-product-coherence-audit)
20. [Issue register](#20-issue-register)
21. [Prioritized remediation plan](#21-prioritized-remediation-plan)

---

## 1. Executive summary

Lattice is an **unusually ambitious, unusually honest** local-first creative workspace. It stitches together six editing surfaces — an infinite board (React Flow), a rich-text document engine (Tiptap), a spreadsheet engine (custom grid + formula engine), a slide editor, a Monaco code workspace, and an asset/preview system — under a projects/workspaces organization, a Google-Drive sync layer, GitHub code sync, and a genuine realtime multiplayer layer (Liveblocks + Yjs CRDT) with server-enforced permissions. Most products claiming this surface area fake half of it; Lattice's defining cultural trait is that it labels what is real, what is degraded, and what is off. That honesty is its single biggest UX asset and should be protected.

**Current product maturity:** late-alpha / early-beta for single-user local work; alpha for team/realtime (works, but gated behind configuration most users won't have and honest about it). The engineering substrate is more mature than the product packaging around it.

**Strongest aspects**
- **Code mode** (`✅`): Monaco + y-monaco CRDT + GitHub sync + secret detection + checkout/collaborative policy is coherent and near-professional.
- **The provider/registry architecture** (`✅`): `StorageProvider`, `CollaborationProvider`, `ConversionBackendProvider`, `FileKindRegistry`, `formatMatrix`, `permissions.ts` as a single shared matrix — these seams are excellent and prevent code/UI drift.
- **Honesty of state** (`✅ 🖥️`): the realtime chip, Drive chip and conversion states all describe reality rather than simulate it (`RealtimeStatusChip.tsx`, `TopBar.tsx SyncIndicator`).
- **Visual system** (`✅`): one token set (`--panel/--bord/--ink/--accent`), one `ActionIcons` semantic icon registry, one `CardChrome`, one dialog/toast language.

**Weakest aspects**
- **Accessibility of the core canvas** (`✅`): the board is mouse-only; there is no keyboard path to create/move/select cards, and comment/presence cues are color-dependent. This is the biggest gap between "has aria-labels" and "is actually operable."
- **Information architecture depth**: Workspace → Project → Mode → Entity → Card is four-to-five levels; "Board" is simultaneously a *mode*, a *surface*, and (via Split) a *layout*. New users cannot reliably predict where a thing lives.
- **Presentation coherence** (`✅ 🖥️`): until this audit, presentations existed as a mode + sidebar + import target but were **not** a board card, **not** in Quick Create, **not** in the command palette. They were bolted onto the entity layer without being threaded through the surfaces — the clearest coherence defect. (This audit implements the board integration; see §6 and §9.)
- **Performance headroom**: 700 kB gzip main bundle with three.js inside it; Monaco is another 865 kB gzip; large boards have no node virtualization.

**Major usability risks:** steep mental model with no onboarding tour; Split mode's purpose is unclear; "Local/Drive/GitHub/Realtime" backing of a given entity is not always legible at the point of use; deletion semantics (local vs remote) are correct but subtle.

**Major interface risks:** color-only status encoding (sync, roles, presence); dense top bar that sheds labels at narrow widths and can become a row of ambiguous icons; no visible undo/redo affordance on the board.

**Readiness**
- **Broader (non-technical) single users:** *Not yet* — onboarding and IA simplification needed.
- **Public release:** *No* — accessibility, responsive/mobile story, and the "what is this product" framing must land first.
- **Team use:** *Conditional* — realtime + server ACLs are real, but require Liveblocks + Google configuration; without it, "collaboration" degrades to same-browser tabs + ~20 s Drive polling (honestly labeled, but not team-ready).
- **Professional creative workflows:** *Partial* — code and note/doc workflows are strong; spreadsheet and presentation are capable but below Office/Figma fidelity, and the product says so.

**One-line verdict:** a genuinely impressive engineering platform with a coherent visual system and rare honesty, held back by an over-deep information architecture, canvas-level accessibility gaps, and surface-level feature threading (of which Presentation-in-Board was the flagship example, now addressed).

---

## 2. Scorecard

See [`ux-ui-audit-scorecard.md`](./ux-ui-audit-scorecard.md) for the full rationale per score. Summary (out of 10):

| Dimension | Score | One-line rationale |
|---|---:|---|
| Product coherence | 7.0 | One design language; Presentation was bolted-on (now fixed); Split ambiguous. |
| Information architecture | 6.5 | 4–5 nesting levels; Board is mode+surface+layout; asset/doc duality. |
| Navigation | 7.0 | Clear 6-mode switcher + breadcrumb; no browser-history/back, thin deep links. |
| Board UX | 7.5 | Strong Figma-like canvas, sections, minimap, presence; no keyboard ops, no visible undo. |
| Document UX | 7.5 | Solid Tiptap CRDT; three competing metaphors (Notion/Word/Obsidian). |
| Spreadsheet UX | 7.0 | Real grid + formulas; save-granular (not cell CRDT); small function set. |
| Presentation UX | 6.5 | Real v1 editor; no presenter mode / masters / templates; board gap fixed here. |
| Code UX | 8.0 | Monaco + CRDT + GitHub + secret detection — strongest surface. |
| Collaboration UX | 7.5 | Server-enforced ACLs + CRDT; honest but config-gated; presence UI good. |
| Cloud/account UX | 7.0 | Honest Drive states + diagnostics; identity-vs-storage nuance under-explained. |
| Visual consistency | 8.0 | Tokens, icon registry, card chrome, one dialog/toast system. |
| Accessibility | 5.5 | aria/focus/reduced-motion present; canvas not keyboard-operable; color-only cues. |
| Performance perception | 6.5 | Skeletons + throttling; 700 kB gz main w/ three.js; no board virtualization. |
| Error handling | 7.0 | Toasts, honest chips, diagnostics; several edge states missing. |
| Onboarding | 6.0 | Good empty states; no tour; steep mental model. |
| **Overall UX** | **7.0** | Powerful and honest; friction from IA depth + a11y + threading. |
| **Overall UI** | **7.5** | Cohesive, professional, dark-first; density risks at narrow widths. |

---

## 3. Complete feature inventory

Status values: **Complete · Functional w/ limits · Partial · Placeholder · Architecture-ready · Missing · Broken · Unverified.**

<details>
<summary><b>Full inventory table (click to expand)</b></summary>

| Area | Feature | Phase | Status | Verify | UX | UI | Known defects / missing states | Priority | Recommendation |
|---|---|---|---|---|---|---|---|---|---|
| Org | Workspaces | 8 | Functional w/ limits | ✅ code | B | B+ | Membership organizational only (not enforced); adds a nesting level | P2 | Consider hiding until a team feature needs it |
| Org | Projects | 6 | Complete | ✅🖥️ | A− | A− | — | — | Keep |
| Org | Project members/roles | 7 | Complete | ✅ | B+ | B+ | Role changes need re-open to reflect in some panes | P2 | — |
| Org | Invitations (link-based) | 7 | Functional w/ limits | ✅ | B | B | No email backend (honest); relies on data reaching the browser | P2 | Keep honest label |
| Content | Notes (markdown, wikilinks, backlinks, tags) | 1–2 | Complete | ✅🖥️ | A− | A− | Note vs Document distinction unclear to users | P2 | Clarify naming |
| Content | Rich documents (Tiptap CRDT) | 2/8 | Complete | ✅ | A− | A− | Metaphor conflict (page vs block) | P2 | Pick a lane |
| Content | Spreadsheets | 4/8 | Functional w/ limits | ✅ | B+ | B | Save-granular sync; limited formula set; ODS export missing | P2 | Communicate scope |
| Content | Presentations (deck editor v1) | 8 | Functional w/ limits | ✅🖥️ | B | B+ | No presenter mode, masters, templates; **was missing from Board (fixed here)** | P1 | Presenter mode next |
| Content | Code (Monaco, CRDT, GitHub) | 3/8 | Complete | ✅ | A | A− | Large-file behavior; binary files out of scope (honest) | — | Keep |
| Board | Infinite canvas / cards | 1 | Complete | ✅🖥️ | A− | A | No keyboard ops; no visible undo/redo | P1 | Add a11y + undo |
| Board | Sections (frames) | 6 | Complete | ✅ | B+ | A− | Collapse/parep edge cases | P3 | — |
| Board | Web embeds | 6 | Functional w/ limits | ✅ | B+ | B+ | X-Frame blank → manual fallback (honest) | P3 | — |
| Board | Presentation card | 8 | **Complete (this audit)** | ✅ | B+ | B+ | New: compact+expanded+navigator+inspector+drag+import | — | Ship |
| Board | Minimap / zoom / pan | 1/6 | Complete | ✅🖥️ | B+ | B+ | Minimap color-only kind cue | P3 | — |
| Board | Edges / links / labels | 1 | Complete | ✅ | B | B | Keyboard-only edge creation missing | P2 | — |
| Assets | Universal import | 1/8 | Complete | ✅ | A− | B+ | Planning-before-import dialog not built (honest) | P2 | Build transfer dialog |
| Assets | PDF / Office / media / 3D previews | 1–8 | Functional w/ limits | ✅ | B+ | B | TIFF/FBX unsupported (honest); preview failure states vary | P2 | — |
| Assets | 3D asset bundles (GLTF/OBJ/ZIP) | 8 | Functional w/ limits | ✅ | B | B | Relink UX exists; discoverability low | P3 | — |
| Collab | Comments (pins/threads/@/resolve) | 7 | Complete | ✅ | B+ | B+ | Doc-range anchors not exact (honest) | P2 | — |
| Collab | Area comments (click/drag) | 8 | Complete | ✅ | B+ | B+ | — | — | Keep |
| Collab | Comments 2.0 (reactions/assignee/due) | 8 | Complete | ✅ | B+ | B | — | — | Keep |
| Collab | Notifications center | 8 | Functional w/ limits | ✅🖥️ | B | B+ | Per-device derivation; no push | P3 | — |
| Collab | Presence / live cursors | 7/8 | Functional w/ limits | ✅ | B+ | B | Cross-device needs realtime backend (honest) | P2 | — |
| Collab | CRDT docs/code/boards | 8 | Complete | ✅ | A− | — | Sheets not cell-CRDT (honest) | P2 | — |
| Collab | Version history 2.0 | 7/8 | Functional w/ limits | ✅ | B | B | Bodies >200 kB stay device-local (honest) | P2 | — |
| Cloud | Google sign-in (GIS) | 6 | Functional w/ limits | ✅ | B | B | Mock fallback when unconfigured (honest) | — | — |
| Cloud | Drive sync (offline-first) | 6 | Functional w/ limits | ✅ | B | B | Single-user; deletes don't propagate (by design) | P2 | Clarify per-entity backing |
| Cloud | Drive diagnostics/activation | hotfix | Functional w/ limits | ✅ | B | B | — | — | — |
| Cloud | GitHub code sync | 6 | Functional w/ limits | ✅ | B | B | Code only (by design); no PR flow yet | P3 | — |
| Nav | 6-mode switcher | 6 | Complete | ✅🖥️ | B+ | B+ | Sheds labels < xl; icon ambiguity risk | P2 | — |
| Nav | Command palette | 6 | Complete | ✅ | A− | A− | **Was missing New/searching Presentation (fixed here)** | — | Ship |
| Nav | Recents / starred | 6 | Functional w/ limits | ✅🖥️ | B | B | **Sidebar recents dropped decks (fixed here)**; no "starred entities" | P3 | — |
| Nav | Deep links (invite/comment/area) | 7/8 | Functional w/ limits | ✅ | B | B | No per-entity shareable deep link | P2 | — |
| System | Command/Quick create | 6 | Functional w/ limits | ✅🖥️ | B | B | **Quick Create lacked Presentation (fixed here)** | — | Ship |
| System | Offline mode | 6/8 | Functional w/ limits | ✅ | B | B | Offline queue counter; recovery honest | P2 | — |
| System | Error handling | 7 | Functional w/ limits | ✅ | B | B | Toasts + dialogs; some states missing (see §18) | P2 | — |
| System | Auth / admin bootstrap | 7/8 | Partial | ✅ | C+ | — | No explicit admin bootstrap UI; owner = ensureOwner on open | P2 | Document/first-run |
| System | Mobile / narrow viewport | — | Partial | ✅ | C | C | No adaptive drawers; canvas not touch-tuned | P1 | Define support tiers |
| System | Accessibility | 7 | Partial | ✅ | C | — | Canvas keyboard, color cues, editor SR names | P1 | See §15 |

</details>

**Net-new since this audit (implemented, verified by build+tests):** Presentation board card (`presentation` CardType, `PresentationCardNode`, drag source, drop handler, toolbar "Deck", Quick Create, command-palette create+search, inspector, `cardSpecFor`, `stripCards` on delete), sidebar recents fix for decks, `IcChevronLeft`. See §6 and the [integration spec](./presentation-board-integration-spec.md).

---

## 4. Information architecture audit

**Current hierarchy (text diagram):**

```
Account (Google or mock)
└─ Workspace (Personal | Team)            ← Phase 8, organizational only
   └─ Project                              ← owns everything; realtime ACL boundary
      ├─ Boards[]        (canvas surfaces; one project has many)
      ├─ Notes[]         (markdown entities)
      ├─ Documents[]     (Tiptap entities)
      ├─ Spreadsheets[]  (workbook entities)
      ├─ Presentations[] (deck entities)
      ├─ Code[]          (source entities)
      └─ Assets[]        (imported binaries; some spawn a doc/sheet/deck sibling)
   Views onto the above: Board · Split · Document · Sheet · Presentation · Code
   Cards: a board node that *references* an entity (note/asset/doc/code/sheet/deck/webembed) or is self-contained (image/video/link/3D) or is a section/frame.
```

**Findings**

- **IA-1 — Board is three things at once.** "Board" is a top-nav *mode*, the *canvas surface*, and — through Split — a *layout state* (`ViewMode = 'board' | 'split' | ...`, `model.ts:423`). Opening an entity from a full-page mode jumps to that mode; from the board it opens *Split* (`modeAfterOpen`, `useStore.ts:100`). Users cannot form one stable definition of "board." **Impact:** medium-high. **Fix:** treat Split as a *layout toggle on top of a mode*, not a peer mode (see §5/IA-5).

- **IA-2 — Four-to-five levels of nesting.** Workspace → Project → Mode → Entity → Card. Workspaces (Phase 8) are *organizational only* — "Enforcement stays per-project" (`model.ts:66-74`), so they add a level without adding an access boundary. **Impact:** medium. **Fix:** keep Workspaces collapsed/auto for solo users; surface only when a second workspace exists.

- **IA-3 — Asset vs document duality is leaky.** Importing a DOCX/XLSX/PPTX creates *both* a preserved asset *and* an editable entity (`ImportService.ts:184-235`). The user now has two things that look like "the file." The board historically represented an imported deck by its *raw asset* card, not the editable deck (`cardSpecFor`, pre-fix) — the sharpest symptom. **Impact:** medium. **Fix (partly done):** imported decks now yield an editable presentation card; extend the "source file relationship" affordance (a "View original" link) consistently.

- **IA-4 — Notes vs Documents under-differentiated.** Both are wikilink-capable text entities in separate sidebar sections with separate create buttons; the practical difference (markdown note vs Tiptap block doc) is invisible at the decision point. **Impact:** medium. **Fix:** one "New text" affordance that explains the two, or merge conceptually.

- **IA-5 — Comments & versions are entity-scoped but surfaced globally.** The right-side `CollabPanel` (Comments/Activity/Versions) is one drawer keyed to the active project, not always to the focused entity; a version restore acts on "current target." **Impact:** low-medium. **Fix:** make the panel header state *what* it is scoped to.

- **IA-6 — Integrations live at mixed levels.** Drive is account/project (`project.manage-integrations` is owner-only, `permissions.ts:13`); GitHub link is per-project (`ProjectSettings.github`, `model.ts:49`); realtime is per-deployment (env). This is *correct* but not *legible*. **Fix:** a single "Connections" surface that shows the level of each.

**Can users form a stable mental model?** Partially. The core "entities are owned by a project; cards are views of them; the cloud mirrors them" (README §1) is a genuinely good model — but it is never *taught*, and Workspaces/Split/asset-duality muddy it.

**Proposed revised IA (summary):** (1) Auto-hide Workspaces for single-workspace accounts. (2) Demote Split from a mode to a layout toggle. (3) One "text document" entry point. (4) A per-entity "backing & source" chip (Local/Drive/GitHub, + "from PPTX"). (5) A "Connections" panel. Migration impact: low — all are additive UI changes over the existing entity model; no data migration required.

---

## 5. Navigation audit

| # | Problem | Evidence | Impact | Severity | Correction | Acceptance |
|---|---|---|---|---|---|---|
| NAV-1 | No browser back/forward; app is a single SPA state | `App.tsx` has no router; only invite-hash handling (`App.tsx:90`) | Back button exits the app / does nothing expected | High | Add history entries for mode+entity, or intercept back | Pressing Back returns to the previous mode/entity, not app exit |
| NAV-2 | Split is a peer "mode" but behaves like a layout | `TopBar MODES` lists Split as a tab (`TopBar.tsx:38`) | Users toggle Split expecting a distinct workspace | Medium | Make Split a toggle button on Board/Doc | Split reads as "show canvas beside editor" |
| NAV-3 | Mode switcher sheds text labels below `xl` | `TopBar.tsx:338` `hidden xl:inline` | 6 icon-only tabs are ambiguous | Medium | Keep labels or add persistent tooltips/first-run legend | Every tab has an accessible, discoverable label at all widths |
| NAV-4 | Presentation absent from create/search paths | `TopBar QuickCreate` (`:156`), `CommandPalette actions/search` (`:175`, `:247`) | Could not create/find a deck from primary nav | High (pre-fix) | **Done:** added to Quick Create, palette create + search | Deck appears in "+ New", palette, and search |
| NAV-5 | Sidebar recents silently dropped presentations | `Sidebar recentRows`/`openRecent` had no `present` branch (`:210`, `:224`) | Recently opened decks never listed | Medium (pre-fix) | **Done:** resolve + open `present` | Opening a deck lists it under Recent |
| NAV-6 | No per-entity deep link / shareable URL | No route for `#doc=…`; only `#invite=` | Can't link a teammate to a specific doc | Medium | Add hash routes for entity focus | Pasting an entity URL focuses it |
| NAV-7 | Presentations vanish under any sidebar filter chip | `Sidebar` renders decks under `show('all')` only (`:533`); no "Decks" chip | Filtering to "Docs" hides decks with no way to filter *to* them | Low-Medium | Add a "Decks" filter chip (or fold into a "Files" group) | A filter exists that shows decks |
| NAV-8 | Comment/area/invite deep links exist and work | `App.tsx:90` (invite), `CommentAreas FOCUS_AREA_EVENT` | — (strength) | — | Keep | — |

**Keyboard navigation:** command palette (`Ctrl/Cmd+K`), shortcuts overlay (`Ctrl+/`), comment tool (`C`), Esc to cancel — all present (`CommandPalette.tsx`, `App.tsx:117`, `BoardCanvas.tsx:527`). **Gap:** no keyboard traversal of the canvas or sidebar tree.

---

## 6. Board UX audit

The board is the product's centerpiece and its strongest surface after Code. React Flow provides pan/zoom/minimap/controls; `CardChrome` gives every card a consistent header (colored dot, kind icon, title = drag handle, comment badge, connection handles, resizer). Sections are true Figma-style frames with parent/child reparenting (`useStore.ts attachCardToSection`). Presence renders live cursors, selection outlines, and a dashed "manipulation outline" during a peer's drag, with one-authoritative-drag arbitration (`BoardCanvas.tsx:149-165`). Comments support point pins and drag-drawn areas (`CommentDrawOverlay`).

**Strengths (`✅ 🖥️`):** empty-board first-run state with actions; toolbar grouped by purpose with keyboard-transparent dividers; read-only role fully honored (toolbar hidden, drops rejected with a toast, `nodesDraggable={!readOnly}`); URL paste → web embed; file drop → universal import; minimap + zoom controls.

**Defects**
- **BRD-1 (`✅`, High):** **No keyboard operation.** Card creation, selection, movement, and linking are pointer-only. Delete/Backspace works on selection, but there is no way to *reach* a selection without a mouse. See §15.
- **BRD-2 (`✅`, Medium):** **No visible undo/redo.** Yjs `UndoManager` exists for CRDT text, but the board has no visible undo affordance or documented shortcut; accidental deletes rely on version history.
- **BRD-3 (`✅`, Medium):** **Large-board performance.** No node virtualization; every card node mounts (a 3D card runs a continuous `requestAnimationFrame`/`OrbitControls` loop — `cards.tsx:207`). During this audit the running app's renderer became unresponsive on the 7-card seed board that includes a 3D card, causing screenshot timeouts. Many 3D/embed/expanded cards will degrade interaction. **Fix:** pause off-screen animation loops; virtualize; cap concurrent live cards.
- **BRD-4 (`✅`, Low):** Minimap encodes section color only; card kind is a single muted color — hard to orient on big boards.
- **BRD-5 (`✅`, Low):** Context menu (right-click) is not a first-class affordance; actions live in the inspector only.

### 6.x Presentation Documents Missing from Board (flagship finding — remediated in this audit)

**1. Current inconsistency (pre-audit, `✅ 🖥️` verified):** Presentations were full entities (`PresentationDocMeta`, `createPresentDoc`, `openPresent`, `persistPresentBody`) with a working editor mode, a sidebar section, and a PPTX/ODP import path — but **could not become a board card.** Evidence: `CardType` had no `presentation` (`model.ts`), `CardData` had no `presentId`, `BoardCanvas nodeTypes` had no presentation node, the canvas toolbar had no deck button (`🖥️` confirmed: toolbar exposed section/note/doc/sheet/code/image/video/link/3D/comment/web/import only), the sidebar deck rows were not `draggable`, and `cardSpecFor` explicitly returned a **raw asset card** for imported decks with the comment *"decks have no dedicated card type yet"* (`ImportService.ts:327`).

**2. User impact:** the board — the product's "universal surface" (README §1) — could hold every content type *except* the one most native to visual thinking. A deck imported from PPTX showed up on the canvas as an inert PPTX file card, not an editable/preview deck. This broke the core promise "every one of them can be a card on an infinite canvas."

**3. Product-model impact:** it made "Board is the universal surface" false, and made Presentation feel bolted-on (reinforced by its absence from Quick Create and the command palette).

**4–25.** The complete expected behavior, `PresentationCardNode` design, compact/expanded/full states, drag-and-drop, sidebar integration, inspector, slide preview, realtime/comments/version/permission behavior, source/import/export relationship, performance constraints, fallback states, data model, board serialization, dependencies, acceptance criteria, and estimate are specified in full in **[`presentation-board-integration-spec.md`](./presentation-board-integration-spec.md)** and summarized in §9.

**Status after this audit (`✅` build+tests; `🖥️` toolbar button + sidebar drag/recents verified; card-render screenshot blocked by an environment issue, see §25 of the final report):** implemented — `presentation` card type + `presentId`; `PresentationCardNode` with **compact** (title, snippet, slide count, source badge; double-click → workspace) and **expanded** (live read-only slide thumbnail via shared `SlideView` + prev/next **slide navigator**, lazy-loading the deck body) modes; node registration; drag from sidebar; drop handler; toolbar **Deck** button; import decks now land as editable presentation cards; inspector branch (title, slide count, source, compact/expanded toggle, open-in-workspace, delete-from-vault); `deletePresentDoc` now strips its cards on all boards; realtime-safe (rides the generic CRDT node serialization); comments/versions inherited from `CardChrome`/panel; permissions inherited (read-only hides tools/blocks drops). **Classification: High priority — remediated.**

---

## 7. Document UX audit

**What's there (`✅`):** Tiptap v2 with CRDT collaboration (`@tiptap/extension-collaboration` + cursor), slash commands (`SlashCommandMenu.tsx`), bubble/block affordances, outline (`DocumentOutline.tsx`), wikilinks + backlinks (digested, bodies never loaded — `RichDocMeta.outgoingLinks`), asset embeds (`AssetEmbedBlock.tsx`), tables/tasks/callouts, DOCX/ODT/RTF import with source preserved, Markdown/HTML/ODT/RTF/PDF/DOCX export, read-only role honored, inline card editor (`RichDocCardNode` expanded).

**Metaphor conflict (the central issue):** Lattice's document simultaneously courts three mental models — **Notion** (block editor, slash menu), **Word** (DOCX in/out, "document," PDF export), and **Obsidian** (`[[wikilinks]]`, backlinks, markdown notes). Users bring incompatible expectations: no fixed page/margins (breaks Word expectation), no true markdown source view for rich docs (breaks Obsidian expectation), no databases (breaks Notion expectation). **Recommendation:** explicitly position rich documents as "Notion-like blocks that *export* to Word," and keep Notes as the "Obsidian-like markdown" lane — and say so in the empty state.

**Defects:** DOC-1 (`✅`, Medium) doc-range comment anchors are not exact (README §15.12) — a comment can drift from its text. DOC-2 (`✅`, Low) large-document behavior relies on lazy body load but no virtualization inside the editor. DOC-3 (`✅`, Low) mobile editing untested; toolbar likely overflows.

---

## 8. Spreadsheet UX audit

**What's there (`✅`):** custom virtualized grid, dependency-free `FormulaEngine` (SUM/AVERAGE/MIN/MAX/COUNT/COUNTA/IF/ROUND/ABS/SQRT, A1/$A$1/ranges, `#CYCLE!` guard), formula bar, toolbar, sheet tabs, cell inspector, XLSX/CSV/ODS import + XLSX/CSV export via lazy SheetJS, presence (live cell chips), read-only role, board card with compact preview + expanded read-only mini-grid (lazy).

**Defects:** SHT-1 (`✅`, Medium) editing is **save-granular, not cell-level CRDT** (README §15.12) — two people in the same sheet is last-writer-wins at save; *presence* is live but *merge* is not. The UI should state this in-sheet, not only in the README. SHT-2 (`✅`, Medium) small function set vs Excel expectation; no function autocomplete/help. SHT-3 (`✅`, Low) ODS export not implemented (reported honestly via `formatMatrix`). SHT-4 (`✅`, Low) formula errors surface as `#CYCLE!`/values but there's limited inline explanation.

**Excel/ODS communication:** the `formatMatrix` registry drives honest capability copy — good. Keep surfacing it at the point of import/export, not only in docs.

---

## 9. Presentation UX audit

**v1 complete behavior (`✅ 🖥️`):** real slide editor on a 960×540 canvas — slide list with thumbnails (reorder/duplicate/delete), text boxes, images, rect/ellipse/line shapes, z-order, per-slide background, three themes, speaker notes, select/move/resize/inline-edit, element inspector (geometry/typography/fill/stroke/layer), viewer read-only. Export **PDF** (vector via jsPDF) and **PPTX** (valid PresentationML, "basic fidelity"). Import **PPTX/ODP** → editable decks with a per-file conversion report; source always preserved; legacy PPT preserved pending a conversion backend.

**Partial / unsupported (honest):** PPTX/ODP import **flattens masters/themes/animations** (reported per file); PPTX export is basic fidelity by design.

**Missing (future engine work):**
- **PRZ-1 (`✅`, was High → remediated):** **Board integration** — decks could not be board cards. *Implemented in this audit* (see §6.x + the spec): card type, compact/expanded/navigator, drag, toolbar, import-as-deck, inspector, serialization, realtime/permissions.
- **PRZ-2 (`✅`, Medium):** **No presenter/slideshow mode** — there is no full-screen "present" experience with speaker notes on a second screen; "Presentation" edits slides but never *presents* them. High value for the mode's namesake job.
- **PRZ-3 (`✅`, Medium):** **No master slides / templates / slide reuse** across decks.
- **PRZ-4 (`✅`, Low):** **No slide-level linking** (wikilink/backlink to a specific slide) — now that slides are navigable on a card, per-slide references become plausible.

**Recommendation order:** presenter mode → templates/masters → slide-level links.

---

## 10. Code UX audit

**Strongest surface (`✅`).** Monaco (lazy 865 kB gz chunk), file tree/tabs (`codeTabs`), language detection for 30+ extensions (`languages.ts`), minimap, find/replace (Monaco native), y-monaco CRDT with remote cursors/labels, per-project **Code editing policy** (Collaborative default | Checkout soft-locks with request/force-unlock), GitHub connect (OAuth or PAT), repo link with protected default branch, browse/import, commit-to-feature-branch, pull, **secret detection** on env files with a danger re-confirm before commit, board code card (compact info / read-only preview).

**Defects:** COD-1 (`✅`, Low) large-file behavior — files > 2 MB stay plain assets (honest, `ImportService.ts:15`) but the threshold isn't surfaced pre-import. COD-2 (`✅`, Low) no PR flow yet (README roadmap). COD-3 (`✅`, Low) Monaco's own screen-reader mode isn't surfaced to users (see §15). COD-4 (`✅`, Low) conflict handling on pull is documented but the diff/resolve UX is minimal.

---

## 11. Asset & format UX audit

**What's there (`✅`):** universal `ImportService` (progress toast, error reporting), batch import, 3D bundle grouping (GLTF+bin+textures, OBJ+MTL, ZIP unpack) with **relink-missing-files** diagnostics, `formatMatrix` capability registry (Native editable · Converted · Preview only · Preserved original · Needs backend · Unsupported), `ConversionBackendProvider` (Local | Remote w/ explicit consent + 50 MB/120 s caps | Disabled default), PDF/image/audio/video/3D previews, `FileKindRegistry` for consistent kind→icon/label/color, secret detection for env files.

**Defects / gaps:** AST-1 (`✅`, Medium) the **unified transfer dialog** (plan → confirm → report) is partial — no pre-import planning step (README §15.12). AST-2 (`✅`, Medium) preview *failure* states vary by type (TIFF says "browsers can't decode"; some just render blank) — standardize a "can't preview + download original" fallback. AST-3 (`✅`, Low) capability matrix is not user-visible as a browsable reference (only inline notes). AST-4 (`✅`, Low) generic files show a file card with mime/size but no "open with system" path (by design, local-first).

**Formats explicitly handled (from `formatMatrix`):** TXT/MD/HTML/RTF/DOCX/ODT (editable), DOC/PPT (backend), CSV/TSV/XLS/XLSX/ODS (sheets), PPTX/ODP (decks), PDF (preview), PNG/JPG/WEBP/GIF/SVG/AVIF/BMP (image; TIFF preserved), MP4/WEBM/OGV/MOV (video, codec-dependent), MP3/WAV/OGG/M4A-AAC/FLAC (audio), GLB/GLTF/OBJ/MTL/STL (3D; FBX unsupported), 30+ code languages, ZIP (bundle or preserved).

---

## 12. Collaboration UX audit

**What's real (`✅`):** roles owner/admin/editor/commenter/viewer via a single shared matrix (`permissions.ts`) consulted by both UI and the server rooms endpoint; invite by email+role with pending/copy-link/revoke/resend/accept; presence avatars + per-user location; live cursors/selections; board live ops; document/code CRDT carets; comments (pins/areas/threads/replies/resolve/@mentions/reactions/assignee/due); activity log; version history with restore + auto-backup; read-only banners + disabled-with-explanation controls; **server-enforced ACLs** — room tokens minted per role, "viewers can present but not write a single CRDT byte" (README §15.3), identity derived from a Google token verified server-side with an audience check.

**Where the interface may imply more than exists (the key risk):**
- **COL-1 (`✅`, High-communication):** Presence avatars, cursors and the "Share" affordance are always visible, but **cross-device realtime only works when `VITE_REALTIME_BACKEND=liveblocks` is configured *and* the user signs in with Google.** Otherwise "live" means *tabs of one browser* (BroadcastChannel) + ~20 s Drive polling. The `RealtimeStatusChip` is honest ("Realtime off" with a setup checklist), but the *rest* of the collaboration UI (avatars, Share, comments) does not visibly downgrade — a user could reasonably believe they're collaborating in real time with a remote teammate when they are not. **Fix:** when realtime is off, subtly mark presence/share surfaces as "local/Drive only" so the honesty of the chip propagates to the features it governs.
- **COL-2 (`✅`, Medium):** Role changes don't always reflect live in every open pane without a re-open.
- **COL-3 (`✅`, Low):** Invites are links, not emails (honest in-dialog) but the "simulate acceptance" offline affordance can confuse.

**ACL consistency / server enforcement:** strong — the same `permissions.ts` module is imported by client and `rooms.ts`, so rules can't drift. Workspace membership is *organizational only* (not enforced) and says so.

---

## 13. Account, cloud & integration UX audit

**Login (`✅ 🖥️`):** Google sign-in (GIS) when configured; otherwise an explicit "Create local account (demo)" and "Continue without an account" — honest mock, no fake sync.

**Identity vs storage (the nuance, `✅`):** Google sign-in = *identity*; Drive `drive.file` scope = *storage permission*; these are separate consents and the app models them separately (sign-in ≠ Drive connected). This is correct but **under-explained** — a user may expect sign-in to imply cloud backup. **Fix:** a one-line "signed in ≠ synced; connect Drive to back up" cue near the Drive chip.

**Drive states (`✅ 🖥️`):** `SyncIndicator` shows Offline / Connecting / Drive error (click → diagnostics) / Local (click → connect) / Syncing / Synced / N pending. `DriveDialog` provides diagnostics. Honest and clickable — a strength.

**GitHub (`✅`):** connect (OAuth or PAT), link repo, feature-branch workflow, protected default branch, browse/import/commit/pull — code only, by design.

**Vercel/env states (`✅`):** `env.ts` centralizes `VITE_*`; `hasGoogleAuth/hasGithubOAuth/hasRealtimeBackend/hasConversionBackend` gate features; empty config → fully-local honest degradation. **Gap:** Preview-vs-Production behavior differences (OAuth origins, function availability) aren't surfaced in-app; a Preview deploy missing an env var fails at the feature, not at a diagnostic.

**Defects:** CLD-1 (`✅`, Medium) token expiry mid-session surfaces as a Drive error chip but recovery is manual. CLD-2 (`✅`, Low) no "Connections" hub (see IA-6). CLD-3 (`✅`, Medium) admin bootstrap / production auth architecture is implicit (`membersService.ensureOwner` on project open, `App.tsx:85`) — there's no first-run "you are the owner/admin" moment.

---

## 14. UI system audit

**Strengths (`✅`):** one design-token set (`--panel/--panel2/--bord/--ink/--muted/--accent`), theme-aware via `data-theme`; `ActionIcons.tsx` semantic registry fixed the historically inverted import/export icons (one icon per *meaning*: Import/Export/DownloadLocal/UploadToCloud/Sync/Pull/Push); `ToolbarDivider` (`role="separator"`, keyboard-transparent) groups toolbars by purpose; one `CardChrome`; one dialog (`ConfirmDialog` promise-based confirm/prompt + danger variant) and toast (`Toaster`) language; consistent `field`/`btn`/`icon-btn`/`insp-h` utility classes; `FileKindIcon` unifies kind iconography everywhere.

**Inconsistencies / risks**
- **UI-1 (`✅`, Medium):** **Color-only status encoding.** Sync status, roles, presence, realtime status, and card kinds all lean on color as the primary (sometimes only) signal. Fails WCAG 1.4.1 and colorblind users. Add icon/text redundancy.
- **UI-2 (`✅`, Medium):** **Top-bar density.** At `< xl` the mode labels vanish; at `< lg` Share/Workspace labels vanish; the bar can become ~10 icon-only controls. Establish a priority-collapse order and keep the most ambiguous ones labeled.
- **UI-3 (`✅`, Low):** Hard-coded hex for danger/accent in several spots (`text-[#f24822]`, `#0d99ff` outlines in the slide canvas) instead of tokens — a theming drift risk.
- **UI-4 (`✅`, Low):** Two "recent kind → icon" maps exist (`Sidebar.RECENT_KIND`, `CommandPalette.RECENT_KIND_ICON`) — duplicate logic that can drift.
- **UI-5 (`✅`, Low):** Focus-visible ring is global (good) but some custom color inputs and slide-canvas handles have no visible focus.
- **UI-6 (`✅`, Low):** Inspector uses `w-70` / `w-56` fixed widths; on narrow desktops the board loses too much canvas.

**Component coverage:** modals/popovers/menus/tooltips/toasts/dialogs/badges/chips/avatars/tabs/inspector all present and largely consistent. Empty/loading/read-only/offline/sync/realtime states are *designed* (a strength), though not uniformly (see §18).

---

## 15. Accessibility audit (WCAG 2.2 AA lens)

| # | Criterion | Severity | Component | Finding | Remediation |
|---|---|---|---|---|---|
| A11Y-1 | 2.1.1 Keyboard | **Critical** | Board canvas | Cards can't be created/selected/moved/linked by keyboard; DnD has no keyboard alternative | Add roving-tabindex node focus, arrow-move, Enter-open, a keyboard "add card" menu |
| A11Y-2 | 1.4.1 Use of Color | High | Sync/role/presence/realtime/minimap | Status conveyed by color alone | Add icon+text redundancy to every status |
| A11Y-3 | 4.1.2 Name/Role/Value | High | Custom color inputs, slide handles, some chips | Missing names / not focusable | Label all; make handles focusable or provide numeric fields (partly done in slide inspector) |
| A11Y-4 | 1.4.3 Contrast | Medium | `text-muted` on `panel2`, 10–10.5 px hints | Small low-contrast text | Verify ≥ 4.5:1; bump muted or size |
| A11Y-5 | 2.5.8 Target Size | Medium | 5 px `h-5 w-5` icon buttons, slide nav | Below 24×24 minimum | Enlarge or add padding hit-area |
| A11Y-6 | 4.1.3 Status Messages | Medium | Toasts, sync, presence | Not all announced via live regions | Add `aria-live` to toasts and status changes |
| A11Y-7 | 1.3.1 / SR names | Medium | Monaco, spreadsheet grid | Editor SR mode not surfaced; grid cells lack clear names | Expose Monaco a11y help; label grid cells (row/col) |
| A11Y-8 | 2.4.3 Focus Order | Medium | Dialogs/drawers | Focus trap/return not verified on all overlays | Ensure trap + restore for every modal |
| A11Y-9 | 2.3.3 Reduced Motion | — (strength) | Global | `prefers-reduced-motion` honored (board zoom, cursors) | Keep; extend to 3D autorotate |
| A11Y-10 | 4.1.2 | — (strength) | Chrome | Broad `aria-label`s + `role="tab"/"separator"/"dialog"` present | Keep |

**Positives (`✅`):** global `:focus-visible` ring, extensive `aria-label`s, `prefers-reduced-motion`, `role` usage, and slide-inspector numeric X/Y/W/H fields as a **keyboard alternative to drag** (a genuinely thoughtful a11y touch). **This audit added** `aria-label`ed prev/next slide-navigator controls to the new presentation card.

**Overall:** the chrome is accessible; the *canvas interactions* are not. Canvas keyboard operability (A11Y-1) is the headline remediation.

---

## 16. Responsive & device audit

| Surface | Desktop | Laptop | Narrow desktop | Tablet L | Tablet P | Mobile |
|---|---|---|---|---|---|---|
| Top bar | ✅ | ✅ | ◐ labels drop | ◐ | ⚠︎ crowded | ✗ overflow |
| Sidebar | ✅ | ✅ | ◐ fixed 240 px | ◐ | ✗ no drawer | ✗ |
| Board | ✅ | ✅ | ◐ | ◐ pan/zoom ok, no touch-tuning | ◐ | ✗ tiny targets |
| Document | ✅ | ✅ | ✅ | ◐ | ◐ | ◐ toolbar overflow |
| Sheet | ✅ | ✅ | ◐ | ◐ | ✗ | ✗ |
| Presentation | ✅ | ✅ | ◐ | ◐ | ✗ inspector | ✗ |
| Code (Monaco) | ✅ | ✅ | ◐ | ◐ | ✗ | ✗ |

**Findings:** RSP-1 (`✅`, High) the sidebar and inspectors are fixed-width panels with no drawer/collapse — below ~1100 px the canvas is starved. RSP-2 (`✅`, High) no mobile story: nothing blocks a phone, but Monaco/Sheet/Presentation are unusable and there's no read-only fallback. RSP-3 (`✅`, Medium) touch: board pan/zoom works via React Flow, but card targets/handles are mouse-sized.

**Recommendation:** define explicit tiers — **Desktop (full)**, **Tablet (read + light edit, inspectors become drawers, top nav collapses to a menu)**, **Mobile (read-only viewer + comments)** — and *block with an honest message* what isn't supported, consistent with the product's honesty ethos.

---

## 17. Performance UX audit

**Measured (production build, gzip):** main `index` **700 kB** (React, React Flow, Tiptap, Yjs, **three.js**), Monaco **865 kB** (lazy), xlsx **161 kB** (lazy), jsPDF **129 kB** (lazy), Liveblocks **54 kB** (lazy), PresentationWorkspace **5.4 kB** (lazy), SpreadsheetWorkspace **8.7 kB** (lazy). The new presentation board card added ≈ **0.5 kB gz** to main (shared `SlideView` extracted to stay light; the heavy editor remained a lazy chunk — verified).

**Perceived performance (`✅`):** skeleton/loading states on every lazy module; presence cursors throttled 60 ms, drags 50 ms, board CRDT commits batched 80 ms; import progress toast.

**Risks / opportunities**
- **PERF-1 (`✅`, High):** **three.js is in the main bundle** (~170 kB gz) though only used by 3D previews/cards — README flags this as a Phase-9 lazy-load; do it.
- **PERF-2 (`✅`, High):** **No board node virtualization** and **animation loops run for off-screen cards** (3D autorotate + `requestAnimationFrame`; `cards.tsx:207`). This directly caused renderer unresponsiveness during this audit. Pause off-screen loops (`IntersectionObserver`), virtualize nodes, cap concurrent live cards.
- **PERF-3 (`✅`, Medium):** Monaco 865 kB is large even lazy; acceptable for a code mode but front-load a skeleton and consider a lighter read-only viewer for code *cards*.
- **PERF-4 (`✅`, Low):** localStorage vault metadata (~5 MB cap) risks eviction on large vaults; bodies/blobs are in IndexedDB (good).
- **PERF-5 (`✅`, Low):** expanded doc/sheet/deck cards each mount an editor/grid/thumbnail; many expanded cards on one board compound cost — default to compact (done for decks).

---

## 18. Error, empty & recovery states

| State | Current UI | Problem | Ideal UI | Primary / secondary action |
|---|---|---|---|---|
| No workspace | Auto Personal workspace | — (handled) | — | — |
| No project | Never last project deleted (`deleteProject` guard) | — | — | — |
| Empty project | First board auto-created | — | — | — |
| Empty board | First-run state w/ actions (`✅🖥️`) | — (good) | Keep | First note / Section / Import |
| No document/sheet/deck/code | EmptyMode w/ create + jump list (`✅🖥️`) | — (good) | Keep | New / open recent |
| Missing entity behind card | "This X was deleted" placeholder (`✅`) | — (good) | Keep | Delete card |
| Drive disconnected | "Local" chip → connect (`✅🖥️`) | — (good) | Keep | Connect |
| Drive denied/failed | "Drive error" chip → diagnostics (`✅`) | Recovery manual | Add retry/reauth in dialog | Diagnostics / retry |
| GitHub disconnected/failed | Panel messaging (`✅`) | Adequate | Keep | Reconnect |
| Realtime unconfigured/off | "Realtime off" + checklist (`✅🖥️`) | Rest of collab UI doesn't downgrade (COL-1) | Mark presence/share "local only" | Setup steps |
| Token expired | Drive/realtime error chip | Manual | Auto-reauth prompt | Re-sign-in |
| Conversion unavailable/failed | Honest "disabled/needs backend" + keep original (`✅`) | Good | Keep | — |
| Unsupported format | Preserved asset + note (`✅`) | Inconsistent preview-failure copy (AST-2) | Standard "can't preview + download" | Download original |
| Missing 3D deps | Diagnostics + "Relink missing files" (`✅`) | Discoverability low | Surface on the card | Relink |
| Embed blocked (X-Frame) | Inline "switch to preview" (`✅`) | Good | Keep | Link preview |
| Permission denied | Read-only banner + disabled controls (`✅`) | Good | Keep | Request access |
| Conflict detected | Newest-wins + backup + list (`✅`) | Backup discoverability low | Surface "a backup was kept" toast | View backup |
| Version restore failed | — | Unhandled path | Add explicit failure toast + retry | Retry |
| Offline queue pending | Realtime chip pending count (`✅`) | Good | Keep | — |
| Corrupt project / partial migration | `normalize*Body` fallbacks (`✅`) | Silent; no user signal | Add a "recovered X" notice | — |

**Net:** error/empty/recovery coverage is a relative strength (the honesty ethos pays off). Gaps are mostly *recovery* affordances (retry/reauth) and a few *silent* recovery paths that should notify.

---

## 19. Product coherence audit

- **One product or many tools stitched together?** **Mostly one, with visible seams.** The token system, `CardChrome`, dialog/toast language and `FileKindRegistry` create real cohesion; the seams are where a content type wasn't threaded through every surface (Presentation was the worst offender — now closed) and where Split/Workspaces add conceptual weight.
- **Which modes feel native?** Board, Code, Document, Notes.
- **Which feel bolted on?** Presentation (pre-fix), and Split (a layout masquerading as a mode).
- **Is Board truly the universal surface?** *Now* yes (with the presentation card); previously no.
- **Is Split useful or redundant?** Redundant as a *mode*; useful as a *layout toggle*.
- **Are Workspaces and Projects both necessary?** Not for solo users; Workspaces earn their place only with teams.
- **Are files and documents conceptually consistent?** Partially — the asset/entity duality leaks (§IA-3).
- **Is collaboration uniformly applied?** Mechanically yes (permissions/CRDT/comments across modes); *communicated* unevenly (COL-1).
- **Are version history & comments consistently located?** Yes — one right-side drawer.
- **Does the UI communicate what is local / Drive / GitHub / realtime?** Inconsistently — chips exist globally, but not per-entity.
- **Does it overpromise Office compatibility?** **No** — `formatMatrix` + "basic fidelity" labels are commendably honest.
- **Does it overpromise Figma-like collaboration?** **Slightly** — presence/Share are always visible even when realtime is off (COL-1).

**Proposals**
- **One-sentence product definition:** *"Lattice is a local-first visual workspace where notes, documents, sheets, decks, code and files are entities you can arrange, link and co-edit on an infinite board — backed by your own Google Drive."*
- **Primary target user:** a technical/creative individual who thinks visually and lives across notes+code+files (an "Obsidian-plus-Figma-plus-VS-Code" power user).
- **Secondary:** a small team that wants that on shared projects with real permissions.
- **Non-target:** enterprise Office-replacement buyers; mobile-first users; users needing pixel-perfect PPTX/DOCX fidelity.
- **Core JTBD:** "Gather everything about a project in one canvas and think/work across it without switching tools."
- **Top three workflows:** (1) research-to-artifact on a board (import → link → write/deck); (2) code + docs in one project with GitHub sync; (3) small-team co-editing with comments and versions.
- **Emphasize:** the board as universal surface, linking/backlinks, honesty of state, code+notes synergy.
- **De-emphasize:** Split-as-mode, Workspaces for solo users, Office-fidelity framing.

---

## 20. Issue register

Severity: **Critical/High/Medium/Low.** Effort: **XS/S/M/L/XL.**

| ID | Area | Title | Evidence | Sev | Impact | Freq | Scope | Suggested fix | Acceptance | Deps | Effort | Phase |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| LAT-1 | Board/Present | Presentations not board cards | `model.ts CardType`, `ImportService.ts:327` | High | Core promise broken | Always | Board+import+nav | **Done:** card type + node + drag + toolbar + inspector + import | Deck is a first-class card (compact/expanded/navigator) | — | L | 8 (this audit) |
| LAT-2 | A11y | Canvas not keyboard-operable | `BoardCanvas.tsx` | Critical | Excludes keyboard/SR users | Always | Board | Roving tabindex, arrow-move, add-card menu | Full card lifecycle via keyboard | — | L | P1 |
| LAT-3 | Collab | Presence/Share imply realtime when off | `TopBar`, `RealtimeStatusChip.tsx` | High | Misleading capability | When realtime off | Collab UI | Downgrade presence/share labels to "local/Drive only" | Off-state visibly propagates | — | S | P1 |
| LAT-4 | Perf | three.js in main bundle | build output; `cards.tsx` | High | 170 kB gz on first paint | Always | Bundle | Lazy-load 3D viewer/scene | main < ~540 kB gz | — | M | P1 |
| LAT-5 | Perf | No board virtualization; off-screen anim loops | `cards.tsx:207` | High | Renderer stalls on big boards | Large boards | Board | Pause off-screen loops; virtualize | 100+ cards stays interactive | — | L | P1 |
| LAT-6 | Nav | No browser back/forward | `App.tsx` | High | Back exits app | Always | Global | History entries per mode/entity | Back returns to prior state | — | M | P1 |
| LAT-7 | IA | Split is a mode, not a layout | `TopBar.tsx:38` | Medium | Concept confusion | Always | Nav/IA | Demote Split to toggle | Split reads as layout | LAT-6 | M | P2 |
| LAT-8 | IA | Workspaces add nesting w/o enforcement | `model.ts:66` | Medium | Extra level for solo | Always | Org | Auto-hide for single workspace | Solo users never see it | — | S | P2 |
| LAT-9 | Present | No presenter/slideshow mode | `PresentationWorkspace.tsx` | Medium | Mode can't present | Per use | Present | Full-screen present + notes | F5 presents deck | — | M | P2 |
| LAT-10 | Sheet | Save-granular, not cell CRDT | README §15.12 | Medium | Silent overwrite risk | Co-edit sheet | Sheet | In-sheet notice + roadmap cell CRDT | User warned in-sheet | — | S(notice)/XL(CRDT) | P2 |
| LAT-11 | UI/A11y | Color-only status encoding | `TopBar`, `RealtimeStatusChip` | Medium | Colorblind fail | Always | UI | Icon+text redundancy | No status by color alone | — | S | P2 |
| LAT-12 | Responsive | Fixed panels starve canvas; no mobile | `Sidebar`/`Inspector` widths | High | Unusable < 1100 px / mobile | Small screens | Layout | Drawers + tiers + honest block | Defined tiers ship | — | L | P1 |
| LAT-13 | Cloud | Identity vs storage under-explained | `LoginScreen`, `SyncIndicator` | Medium | "Signed in ≠ synced" surprise | Onboarding | Cloud | One-line cue near Drive chip | Cue present | — | XS | P2 |
| LAT-14 | Nav | Presentations hidden under filter chips | `Sidebar.tsx:533` | Low | Can't filter to decks | Filtering | Sidebar | Add "Decks" chip | Chip shows decks | — | XS | P3 |
| LAT-15 | Board | No visible undo/redo | `BoardCanvas` | Medium | Accidental deletes | Occasional | Board | Undo button + Ctrl+Z | Undo restores last op | — | M | P2 |
| LAT-16 | Assets | Preview-failure copy inconsistent | previews | Low | Confusing blanks | Some files | Assets | Standard "can't preview + download" | Uniform fallback | — | S | P3 |
| LAT-17 | UI | Duplicate recent-kind maps | `Sidebar`, `CommandPalette` | Low | Drift risk | — | UI | Share one map | Single source | — | XS | P3 |
| LAT-18 | Onboarding | No product tour / mental-model intro | — | Medium | Steep first run | New users | Onboarding | 3-step tour or annotated first board | Tour ships | — | M | P2 |
| LAT-19 | Nav (fixed) | Presentation missing from create/search/recents | `TopBar`, `CommandPalette`, `Sidebar` | Medium | Couldn't create/find decks | Always | Nav | **Done** | Deck in +New, palette, search, recents | LAT-1 | S | 8 (this audit) |

---

## 21. Prioritized remediation plan

See [`ux-ui-remediation-roadmap.md`](./ux-ui-remediation-roadmap.md) for the detailed plan (rationale, deps, benefit, risk, effort, acceptance per item). Summary:

- **P0 — Blocking (before further expansion):** LAT-1 Presentation-in-Board (**done in this audit**).
- **P1 — Before public beta:** LAT-2 canvas keyboard a11y · LAT-3 realtime honesty propagation · LAT-4 lazy three.js · LAT-5 board virtualization/anim pause · LAT-6 browser history · LAT-12 responsive tiers + drawers.
- **P2 — Before broader adoption:** LAT-7 Split→toggle · LAT-8 hide Workspaces solo · LAT-9 presenter mode · LAT-10 sheet co-edit notice · LAT-11 color+icon status · LAT-13 identity/storage cue · LAT-15 board undo · LAT-18 onboarding tour · CLD-3 admin bootstrap moment.
- **P3 — Refinement:** LAT-14 Decks filter chip · LAT-16 preview fallbacks · LAT-17 dedupe kind maps · minimap kind colors · slide-level links.

**Autonomous fixes already applied in this audit (high-confidence, low-risk):** LAT-1 (full Presentation-in-Board), LAT-19 (Quick Create + command palette create/search), sidebar recents for decks, `deletePresentDoc` card cleanup, `IcChevronLeft`, a unit test, and a `test` script. Typecheck ✅, build ✅, tests ✅ (3/3).
