# Presentation Editor — Implementation Roadmap

Companion to **`docs/presentation-editor-audit.md`**. Sequenced so foundations
precede features (mission §24): *a precise, reliable editor with fewer
capabilities beats a broad, fragile one.*

**Guiding constraints (from the audit):**

- **Evolve, don't rewrite.** The model (`presentModel.ts`) is clean; grow it
  **additively** with a body-migration runner that never drops unknown fields.
- **No new large dependencies** for Phases 0–3. Snapping, alignment, history,
  presenter mode, layouts, and health checks are all buildable on the current
  stack (React 19, Zustand, jsPDF/JSZip already present).
- **Reuse Lattice primitives** (toasts, dialogs, `ToolbarDivider`, `Icons`,
  `ShortcutsDialog`, command palette, `useReadOnly`, tokens) — audit §11.
- **Every mutation is undoable or confirmed;** every control is real (no mocks).

**Body-migration contract (applies to every phase that touches the model).**
Bump `PresentationBody.version`; add `migratePresentBody(raw): PresentationBody`
that upgrades N→N+1 in order, fills new fields with safe defaults, and
**preserves unknown keys**. `normalizePresentBody` calls it. A "Before vN
migration" is implicitly safe because bodies are re-derived, not destroyed.

---

## Phase 0 — Architecture & tests (the history keystone)

**User value:** every edit becomes reversible; the editor stops feeling risky.
This is the prerequisite for all "non-destructive" and "reliable" targets.

**Files affected**
- **New** `src/lib/present/history.ts` — generic bounded undo/redo stack with
  transaction coalescing (`commit`/`seal`) and a coalescing key.
- **New** `src/lib/present/geometry.ts` — pure geometry helpers (clamp, resize
  math, bounds, hit-test) extracted from the component.
- `src/lib/present/presentModel.ts` — route `normalizePresentBody` through a
  version-aware `migratePresentBody`; keep `version` handling in one place.
- `src/components/present/useDeckHistory.ts` — the hook wrapping the stack,
  storage load and batched persistence.
- `src/components/present/PresentationWorkspace.tsx` — replace ad-hoc `body`
  `useState` + debounce with `useDeckHistory` (same public `apply` surface, now
  transactional).
- **New tests** `history.test.ts`, `presentMigrate.test.ts`, `geometry.test.ts`.

**Data-model changes:** none required for history itself. Introduce the
migration seam + additive optional element fields so Phase 1 is safe.

**Migration requirements:** `migratePresentBody(v1)` upgrades to the current
version, fills nothing required, and preserves unknown fields (deck/slide/
element spreads).

**Implementation tasks**
1. `history.ts`: `initHistory / commit / seal / undo / redo / canUndo / canRedo`.
   Transactions collapse many `commit`s sharing a `coalesceKey` into one entry;
   a different/absent key starts a new entry; bounded stack with eviction.
2. `useDeckHistory(meta)`: loads body, exposes `apply(patch, opts)`, `undo`,
   `redo`, `seal`, `flush`; persists on **commit** (debounced), not per op.
3. Extract pointer/resize/clamp/bounds math into `geometry.ts` (no React).
4. Wire Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z (guarded against text fields).

**Test strategy (node vitest, no DOM):** unit-test `history` (coalesce collapses
N ops to 1; undo/redo pointers; limit eviction; no-op guard), `migrate` (v1→v2,
unknown-field preservation, garbage → valid), `geometry` (clamp bounds,
min-size, resize-from-corner/center math).

**Acceptance criteria**
- One drag / one resize / one typed word = **one** undo step.
- Undo restores exact geometry & style; redo re-applies; both bounded.
- Migration never throws and never drops unknown keys (test-proven).
- `typecheck`, `test`, `build` green; no behavior regressions in manual edit.

**Risks:** history/perf coupling with the save debounce → mitigate by committing
on gesture-end and coalescing typing. **Rollback:** the hook is drop-in; revert
`PresentationWorkspace` to the previous `useState` and delete the new files —
model untouched.

---

## Phase 1 — Canvas fundamentals (precision)

**User value:** professional-grade positioning — multi-select, snapping, smart
guides, alignment/distribution, keyboard nudge, constrained resize, zoom.

**Files affected**
- **New** `src/components/present/SlideCanvas.tsx` — the interaction surface.
- `src/components/present/SlideView.tsx` — split visual (`ElementContent`) from
  positioning so rotation/opacity apply once; honor `hidden`.
- **New** `src/lib/present/snapping.ts`, `src/lib/present/align.ts` (pure).
- `src/lib/present/geometry.ts` (extend: multi-bounds, marquee hit-test).
- `src/components/Icons.tsx` — undo/redo/align/distribute/zoom/snap/shape icons.
- `src/components/present/PresentationWorkspace.tsx` — toolbar, inspector, zoom,
  keyboard, layer ops.
- **New tests** `snapping.test.ts`, `align.test.ts`, extend `geometry.test.ts`.

**Data-model changes (additive, v1→v2):** element `rotation?`, `opacity?`,
`locked?`, `hidden?`; image `alt?`. All optional; default-safe.

**Migration requirements:** v2 fills nothing (all optional); unknown-preserving.

**Implementation tasks**
1. Selection: single-click, Shift-click add/remove, marquee drag on empty
   canvas, click-empty clears, `Esc` steps out. `selectedIds: Set<string>`.
2. Transform: 8 handles; Shift = aspect lock; Alt = from center; rotation
   handle; numeric inputs guard invalid/negative.
3. Snapping (`snapping.ts`): candidates = slide center/edges, other element
   edges/centers; return snapped delta + active guide lines; toggle in toolbar.
4. Alignment (`align.ts`): L/C/R/T/M/B, distribute H/V — operate on the
   multi-selection bounds; pure functions returning new element geoms.
5. Keyboard: arrows nudge 1px, Shift+arrows 10px; copy/paste/duplicate;
   select-all; all through history.
6. Layer ops: bring-to-front / send-to-back / forward / backward with
   normalized contiguous `z`; lock/hide honored by canvas + inspector.
7. Zoom: fit / 100% / +/− / Ctrl+wheel; persist per-deck view state locally.

**Test strategy:** heavy pure-unit coverage of `snapping` (each target type,
threshold, no-snap), `align`/`distribute` (2–4 element fixtures, exact coords),
`geometry` (aspect/center resize, marquee intersection), history integration
(multi-move = one entry). Manual: drag shows guides & snaps; alignment on 3
boxes; nudge; zoom.

**Acceptance criteria**
- Multi-select via Shift-click and marquee; group move/align/distribute/delete.
- Smart guides appear and snap to centers/edges; toggle works.
- Resize from any handle; Shift aspect; Alt center; no invalid dims.
- Arrow/Shift-arrow nudge; all reversible in one step each.
- Zoom fit/100%/±/wheel; view state preserved on slide switch.
- All new geometry/snapping/align logic unit-tested; `typecheck`/`test`/`build` green.

**Risks:** pointer-math regressions → keep math pure & tested; guide overlay
perf at 200 elements → compute candidates once per gesture. **Rollback:** the
model additions are optional so a revert to the Phase-0 canvas loads v2 bodies
fine (extra fields ignored).

---

## Phase 2 — Contextual inspector & typography

**User value:** complete, predictable text control and a right panel that shows
only what's relevant to the selection.

**Files affected:** `Inspector` panels split by selection state
(`NothingSelected | SlidePanel | TextPanel | ImagePanel | ShapePanel |
MultiPanel`), `presentModel.ts` (text/theme fields), `SlideView.tsx` (render new
text props), `presentPdf.ts`/`presentPptx.ts` (emit new props where supported).

**Data-model changes (v2→v3, additive):** text `fontFamily`, `weight`,
`lineHeight`, `letterSpacing`, `opacity`, `valign`, `list ('none'|'bullet'|
'number')`, `padding`, `autoSize ('fixed'|'height'|'width')`, `link`,
`styleRef`. Deck `textStyles` map (Display/Title/Subtitle/Heading/Body/Caption/
Quote) as token-linked defaults.

**Migration requirements:** v3 backfills defaults (family=theme body font,
weight=400 or 700 if `bold`, lineHeight=1.25…); `bold`/`italic` retained.

**Implementation tasks:** contextual inspector router; font family picker
(system/websafe — local-first, no remote fonts); weight/leading/tracking/valign/
lists/padding/auto-size controls; hyperlink field; semantic styles panel where
editing a style updates all `styleRef`-linked elements (undoable); min-readable-
size and contrast hints (non-blocking).

**Test strategy:** model migration (bold→weight), style-propagation (change
Title style → linked elements update, one undo step), inspector reducers (pure
patch functions) unit-tested.

**Acceptance criteria:** every text property in §6 works and persists; changing
a semantic style updates linked elements and is undoable; inspector shows only
selection-relevant controls; exports carry supported props; honest "not
exported" note for unsupported ones.

**Risks:** font availability across machines → restrict to safe families +
document; over-rich text creep → cap at presentation-appropriate. **Rollback:**
panels additive; revert to single panel; v3 fields optional.

---

## Phase 3 — Layouts, themes & reusable components

**User value:** "beautiful by default" — semantic layouts, a real theme/token
system with brand kit, and insertable components.

**Files affected:** **new** `layouts.ts`, `theme.ts` (token model + presets +
migration), `components.ts` (component factories), inspector Layout/Theme
panels, toolbar Layouts/Components menus, `SlideView`/exporters (token-aware).

**Data-model changes:** element `role` (title/subtitle/body/image/metric/
caption); slide `layoutId?`; deck `theme` becomes a **token object** (bg/surface/
text×2/accent/fonts/scale/spacing/radius/shadow/chartPalette) — keep the 3 enums
as presets that expand to tokens; deck `brandKit?`. Migration maps enum → tokens.

**Migration requirements:** v-bump; `theme:'plain'|'ink'|'accent'` → token
object; manual colors preserved. Never destroy manual content on theme/layout
change.

**Implementation tasks:** placeholder roles + tokenized layouts that adapt to
content; layout picker with **preview before destructive remap**; token-driven
theme apply (deck / selected slides); duplicate/reset/edit theme; component
factories (hero/quote/stat/comparison/timeline/process/team/CTA/gallery…)
emitting editable, tokenized, undoable groups; brand kit (local, no cloud).

**Test strategy:** layout remap fixtures (content preserved), theme migration
(enum→tokens round-trip), component factories (serialize/normalize/undo), token
application.

**Acceptance criteria:** ≥12 layouts and the listed components insert as
editable tokenized content; theme edit re-flows linked styles without destroying
manual edits; layout change previews and remaps non-destructively; brand kit
works offline.

**Risks:** remap ambiguity → always preview + undo; token/enum drift → single
source in `theme.ts`. **Rollback:** presets still resolve; inserts additive.

---

## Phase 4 — Outline & Lattice-native content flows

**User value:** the differentiator — a deck as the output of thinking:
Document/Board → outline → editable slides.

**Files affected:** **new** `OutlineMode.tsx`, `outline.ts` (deck↔outline),
`fromDocument.ts`, `fromBoard.ts`; hooks into `richdoc`/board selection;
empty-state + command-palette entries.

**Data-model changes:** deck `sections` (id/title/collapsed/slideIds); slide
`sourceRef?` (entityKind/id); slide `purpose?`. Additive.

**Migration requirements:** v-bump; sections default empty; `sourceRef` optional.

**Implementation tasks:** outline view (edit titles/purpose/notes, reorder,
convert item→slide, group into sections, collapse, speaking-duration estimate,
over-dense flags); create-from-Document (pick headings/blocks → reviewable
outline → editable slides, keep `sourceRef`); create-from-Board (ordered cards →
sections → slides, reuse text/assets, don't rasterize editable content);
insert-from-workspace (image asset / chart snapshot / doc/board selection) with
explicit **copied vs linked vs snapshot** labels; **no hidden sync**.

**Test strategy:** deck↔outline round-trip, doc→outline mapping, board→slides
ordering, provenance retained; all undoable.

**Acceptance criteria:** a Document or Board produces a reviewable outline then
editable slides preserving order and a source reference; insert flows label
content honestly; outline edits undoable.

**Risks:** scope creep across editors → read-only extraction, no two-way sync in
v1. **Rollback:** additive entry points; disable menu items.

---

## Phase 5 — Presenter mode & transitions

**User value:** the namesake job — actually present.

**Files affected:** **new** `PresenterView.tsx` (reuses `SlideView`), transition
layer, `presentModel.ts` (transition field), shortcuts/dialog, exporters (honest
limitation notes).

**Data-model changes:** slide `transition?: 'none'|'fade'|'slide'|'scale'|
'dissolve'` + `duration?`. Additive.

**Migration requirements:** v-bump; default `none`.

**Implementation tasks:** full-screen single-window presenter (arrow/space/click
nav, `B` black screen, `Esc` exit, current+next preview, speaker notes, elapsed
timer, slide progress, optional pointer, **reduced-motion** mode, no editing
chrome); Phase-1 transitions with duration + preview, deterministic, no layout
shift; second-screen deferred until reliable.

**Test strategy:** transition reducer/purity, presenter nav state machine
(bounds, black, exit), reduced-motion selection logic; manual full-screen pass.

**Acceptance criteria:** Present enters full-screen from current slide; all
nav/keys work; notes+timer+next show; transitions respect reduced-motion; export
states transitions as unsupported honestly.

**Risks:** fullscreen API quirks → feature-detect + graceful fallback.
**Rollback:** separate view; remove entry point; transition field optional.

---

## Phase 6 — Presentation-health assistant & accessibility

**User value:** trust and inclusivity — catch problems before presenting; make
the canvas usable by keyboard and screen readers.

**Files affected:** **new** `health.ts` (deterministic checks) + `HealthPanel.tsx`;
canvas keyboard layer; `presentModel.ts` (slide reading-order); reading-order
inspector.

**Data-model changes:** slide `readingOrder?: string[]`. Additive. (image `alt`
already added in Phase 1.)

**Migration requirements:** v-bump; reading order defaults to z-order.

**Implementation tasks:** local checks (small text, low contrast, overflow,
off-canvas, overlap, misalignment, density, missing title, missing alt,
inconsistent theme, empty slide, duplicate titles, dense notes, export-risk) →
deck score + per-slide list + click-to-focus + suggested fixes, grouped as
**a11y errors / structural warnings / design suggestions / export warnings**;
full canvas keyboard operability (roving tabindex, arrow move/resize, Enter
edit); reading-order inspector; status redundancy (icon+text).

**Test strategy:** each health check as a pure function with fixtures (contrast
ratios, overflow bounds, off-canvas, duplicate titles); reading-order mapping;
keyboard-nav reducer.

**Acceptance criteria:** health panel lists real issues by severity with
focus-jump and honest categories; canvas fully keyboard-operable; alt text
authorable/exported; reading order editable.

**Risks:** false positives → conservative thresholds, "suggestion" framing.
**Rollback:** panel + keyboard layer additive; model fields optional.

---

## Phase 7 — AI provider seam & assisted transforms

**User value:** assistance that never fakes output and degrades honestly.

**Files affected:** **new** `ai/Provider.ts` (interface), `ai/actions.ts`,
`ai/localHeuristic.ts` (no-LLM honest fallback), AI menu + preview dialog; env
seam mirroring existing `VITE_*` honesty.

**Data-model changes:** none (AI produces normal model ops). Optional
`metadata.aiSource` provenance.

**Migration requirements:** none.

**Implementation tasks:** `PresentationAIProvider` interface (outline, rewrite,
shorten, simplify, hierarchy, text→timeline/comparison/process, speaker notes,
summarize/redundancy); **preview-before-apply**, undoable, never silent
overwrite; explicit loading/error/**unavailable** states; separate content vs
layout generation; **honest disabled state when no provider configured** (like
realtime/conversion seams). No provider bundled.

**Test strategy:** provider interface conformance, action reducers (apply preview
→ model ops, undoable), disabled-state rendering, local-heuristic determinism.

**Acceptance criteria:** every AI action previews, applies as undoable ops, and
shows honest states; with no provider the feature is clearly unavailable, not
faked.

**Risks:** privacy → explicit consent before any network, mirror
conversion-backend consent pattern. **Rollback:** seam isolated; disable menu.

---

## Phase 8 — Import/export fidelity & performance hardening

**User value:** wider *real* fidelity (notes, per-run text) proven by fixtures;
large decks stay fast.

**Files affected:** `presentImport.ts`, `presentPptx.ts`, `presentPdf.ts`, store
persistence, slide-list memoization, **new** `__fixtures__/*` +
`presentExport.test.ts`, **new** `docs/presentation-performance.md`.

**Data-model changes:** optional image `assetId` (reference instead of inline
data-URL) via existing `AssetRegistry`; keep data-URL fallback.

**Migration requirements:** none forced; opportunistic asset extraction.

**Implementation tasks:** export speaker notes to PPTX (notes master + notes
slides); preserve per-run text/color on import where feasible; **automated
export fixtures** (deck→PPTX/PDF→re-parse geometry/text/image assertions);
pre-import planning + post-import issue panel in-workspace; persist on commit
only; memoize thumbnails; measure & document (initial load, TTI, drag FPS,
50-slide, 200-element, memory after repeated imports).

**Test strategy:** round-trip fixtures (geometry/text/image preserved,
unsupported reported), persistence-batching test (N ops → 1 write), thumbnail
memoization test.

**Acceptance criteria:** notes export; fixtures prove geometry/text/image
preservation & honest unsupported-reporting; `docs/presentation-performance.md`
records the §21 metrics; no full-deck re-serialize mid-drag.

**Risks:** OOXML notes complexity → incremental, keep "basic fidelity" label
truthful. **Rollback:** exporters pure; revert emitter; asset-ref optional.

---

## Sequencing & immediate execution

```
Phase 0 ─▶ Phase 1 ─▶ Phase 2 ─▶ Phase 3 ─▶ Phase 4
   (undo)    (precise)  (type)    (design)   (native flows)
                                   │
Phase 5 ◀──────────────────────────┘   Phase 6 ─▶ Phase 7 ─▶ Phase 8
(present)                              (health/a11y) (AI)     (fidelity/perf)
```

**Executing now: Phase 0 + Phase 1 as one increment.** They are the two lowest
scores in the audit (reliability, canvas precision, keyboard), are fully
self-contained, need no new dependencies and no destructive migration, and every
piece of their logic is unit-testable in the existing node vitest environment.
Delivering undo/redo + the precision toolkit (multi-select, snapping, alignment/
distribution, keyboard nudge, constrained resize, zoom) is the single highest-
leverage move toward the 9.5 bar.
