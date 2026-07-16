# Presentation Editor — Product & Code Audit

**Scope:** the Lattice presentation workspace (the slide editor, its data model,
board card, import/export, and mode shell) as it stands after Phase 8 / 8.5.
**Branch inspected:** `main` @ `7345c0e`. **Method:** full read of every
presentation source file, the store wiring, the design tokens, and a clean
`typecheck` / `test` / `build` run. Nothing here is speculative — every claim
cites a file and line.

**Verification legend:** ✅ verified in source · 🧪 verified by running
typecheck/test/build · 📄 documented in README but not re-verified here.

**One-line verdict.** The presentation engine is an *honest, correct, minimal
v1*: a fixed 960×540 canvas with absolutely-positioned text/image/shape
elements, real vector PDF export, a genuinely valid PPTX writer, and editable
PPTX/ODP import — all wired cleanly into the vault, board, and permission
systems. It is **reliable but not yet precise, and not yet design-led.** The
distance to 9.5/10 is almost entirely in (1) non-destructive editing
(there is no undo), (2) canvas precision (no multi-select, snapping, alignment,
or keyboard nudging), (3) typography and layout systems, and (4) the presenter
experience (which does not exist). None of these are blocked by the current
architecture; the model is clean enough to extend without a rewrite.

---

## 0 · How the audit was produced

Files read in full (the complete presentation surface):

| File | Lines | Role |
|---|---:|---|
| `src/lib/present/presentModel.ts` | 172 | canonical JSON model + helpers (digest, normalize) |
| `src/components/present/PresentationWorkspace.tsx` | 875 | the editor (list · canvas · inspector · notes · export) |
| `src/components/present/SlideView.tsx` | 127 | shared pure renderer (thumbnails, card, read-only) |
| `src/components/board/PresentationCardNode.tsx` | 158 | board card (compact / expanded) |
| `src/lib/present/presentImport.ts` | 272 | PPTX + ODP → `PresentationBody` + report |
| `src/lib/present/presentPdf.ts` | 107 | deck → PDF (vector, jsPDF) |
| `src/lib/present/presentPptx.ts` | 185 | deck → PPTX (hand-built OOXML) |
| `src/lib/present/presentBoardCard.test.ts` | 61 | the only presentation tests (3, pure logic) |

Wiring also inspected: `src/store/useStore.ts` (present methods `:1326–1399`,
persistence/migration `:1520–1676`), `src/types/model.ts`
(`PresentationDocMeta :285`, `CardType :304`, `VaultExport :446`),
`src/App.tsx:161`, `src/components/workspaces/ModeWorkspaces.tsx:181`,
`src/components/Inspector.tsx:365–566`, `src/styles/index.css` (design tokens).

Build/test state (🧪, this session):

- `npm run typecheck` → **passes**, no errors.
- `npm test` → **3/3 pass** (`presentBoardCard.test.ts`; vitest node env, no DOM harness).
- `npm run build` → **passes** in ~27 s. `PresentationWorkspace` chunk **15.82 kB
  (5.40 kB gz)**, lazy; `presentPptx` 10.20 kB; main bundle 2.45 MB (700 kB gz).

> **Doc note:** the audit brief asked me to read `docs/features.md`,
> `docs/limitations.md`, `docs/file-formats.md`. **These do not exist** in this
> repo — the equivalent content lives in `README.md` (§15.7, §15.8, §15a) and
> the four `docs/ux-ui-*` / `presentation-board-integration-spec.md` files. The
> capability truth-source is `src/lib/registry/formatMatrix.ts`.

---

## 1 · Current architecture

```
                       ┌───────────────────────────────────────────┐
   Vault store         │  PresentationDocMeta   (metadata only)     │
   (Zustand, persisted)│  id·title·slideCount·snippet·sourceAssetId │
   store/useStore.ts   └───────────────┬───────────────────────────┘
                                       │ body lazy-loaded by id
                         StorageProvider.getDocument(id)  ── IndexedDB / Drive
                                       │
                        ┌──────────────▼──────────────┐
                        │      PresentationBody         │  presentModel.ts
                        │  { app, version:1, theme,     │  (canonical JSON;
                        │    slides:[{ background,notes,│   the single source
                        │      elements:[abs x/y/w/h/z] │   format for import,
                        │    }] } — fixed 960×540       │   export, editor)
                        └──────┬───────────────┬────────┘
             import  ┌─────────┘               └──────────┐  export
      presentImport.ts│                                    │presentPdf.ts (vector)
      PPTX/ODP → body │                                    │presentPptx.ts (OOXML)
                      │                                    │
        ┌─────────────▼─────────────┐        ┌─────────────▼───────────────┐
        │  PresentationWorkspace     │        │  PresentationCardNode        │
        │  (full editor, lazy chunk) │        │  (board card, compact/expand)│
        │  list · SlideCanvas ·      │        │  reuses SlideView            │
        │  ElementInspector · notes  │        └──────────────────────────────┘
        └──────────┬─────────────────┘
                   └── shares ──► SlideView.tsx (StaticElement / elementStyle)
```

**Key architectural facts (all ✅):**

1. **One canonical model, fixed canvas.** `SLIDE_W=960`, `SLIDE_H=540`
   (`presentModel.ts:12`). Every element is absolutely positioned
   (`x,y,w,h,z`), no layout relationships. Three element kinds: `text`,
   `image` (data-URL, self-contained), `shape` (`rect|ellipse|line`).
2. **Metadata / body split** mirrors docs/sheets/code: `PresentationDocMeta`
   in the store, `PresentationBody` JSON in `StorageProvider`, lazy-loaded on
   open (`PresentationWorkspace.tsx:69`) and on card-expand
   (`PresentationCardNode.tsx:95`). Digest (`slideCount`, `snippet`) recomputed
   on every persist (`useStore.ts:1368`).
3. **Local component state + debounced full-body writes.** The editor holds the
   whole deck in `useState` (`PresentationWorkspace.tsx:55`); every edit calls
   `apply()` → schedules `flush()` after **700 ms** (`:45,:101`) → `putDocument`
   re-serializes the **entire deck** (`useStore.ts:1362`).
4. **Shared renderer extracted** (`SlideView.tsx`) so the board card renders a
   slide without importing the editor chunk — a real, measured perf decision
   (README §15a.2, ✅ confirmed: card imports only `SlideView` + model).
5. **Honest import/export.** PDF is true vector (`presentPdf.ts`), PPTX is a
   real, minimal-but-valid PresentationML package (`presentPptx.ts`), import
   returns a `report: string[]` of everything dropped (`presentImport.ts:22`).
6. **Ecosystem integration is done** (Phase 8.5): `presentation` is a
   `CardType`, decks are board cards, permissions/comments/versions inherited,
   read-only role honored (`useReadOnly()` gate at `PresentationWorkspace.tsx:53`).

**The load-bearing weakness is #3:** there is **no history/transaction layer**.
`body` is replaced wholesale on each `apply`; nothing records the previous
state. This single fact is why there is no undo, and it is the root of the
highest-priority findings below.

---

## 2 · Current feature inventory

**Present and working (✅):**

| Area | Capability | Evidence |
|---|---|---|
| Slides | add, duplicate, delete (confirm, min-1 guard), reorder ↑/↓, thumbnails, select | `PresentationWorkspace.tsx:267–383` |
| Slide props | per-slide background color (+ reset to theme), speaker notes | `:401–447` |
| Elements | text box, image (≤4 MB → data URL), rect / ellipse / line | `:163–205,:390–399` |
| Text style | font size (8–120), bold, italic, align L/C/R, color or theme | `:728–795` |
| Shape style | fill (or none), stroke color, stroke width (0–20) | `:798–846` |
| Transform | single-select, drag-move (clamped to slide), resize (one BR handle), inline text edit (double-click) | `:530–676` |
| Geometry | numeric X/Y/W/H inputs in inspector (keyboard-editable) | `:703–726` |
| Layers | bring forward / send backward (z ± 1), z read-out | `:848–865` |
| Theme | 3 presets: plain / ink / accent | `presentModel.ts:68–75` |
| Keys | `Del`/`Backspace` deletes selection, `Esc` deselects (guarded vs typing) | `:127–146` |
| Export | PDF (vector), PPTX (basic fidelity) | `presentPdf.ts`, `presentPptx.ts` |
| Import | PPTX + ODP → editable deck + per-file report; original preserved | `presentImport.ts` |
| Board | compact card (title/snippet/count/imported), expanded (live slide + prev/next), drag from sidebar, double-click → workspace | `PresentationCardNode.tsx` |
| Roles | viewer = read-only (toolbar/inspector hidden, navigator still pages) | `:53,:388,:693` |

**Absent (❌) — measured against the mission's section list:**

- **Non-destructive editing:** no undo/redo, no transactions (§19).
- **Canvas precision:** no multi-select, no marquee, no snapping/smart guides,
  no alignment/distribution, no keyboard nudge, no rotation, no
  group/lock/hide, no zoom controls (fit/100%/±/wheel), no rulers/grid/guides,
  no edge/corner-set resize, no Shift-aspect / Alt-from-center (§5).
- **Typography:** no font family, weight beyond bold, line-height, letter
  spacing, lists/bullets, indentation, vertical align, box padding,
  auto-size/overflow control, hyperlinks, or semantic text styles (§6).
- **Images/media:** no crop/fit/fill, corner radius, border, shadow, replace,
  alt text, reset; no video/audio model (§7).
- **Layout system:** none — only a blank slide and a hard-coded title-slide
  helper (`createTitleSlide`, `presentModel.ts:100`). No placeholders,
  no layout picker, no remap (§8).
- **Reusable components:** none (hero, quote, stat, timeline, …) (§9).
- **Brand/theme system:** 3 fixed presets; no tokens, type scale, spacing,
  radius, chart palette, custom/duplicate/edit theme, per-slide apply (§10).
- **Outline / story mode:** none (§11).
- **Lattice-native flows:** no create-from-Document, create-from-Board,
  insert-from-workspace (§12).
- **AI assistance:** none — no provider seam (§13).
- **Quality/health assistant:** none (contrast, overflow, off-canvas…) (§14).
- **Presenter mode:** none — `grep` for `requestFullscreen|presenter|slideshow`
  returns **zero hits** (🧪). "Present" is not implemented (§15).
- **Transitions/animations:** none (§16).
- **Keyboard workflow:** only `Del`/`Esc`; no add-slide, duplicate, copy/paste,
  undo, group, zoom, present, nudge, command palette entries, shortcuts dialog
  (§17).

---

## 3 · UX problems

| # | Problem | Evidence | Severity | User impact |
|---|---|---|---|---|
| UX-1 | **No undo.** A stray drag, a `Del`, a theme/background change, a slide delete — none are reversible. Slide delete confirms; element delete does not. | whole file has no history; `:136` deletes on keydown | **Critical** | The single biggest trust breaker. Users edit timidly; one misclick loses work. |
| UX-2 | **"Present" does not exist.** A presentation tool you cannot present with. No full-screen, no arrow-key slideshow, no notes view. | no fullscreen code (🧪 grep) | **High** | The namesake job is missing; the deck can only be exported to be presented. |
| UX-3 | **Slide creation is slow & shapeless.** New slides are blank; the only structure is a JS-only `createTitleSlide`. No layouts, no "add title/text/image" quick actions on an empty slide. | `:369–383`, `createSlide()` empty | High | Beginners face a blank rectangle every slide; decks drift visually. |
| UX-4 | **Reorder is ↑/↓ buttons only.** No drag-to-reorder in the slide list; moving slide 12 → 2 is ten clicks. | `:288–321` | Med | Painful for decks > ~6 slides. |
| UX-5 | **No copy/paste/duplicate of elements.** You can duplicate a slide but not an element; no cross-slide copy. | keydown handler `:127`, no clipboard | Med | Repetitive layout work is manual every time. |
| UX-6 | **Single selection only.** Can't move/align/style two boxes together. | `selectedId: string \| null` `:57` | High | Any multi-element adjustment is one-at-a-time; alignment is eyeballed. |
| UX-7 | **Zoom is automatic-only.** Canvas auto-fits (`scale` from ResizeObserver); no manual zoom, fit, 100%, or pan. | `:505–520` | Med | Can't zoom in for precise nudging or out to see a dense slide. |
| UX-8 | **Title edits fire a store write per keystroke** with `updatedAt` bump. | `:231` → `updatePresentMeta` → `Date.now()` `useStore.ts:1356` | Low | Churns sync/`updatedAt`; harmless but wasteful. |
| UX-9 | **Empty-state actions are thin.** Mode empty state offers only "New presentation"; no template / outline / import / from-Board entry. | `ModeWorkspaces.tsx:206–235` | Med | First-run gives no momentum. |

---

## 4 · Visual-design problems

| # | Problem | Evidence | Severity |
|---|---|---|---|
| VD-1 | **Toolbar uses raw glyph characters** as icons (`▭ ◯ — ↑ ↓ ↥ ↧ ⇤ ↔ ⇥ ✕`) instead of the app's icon system. Inconsistent weight/baseline, poor a11y naming. | `:303,:319,:397–399,:771,:855–862` | Med |
| VD-2 | **Selection affordance is minimal.** One 13px bottom-right handle; a flat 1.5px outline. No edge handles, no size/position readout while dragging, no rotation handle. | `:652–669` | Med |
| VD-3 | **Themes are only 3 color triples.** No type treatment, spacing, or accent system → decks look like "white slides with black text." No visual identity. | `THEME_COLORS` `presentModel.ts:68` | High |
| VD-4 | **Text has no real typographic rhythm.** Fixed `lineHeight:1.25`, one font, no scale. Titles vs body distinguished only by manual font size. | `SlideView.tsx:47`, `:634` | High |
| VD-5 | **Hard-coded hex in the editor** (`#0d99ff`, `#f24822`, `#888`, `#fff`) instead of tokens; won't follow theme, diverges from `--accent`. | `:612,:636,:663`, `:341` | Low |
| VD-6 | **Default title slide ships a literal "Subtitle" in `#888`** that fails contrast on white and reads as placeholder-shipped-as-content. | `presentModel.ts:113–123` | Low |

---

## 5 · Interaction problems

| # | Problem | Evidence | Severity |
|---|---|---|---|
| IX-1 | **Resize is one-corner, unconstrained.** Only bottom-right; no aspect-ratio lock (Shift), no from-center (Alt), no edge handles. Images distort freely (`objectFit:'fill'`). | `:652`, `SlideView.tsx:61` | High |
| IX-2 | **No snapping or smart guides.** Nothing aligns to slide center/edges or to other elements; placement is pixel-eyeballed. | `beginGesture` math `:546–563` (pure clamp) | High |
| IX-3 | **No keyboard nudge.** Arrow keys do nothing on a selected element. | keydown `:127` handles only Del/Esc | High |
| IX-4 | **Drag has no transaction boundary for history** (there is no history), and each move commits through the 700 ms debounce; fine for perf but means a drag can't be atomically undone. | `:546–572`, `:93–106` | High (couples to UX-1) |
| IX-5 | **Move clamp can push elements mostly off-canvas** (`8 - w` min) with no smart-guide feedback; easy to lose an element past the edge with no "off-slide" warning. | `:555–556` | Med |
| IX-6 | **Text editing is a raw `<textarea>` overlay** — no rich formatting while editing, selection lost on blur, no auto-height. | `:621–648` | Med |
| IX-7 | **Layer control is ± 1 z only.** No bring-to-front/send-to-back, no layer list; z can collide (non-unique). | `:853,:860` | Med |

---

## 6 · Accessibility issues

| # | Problem | Evidence | Severity |
|---|---|---|---|
| A11Y-1 | **Canvas is not keyboard-operable.** Elements are `<div>`s with pointer handlers; you cannot Tab to an element, select, move, or resize it by keyboard. Only the inspector's numeric X/Y/W/H is a keyboard path — and only *after* a pointer selects. | `:607–620`, `role="application"` `:585` | **High** (mirrors board `LAT-2`) |
| A11Y-2 | **Images have no alt text** — `alt=""` hard-coded, and the model has no `alt` field. Fails WCAG 1.1.1; exports carry no alt either. | `SlideView.tsx:60`; `ImageElement` has no `alt` `presentModel.ts:37` | High |
| A11Y-3 | **No slide reading-order model.** Elements paint by `z`; there is no logical reading order for a screen reader or for export. | model has only `z` | Med |
| A11Y-4 | **Glyph buttons lean on `title`, not always `aria-label`.** Shape/align/layer buttons expose `▭`, `↥`, `⇤` as their accessible name where `aria-label` is absent. | `:397–399,:855–862` | Med |
| A11Y-5 | **Color-only affordances.** Selected slide = accent border only; no non-color cue. | `:271` | Low |
| A11Y-6 | **No reduced-motion consideration for future transitions** (none exist yet, but the presenter/transition work must honor `prefers-reduced-motion`). | n/a | (forward) |

The surrounding chrome *is* accessible (global `:focus-visible` `index.css:757`,
`aria-label`s on the title/close/nav, `aria-current` on slides) — the gap is
specifically the **canvas interaction layer**.

---

## 7 · Performance risks

| # | Risk | Evidence | Severity |
|---|---|---|---|
| PF-1 | **Full-deck re-serialize on every save.** `persistPresentBody` writes the entire body (all slides, all data-URL images) to storage each flush. A 40-slide deck with embedded images re-encodes megabytes every 700 ms of activity. | `useStore.ts:1362`, `:1368` | High at scale |
| PF-2 | **Images are base64 data-URLs inside the JSON body.** Great for portability, but bloats the body, the digest pass, and every Drive/CRDT serialization; no dedupe, no asset references. | `ImageElement.src` `presentModel.ts:39`; `onPickImage` `:190` | Med |
| PF-3 | **Every element edit re-maps the whole slide array** (`slides.map`, `elements.map`) and re-sorts by z each render (`useMemo` helps per-slide). Fine now; will matter at "200 elements/slide" target. | `:108–124`, `:574` | Med |
| PF-4 | **Slide-list renders a full `SlideView` per slide** (no memoization/virtualization). At 50 slides that's 50 live scaled DOM subtrees. | `:267–282` | Med (matches the 50-slide target in §21) |
| PF-5 | **Card-expanded body reload keyed on `updatedAt`** re-reads storage on every deck edit; fine for one card, N cards on a board = N reloads per edit. | `PresentationCardNode.tsx:89–102` | Low |

No leaks found in object URLs (images are data-URLs, not `createObjectURL`), and
the editor cleans its pointer listeners (`:566–571`) and flushes on unmount
(`:91`).

---

## 8 · Data-model limitations

| # | Limitation | Evidence | Impact |
|---|---|---|---|
| DM-1 | **No history/version field or op model.** Body is a plain snapshot; nothing supports undo/redo or transactional edits. | `presentModel.ts` | Blocks §19 entirely |
| DM-2 | **`version: 1` but no migration runner** for the *body* format. `normalizePresentBody` coerces shape but there is no versioned upgrade path; new fields must be back-compatible by hand. | `:61,:156` | Risk for every future field |
| DM-3 | **Elements are purely geometric — no roles/placeholders.** No `role: 'title'|'body'|'image'…`, so layouts can't remap and themes can't target semantics. | `PresentElementBase` `:17` | Blocks §8, §10 |
| DM-4 | **No grouping / lock / hidden / rotation / opacity fields.** | element interfaces `:27–49` | Blocks §5 layering |
| DM-5 | **Text model is thin:** no `fontFamily`, `weight`, `lineHeight`, `letterSpacing`, `list`, `valign`, `padding`, `link`, `styleRef`. | `TextElement :27` | Blocks §6 |
| DM-6 | **Image model is thin:** no `alt`, `crop`, `fit`, `radius`, `border`, `shadow`, `assetId`. | `ImageElement :37` | Blocks §7, A11Y-2 |
| DM-7 | **Theme is an enum of 3**, not a token object; can't be extended, duplicated, or edited without breaking the union type. | `PresentTheme :15` | Blocks §10 |
| DM-8 | **`z` is not guaranteed unique or contiguous;** front/back are `±1` so collisions and gaps accumulate. | `:853` | Layer bugs |
| DM-9 | **No deck-level fields** for sections, transitions, aspect ratio (16:9 fixed), or brand link. | `PresentationBody :61` | Blocks §8, §11, §16 |

**Upside:** `normalizePresentBody` (`:156`) already defensively rebuilds a valid
deck from anything, and `VaultExport` carries `presentDocs`/`presentData`
(`model.ts:463`) — so **additive** model growth (new optional fields) is safe and
will not break existing vaults. This is the lever the roadmap uses.

---

## 9 · Import/export constraints

**Honest and correct, with real, documented losses (✅):**

- **PPTX import** (`presentImport.ts:53`) extracts text runs (with box geometry
  when present) and embedded images (png/jpg/gif/webp). **Dropped:** masters,
  themes, layouts (geometry then inherited → auto-stacked), animations, charts,
  tables, grouped shapes, SmartArt, non-raster media — all pushed to `report`
  (`:166–169`). Font size is a single value from the first `rPr`; per-run and
  color are lost.
- **ODP import** (`:199`) extracts frame text + images; styles/masters/animations
  dropped; font size defaults to 22 (`:253`).
- **PDF export** (`presentPdf.ts`) is true vector and faithful to the model,
  with a labelled placeholder for undecodable images (`:78`) and text clipped
  to the box (`:99`). Fonts collapse to Helvetica family (`:90`).
- **PPTX export** (`presentPptx.ts`) is a genuinely valid package (master +
  layout + theme + per-slide parts, embedded media, correct content-types).
  **Constraints:** one blank layout, no speaker-notes parts (notes are dropped
  on export ❗), no per-run formatting beyond bold/italic/size/color, fonts →
  Calibri, no transitions/animations.

| # | Constraint | Evidence | Severity |
|---|---|---|---|
| IE-1 | **Speaker notes are NOT exported** to PPTX (and not to PDF). The model stores them (`notes`) but neither exporter emits a notes part. | no `notesSlide` in `presentPptx.ts`; PDF ignores `notes` | Med |
| IE-2 | **Import loses per-run styling and color** (single font size, no color). | `:111–112` | Med |
| IE-3 | **No export fixtures / round-trip tests.** Nothing guards geometry/text preservation across export→re-import. | only test is the board-card unit test | Med |
| IE-4 | **Import report is generated but its editor-side surfacing is indirect** (via `ImportService`), not shown as a post-import panel in the workspace. | `presentImport.ts:22` | Low |
| IE-5 | **PPTX export omits the notes master**, so notes round-trip is impossible even if added later without more parts. | `:153` | Low |

The **honesty score here is already ~10** — nothing claims fidelity it lacks
(README §15.7/§15.8, `formatMatrix.ts`). The work is *widening* real support
(notes, per-run text) and *proving* it with fixtures, not correcting lies.

---

## 10 · Technical debt

- **TD-1 — 875-line editor component.** `PresentationWorkspace.tsx` holds state,
  gestures, canvas, inspector, list, export, and image IO in one file. Extract
  `SlideCanvas`, `ElementInspector`, `SlideList`, and a `useDeckHistory` hook.
- **TD-2 — Duplicated storage-read logic** in workspace (`:69`) and card
  (`PresentationCardNode.tsx:95`); a shared `usePresentBody(id)` hook would
  dedupe and centralize normalization.
- **TD-3 — Glyph-string icons** (VD-1) diverge from `components/Icons` /
  `ActionIcons`.
- **TD-4 — Hard-coded hex** (VD-5) instead of tokens.
- **TD-5 — No test seam for geometry/history** because that logic is inline in
  the component (pointer math at `:546`). Pure helpers would be unit-testable in
  the existing node vitest env.
- **TD-6 — `metadata: Record<string, unknown>`** on the meta is an untyped
  escape hatch already in place (`model.ts:298`) — fine, but note it.

---

## 11 · Existing reusable primitives (reuse before building)

The codebase is rich; the redesign should **compose these, not reinvent**:

| Primitive | Location | Reuse for |
|---|---|---|
| `SlideView` / `StaticElement` / `elementStyle` | `components/present/SlideView.tsx` | presenter view, layout previews, template thumbnails, health "focus" render |
| Toast + `confirmDialog`/`promptDialog` | `components/ui/Toaster`, `ConfirmDialog` | destructive confirms, "applied"/"reverted" feedback |
| `ToolbarDivider` (`role="separator"`) | `components/ui/ToolbarDivider` | grouping the new editor toolbar |
| `ActionIcon` / `components/Icons` | `components/ActionIcons.tsx`, `Icons.tsx` | replace glyph buttons (VD-1) |
| `ShortcutsDialog` (Ctrl+/) | `components/ui/ShortcutsDialog` | register presentation shortcuts (§17) |
| Command palette | `components/CommandPalette.tsx` | AI actions, "insert layout", present |
| `useReadOnly` / permissions | `lib/collab/useCollab`, `lib/collab/permissions.ts` | keep every new control role-aware |
| `presenceService.setEditing` | `lib/collab/PresenceService` | already wired (`:79`) |
| Design tokens `--panel/--bord/--ink/--accent/--panel2` | `styles/index.css:4` | theme-correct surfaces; kill hard-coded hex |
| `formatMatrix.ts` | `lib/registry/formatMatrix.ts` | keep import/export honesty in sync |
| jsPDF (lazy) / JSZip | already deps | PDF/PPTX export, no new deps |
| Tiptap (already a dep) | `@tiptap/*` | *option* for richer in-box text later (evaluate vs. weight) |

**No new large dependency is required** for Phases 0–2. Snapping, alignment,
history, and presenter mode are all implementable on the current stack.

---

## 12 · Recommended architecture

Evolve, don't rewrite. Four additions unlock everything downstream:

1. **A history layer (`useDeckHistory`)** — wrap `body` state in an
   undo/redo stack with **transaction boundaries**: a `begin()/commit()` pair so
   one drag = one entry, and a debounced "typing" coalescer for text. Persist on
   commit, not on every pointer move. *This is Phase 0 and the keystone.*
2. **Pure geometry/snapping/alignment modules** (`lib/present/geometry.ts`,
   `snapping.ts`, `align.ts`) — side-effect-free functions the canvas calls and
   unit tests cover directly (no DOM). Enables §5 and satisfies §26 without a
   jsdom harness.
3. **Additive model growth with a body-migration runner** — bump body `version`,
   add a `migratePresentBody(raw)` that upgrades 1→2… and **preserves unknown
   fields** (§19). Add optional fields incrementally: element `role`, `rotation`,
   `opacity`, `locked`, `hidden`, `groupId`; text `fontFamily/weight/lineHeight/
   letterSpacing/list/valign/link/styleRef`; image `alt/fit/radius/…`; deck
   `sections`, `transition`, `themeTokens`.
4. **A theme-token object** replacing the 3-enum: keep the 3 as *named presets*
   that expand to tokens (bg/surface/text/accent/fonts/scale/spacing/radius/
   chartPalette), with a migration from the enum. Text `styleRef` links elements
   to semantic styles (§6, §10).

Component decomposition: `PresentationWorkspace` → `SlideList`, `SlideCanvas`
(+ `SelectionLayer`, `SmartGuides`), `Inspector/*` (contextual panels),
`PresenterView`, `useDeckHistory`, `usePresentBody`.

---

## 13 · Prioritized implementation roadmap (summary)

Full detail in **`docs/presentation-editor-roadmap.md`**. Sequenced so
foundations precede features (mission §24):

| Phase | Theme | Why first |
|---|---|---|
| **0** | History + transactions, pure geometry seam, body-migration runner, test scaffold | Undo is the #1 gap and unblocks safe iteration |
| **1** | Canvas fundamentals: multi-select, marquee, snapping + smart guides, alignment/distribute, keyboard nudge, constrained resize, zoom controls, layer ops | "Precise for designers"; the current weakest, highest-leverage area |
| **2** | Contextual inspector + typography (font/weight/line-height/spacing/lists/valign/link) + semantic text styles | Typography is a rated 9.5 target |
| **3** | Layout system + theme tokens/brand kit + reusable components | Visual coherence, "beautiful by default" |
| **4** | Outline mode + Lattice-native content flows (from Document / from Board) | The product differentiator |
| **5** | Presenter mode + transitions | The namesake job |
| **6** | Presentation-health assistant + full a11y (keyboard canvas, alt text, reading order) | Trust & inclusivity |
| **7** | AI provider seam + assisted transforms | Assist, don't fake |
| **8** | Import/export fidelity (notes, per-run, fixtures) + performance hardening | Honesty & scale |

**Recommended immediate execution:** **Phase 0 + Phase 1 together** — deliver
undo/redo and the precision toolkit (multi-select, snapping, alignment, nudge,
zoom) as one coherent, fully-tested increment. It is self-contained, needs no
new deps, no destructive migration, and moves the three lowest scores
(reliability, canvas precision, keyboard) the most.

---

## Scorecard (1–10, evidence-based)

Scored against the mission's own bar (9.5 targets), not against "a hackathon v1."
This is deliberately strict.

| Dimension | Score | Rationale (evidence) |
|---|---:|---|
| First-use experience | 4.5 | Real editor + honest empty state, but blank slides, no templates/outline, no tour (`ModeWorkspaces.tsx:206`) |
| Slide creation speed | 4.0 | Add/dup/reorder exist but reorder is ↑/↓ only, slides start empty, no layouts (`:288`,`:369`) |
| Canvas precision | 3.0 | Single-select, one-corner resize, **no snapping/guides/nudge/align** (`:546`,`:652`) |
| Typography | 3.0 | size/bold/italic/align/color only; no family/weight/leading/lists/styles (`:728`) |
| Layout tools | 1.5 | No layout system; one JS title helper (`presentModel.ts:100`) |
| Visual polish | 4.5 | Clean chrome & tokens, but glyph icons, 3 flat themes, thin type (`:397`, VD-3/4) |
| Consistency | 6.5 | Strong app-wide system reused; local hex + glyphs break it (VD-1/5) |
| Accessibility | 4.0 | Chrome accessible; **canvas not keyboard-operable, no alt text** (A11Y-1/2) |
| Keyboard workflow | 2.5 | Only Del/Esc; no nudge/undo/dup/present/palette (`:127`) |
| Presentation mode | 0.5 | **Does not exist** (🧪 grep) |
| Import/export | 7.0 | Honest, correct, real vector/OOXML; loses notes & per-run, no fixtures (IE-1/2/3) |
| Reliability | 4.0 | Correct & typed, but **no undo**, non-atomic drags (UX-1, IX-4) |
| Performance | 6.0 | Fine now; full-deck re-serialize + base64 images + unmemoized list risk scale (PF-1/2/4) |
| Responsiveness | 5.0 | Auto-fit canvas works; fixed 44/56px panels + no manual zoom crowd laptops (`:265`,`:695`) |
| Collaboration readiness | 6.5 | Inherits presence/permissions/CRDT-node serialization; body sync is save-granular, no element presence (`:79`, README §15.12) |
| **Overall (presentation workspace)** | **4.2** | *Reliable, honest, minimal v1 with a clean model — far from the 9.5 bar, but not blocked by its architecture.* |

---

## Appendix · Highest-severity issues, full detail

Each with evidence · affected files · severity · user impact · proposed
solution · complexity · acceptance criterion (mission §1 format).

### ISS-1 — No undo/redo (non-destructive editing) · **Critical**
- **Evidence:** `PresentationWorkspace.tsx` holds `body` in `useState` and
  replaces it wholesale in `apply()` (`:93–106`); `Del` deletes at `:136`; no
  history structure exists anywhere in `src/lib/present`.
- **Affected:** `PresentationWorkspace.tsx`, `presentModel.ts` (new
  `lib/present/history.ts`).
- **User impact:** any misdrag/delete/theme change is unrecoverable; users
  cannot explore edits safely. Violates product principles 6 & 12.
- **Solution:** `useDeckHistory` with `begin()/commit()` transaction boundaries;
  Ctrl/Cmd+Z / Shift+Z; coalesce text typing; persist on commit. Bounded stack
  (e.g. 100).
- **Complexity:** M. **Acceptance:** every mutation (insert/delete/move/resize/
  style/reorder/theme/background) is undoable and redoable; one drag = one undo
  step; typing a word = one step; undo restores exact geometry (unit-tested).

### ISS-2 — No presenter mode · **High** (namesake gap)
- **Evidence:** no `requestFullscreen`/keyboard slideshow (🧪 grep, 0 hits);
  README §15b lists it as Phase 9 `LAT-9`.
- **Affected:** new `components/present/PresenterView.tsx`; `SlideView` reused.
- **User impact:** cannot actually present; export-to-PDF is the only path.
- **Solution:** full-screen single-window presenter: arrow/space/click nav,
  black screen (B), Esc exit, current+next preview, speaker notes, timer,
  `prefers-reduced-motion` aware. Second-screen later.
- **Complexity:** M. **Acceptance:** F5/Present enters full-screen from slide 1;
  ←/→/Space/click navigate; notes+timer+next-slide show; Esc exits; no editing
  chrome; reduced-motion respected.

### ISS-3 — Canvas not keyboard-operable + no alt text · **High** (a11y)
- **Evidence:** elements are `<div>`s with pointer-only handlers (`:607`);
  images `alt=""` with no model field (`SlideView.tsx:60`, `presentModel.ts:37`).
- **Affected:** `SlideCanvas`, `ElementInspector`, `presentModel.ts` (add
  `alt`), `SlideView.tsx`.
- **User impact:** keyboard/AT users cannot build or read decks; exports carry
  no alt. WCAG 2.1.1 / 1.1.1 failures.
- **Solution:** roving-tabindex element focus, Enter to edit, arrows to
  move/resize, Tab order = reading order; `alt` field + inspector control + a
  reading-order inspector; carry alt into PPTX `descr`.
- **Complexity:** M. **Acceptance:** every element reachable & movable by
  keyboard; alt text authorable, persisted, and exported; reading order editable.

### ISS-4 — No snapping / alignment / nudge (precision) · **High**
- **Evidence:** `beginGesture` is raw clamp math, no snap targets (`:546–563`);
  keydown ignores arrows (`:127`); no alignment UI.
- **Affected:** new `lib/present/snapping.ts`, `align.ts`, `geometry.ts`;
  `SlideCanvas` (guide overlay), inspector (align buttons).
- **User impact:** placement is eyeballed; decks look sloppy; slow precise work.
- **Solution:** snap to slide center/edges + element edges/centers + equal
  spacing with transient smart guides; arrow nudge (1px) + Shift (10px);
  align L/C/R/T/M/B + distribute H/V + tidy.
- **Complexity:** M–L. **Acceptance:** dragging shows guides and snaps; arrows
  nudge selection; alignment/distribution operate on multi-select; all geometry
  helpers unit-tested.

### ISS-5 — Full-deck re-serialize + base64 images · **High at scale**
- **Evidence:** `persistPresentBody` writes the whole body each flush
  (`useStore.ts:1362`); images are inline data-URLs (`:190`, `presentModel.ts:39`).
- **Affected:** store persistence, model (optional `assetId` for images),
  history commit boundary.
- **User impact:** large image decks stutter and bloat sync; approaches the
  §21 targets poorly.
- **Solution:** persist on transaction commit (not per-move); consider
  `assetId`-referenced images via the existing `AssetRegistry`, keeping
  data-URL as fallback for portability; memoize slide-list thumbnails.
- **Complexity:** M. **Acceptance:** a 40-slide/image deck stays interactive;
  no full re-encode mid-drag; thumbnails memoized.

---

*End of audit. Proceed to `docs/presentation-editor-roadmap.md` for the phased
plan, then to implementation of Phase 0 + 1.*
