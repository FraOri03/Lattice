# Toolbar audit — Phase 11.1.1

The inventory that has to exist before any toolbar is touched. It records what
each mode's toolbar **actually offers today**, which grammar it is written in,
and where the grammars disagree.

## Scope

**In:** inventory, a common group/divider structure, an action registry,
tooltips and accessible names, coherent active/disabled states, overflow,
responsive behaviour, keyboard navigation, i18n, tests.

**Out:** new tools, new editors, presenter mode, charts, pen/freehand, frames,
terminal, runtime, and any change to entity data models. A mode exposes exactly
what it can already do — the rule from
[limitations.md](limitations.md#board-tools) stands.

## The eight surfaces

| Surface | Component | Container | Button primitive | Actions today |
|---|---|---|---|---|
| **Board** | [CanvasToolbar.tsx](../src/components/board/CanvasToolbar.tsx) | floating pill, `role="toolbar"` + `aria-label` | bespoke inline flex-col button + `ToolMenu` | Section · Create ▸ (Note, Document, Spreadsheet, Presentation, Code) · Media ▸ (Image, Video, 3D, Photo, Link) · Comment · More ▸ (Web embed, Import) |
| **Board (viewport)** | React Flow `<Controls>` | separate cluster, bottom-left | React Flow's own | Zoom in · Zoom out · Fit view · Toggle interactivity |
| **Document** | [DocumentToolbar.tsx](../src/components/richdoc/DocumentToolbar.tsx) | `.doc-toolbar` strip, no role, no label | `.tbtn` (`TBtn` wrapper) | Undo · Redo · block-type `<select>` · Bold · Italic · Underline · Strike · Code · Link · Bullet · Numbered · Checklist · Quote · Code block · Callout · Divider · Table · Image · Asset · contextual TableControls |
| **Note (markdown)** | [DocumentView.tsx](../src/components/DocumentView.tsx) | inline header | `.icon-btn` | Write/Preview tabs · Export .md · Close |
| **Spreadsheet** | [SpreadsheetToolbar.tsx](../src/components/sheet/SpreadsheetToolbar.tsx) | `.doc-toolbar` strip, no role, no label | `.tbtn` + `ColorWell` + `.field` select | Bold · Italic · Text colour · Fill colour · Align L/C/R · Number format · +Row · −Row · +Col · −Col · peer chips |
| **Presentation** | inline in [PresentationWorkspace.tsx](../src/components/present/PresentationWorkspace.tsx) | `.doc-toolbar` strip | `.tbtn` | Text box · Image · Rectangle · Ellipse · Line · Slide background |
| **Code** | [CodeWorkspacePane.tsx](../src/components/code/CodeWorkspacePane.tsx) | — **no toolbar** | `.icon-btn` | file-name field · language `<select>` · Close (tab strip carries the rest) |
| **Photo** | [PhotoWorkspace.tsx](../src/components/photo/PhotoWorkspace.tsx) | `.icon-btn` cluster | `.icon-btn` | **Select (V)** · **Pan (H/Space)** · Camera · Light · Person · Prop · Undo · Redo · Import scene · Export scene · AI set designer |
| **Graph** | [GraphToolbar.tsx](../src/components/graph/GraphToolbar.tsx) | floating bottom-centre, no role | `.icon-btn` | Zoom out · Zoom in · Fit · Reset + live stats readout |

Two things worth reading off that table before designing anything:

- **Photo already implements the paradigm the redesign was reaching for** — an
  explicit Select/Pan pair with single-key shortcuts, followed by creation
  tools. It is the only mode that does, so it is the reference implementation,
  not a mode to be converted.
- **Shapes are not universally missing.** Rectangle/ellipse/line exist in the
  presentation editor. "Board has no shapes" is a Board gap, not a product-wide
  one — worth remembering when Phase 16 is scoped.

## Three grammars, not one

| | Board | `.doc-toolbar` family (Document · Sheet · Presentation) | `.icon-btn` family (Photo · Graph · Note · Code) |
|---|---|---|---|
| Container | rounded floating pill | full-width strip with bottom border | floating cluster / inline |
| Button | icon **+ text label**, `flex-col` | icon **or** glyph, 24×24 | icon only, 28×28 |
| Grouping | `ToolbarDivider` + split menus | `ToolbarDivider` | none |
| `role="toolbar"` | yes | no | no |
| Container `aria-label` | yes | no | no |
| Per-button `aria-label` | all | Document all · **Sheet none** | most |
| `aria-pressed` on toggles | Comment only | Document 13/18 · **Sheet none** | partial |
| Read-only behaviour | keeps the bar, hides Comment | **Sheet hides the whole bar** | n/a |
| i18n | none (hardcoded English) | none | none |
| Overflow | none | `flex-wrap` | none |

`ToolbarDivider` is the one primitive every family already shares.

### The CSS layer trap

`.icon-btn` lives inside `@layer components`; `.doc-toolbar` and `.tbtn` are
**unlayered**, so they beat every Tailwind utility regardless of specificity.
Measured in the running app on the document toolbar's block-type select, which
carries `pr-1`:

```
classes:       "tbtn h-6 cursor-pointer bg-transparent pr-1 text-xs outline-none"
paddingRight:  5px        ← .tbtn wins; pr-1 (4px) never applies
```

Every `tbtn px-2` / `tbtn px-1.5` / `tbtn w-4` in the sheet and presentation
toolbars is dead in the same way. **Choosing the layer of the unified primitive
is therefore a behavioural decision, not a cosmetic one**: moving `.tbtn` into
`@layer components` would silently switch on a dozen padding/width overrides
that have never rendered. See
[lattice-tailwind-layer-precedence](../CLAUDE.md) for the wider rule.

## Measured accessibility gaps

From the live app, not from reading the source:

| Finding | Detail | Rule |
|---|---|---|
| Toolbar targets below the minimum | the three `ToolMenu` chevrons on the board measure **19 × 45 px** | WCAG 2.2 **2.5.8** (AA, 24×24) fails on width |
| `role="toolbar"` without the keyboard pattern | the board toolbar has 8 buttons and **8 tab stops**, no roving `tabindex`, no arrow-key navigation | ARIA Authoring Practices — a toolbar should be one tab stop |
| Toggle state conveyed by colour only | sheet Bold/Italic/Align use `.is-active` with **no `aria-pressed`** | WCAG **4.1.2** |
| Missing accessible names | every sheet toolbar button has `title` but no `aria-label` — "B", "I", "+ Row" is what gets announced | WCAG **4.1.2** |
| Unlabelled toolbars | only the board's container has a role and a name | — |
| Inconsistent button heights inside one bar | board buttons render 45 px, the "More" cluster 60 px | — |

## Two dialog styles for the same job

The board asks for a URL through the app's own `promptDialog`; the document
toolbar's Link action calls **`window.prompt`**. Same interaction, two
different surfaces — the registry should route both through the app dialog.

## i18n status

**Zero toolbar strings are localised.** The i18n catalogue
([messages.ts](../src/lib/i18n/messages.ts)) currently covers the top bar,
profile menu, share dialog and the top navigation — the section tabs render in
Italian while every toolbar underneath them stays English. Normalisation is the
moment to fix that, because a registry gives one place to key the strings from.

## Proposed common contract (input to 11.1.2 / 11.1.3)

```
ModeToolbar
├── group: select        (only where a select/pan model exists — today Photo)
├── group: create        (what this mode can actually insert)
├── group: annotate      (comments, permission-gated)
└── group: integrate     (import/export/embed)
```

Every action is a registry entry, not JSX:

```ts
interface ToolbarAction {
  id: string                    // stable, testable
  group: 'select' | 'create' | 'annotate' | 'integrate'
  labelKey: MessageKey          // i18n, never a literal
  icon: ReactNode
  shortcut?: string             // shown in the tooltip, registered once
  isActive?: () => boolean      // → aria-pressed
  isDisabled?: () => boolean    // → disabled + explanation in the tooltip
  capability?: Capability       // → hidden/disabled by role
  run: () => void
}
```

Dividers are then derived from group boundaries instead of being placed by
hand, and overflow becomes "everything past the measured width folds into one
menu" — one implementation instead of `flex-wrap` in two places and nothing
anywhere else.

## Measured baseline (before the layer change)

Captured from the running app so the migration can be diffed against something
real rather than remembered. Re-measure these after the primitives move into
`@layer components` (step 11.1.2f).

| Surface | Container | Controls |
|---|---|---|
| **Document** | `.doc-toolbar` — h 33, gap 2, padding 4/8, `flex-wrap: wrap` | 18 buttons · `.tbtn` 24×24, padding 5 px, font 12 px · block select `pr-1` → **5 px**, 84.7×24 · 19 tab stops · 13/18 carry `aria-pressed` |
| **Spreadsheet** | `.doc-toolbar flex-none` — h 33, gap 2, padding 4/8, wrap | `.tbtn` 24×24 padding 5 px · `tbtn w-4` (clear colour) → **24 px wide** · `tbtn px-1.5` → padding **5 px**, widths 44/44/39/39 · `.field` select 144×24 padding 4 px — **`w-36` and `px-1` do apply** (`.field` is layered) |
| **Presentation** | `.doc-toolbar flex-none` — h 33, gap 2, padding 4/8, wrap | `tbtn px-2` → padding **5 px** everywhere: text 42×24, image 55×24, rect/ellipse/line 24×24 · icons 12 px |
| **Photo** | `.icon-btn` cluster | 28×28, radius 6 px, padding 0 |
| **Board** | floating pill — h 69, gap 4, padding 4, `nowrap` | labelled buttons 45 px tall (Web embed **60** — its label wraps), padding 12 px, font 13 px, icons 16 px · split chevrons **19×45 / 19×60**, padding 4 px, chevron icon 11 px |

The `.field` row is the control case: it is layered, so its utilities apply,
while its `.tbtn` neighbours in the same bar ignore theirs.

**What should change when `.tbtn`'s successor becomes layered** (predictions to
verify, not facts): presentation text 42→48, image 55→61, shapes 24→30; sheet
+Row/−Row 44→46 and +Col/−Col 39→41; the document select's right padding 5→4.
The two clear-colour buttons stay 24 px wide even then — `w-4` loses to
`min-width: 24px`, which is a box-model rule, not a cascade one.

## Re-measured after the Photo and Board migrations

The primitives are layered from the start, so the two migrated modes moved
onto them without disturbing the rest:

| Was | Now |
|---|---|
| Board: `role="toolbar"` with **8 tab stops** | **1 tab stop**, arrows/Home/End move inside |
| Board: split chevrons **19 × 45 px** | **32 × 41 px** — clears WCAG 2.2 SC 2.5.8 |
| Board: button heights 45 px, "Web embed" 60 px | **41 px throughout** — no label wraps to two lines |
| Board: menu triggers named "… — show all tools" | "Open card tools" · "Open media tools" · "Open import & embed tools" |
| Board: unnamed groups | `role="group"` × 3, named per semantic level |
| Photo: `.icon-btn` 28 × 28, no toolbar role | `role="toolbar"` + name, controls 32 × 32, bar height unchanged at 40 px |
| Both: hardcoded English | localised — the toolbars render as "Strumenti board" / "Strumenti foto" under `locale: 'it'` |

Unchanged, deliberately: the `.doc-toolbar` family. Re-measured after the
migration, the sheet bar is still 33 px with `.tbtn` at 24 × 24 and `tbtn
px-1.5` still computing 5 px — Document, Sheet and Presentation keep their
current rendering until their own migration step, so the predicted padding
changes above have **not** happened yet.

Screenshots were not captured: the browser pane was not displayed during the
run, so verification is by computed measurement instead.

## What the visual pass caught (and the tests did not)

Three things only showed up with the app actually running:

1. **The board pill was narrower than its own tools.** React Flow's centred
   panel is shrink-to-fit and capped the bar at 484 px while the Italian
   labels needed 539 px; the groups shrank, the controls did not, and the last
   split painted 51 px outside the rounded background. In English it fitted, so
   it only became visible once the labels were localised. Fixed by `flex-none`
   on `ToolbarGroup` (a group never squashes its own controls) and `w-max` on
   the board's root.
2. **The pressed state lost contrast.** Photo used to show the active tool as
   `--ink` on `--panel`; the primitive's `--accent` on `--accent-soft` measures
   **3.84:1 in dark and 2.38:1 in light** — under the 4.5:1 text owes, and in
   light under the 3:1 a state graphic owes. The label and the underline now
   use `--ink` (9.4:1 / 13.0:1) and the brand tint stays in the background
   wash. A regression introduced by this phase, caught before it spread.
3. **Below roughly a 1060 px window the pill is clipped** by the canvas pane
   (the bar is 539 px; the pane is the window minus the sidebar and inspector).
   Pre-existing in kind — `limitations.md` already records that panels starve
   the canvas below ~1100 px — but the longer localised labels raised the
   threshold. This is the case `ToolbarOverflow` exists for; wiring it is
   **11.1.7**.

Measured, unchanged and NOT regressions: rest-state contrast 4.79 (dark) /
4.25 (light), disabled at 0.4 opacity (exempt from 1.4.3 as an inactive
control, and lighter-handed than Photo's previous 0.3), targets ≥32 px in both
toolbars, no label wrapping at 1280/1100/1024/900 or at 125 % zoom, menus
opening upward and staying inside the viewport, and the responsive labels
collapsing at their breakpoints while `aria-label` keeps the name.

**Still open, not introduced here:** `--accent` on `--panel` is 2.99:1 in the
light theme, so the global `:focus-visible` ring sits a hair under the 3:1 of
WCAG 1.4.11 there. It affects every focusable control in the app, not just
toolbars, and fixing it means a new design token — deliberately out of scope
for a toolbar normalisation.

### Two limits of the verification environment

Not app defects, established by control experiments:

- **`Enter` activates nothing** through the automation's synthetic key events —
  the untouched theme-toggle button ignores them too. Keyboard activation stays
  covered by the unit tests.
- **`requestAnimationFrame` never fires** because the pane is not displayed
  (`document.visibilityState === 'hidden'`), so the menu's initial focus and the
  focus return after Escape cannot be observed live. Both are unit-tested.
  Arrow keys, Home/End and Escape run through plain handlers and were verified
  for real.

## Document: baseline vs migrated (11.1.5a)

Measured in the running app, against the frozen baseline above. Every
difference is classified — nothing is left as "it looks about right".

| Metric | Before | After | Verdict |
|---|---|---|---|
| Bar height · gap · padding · wrap | 33 · 2 · 4/8 · wrap | identical | unchanged |
| Buttons | 18 | 18 | unchanged |
| Control box | 24×24, padding 5 px, font 12 px, `--muted` | identical | unchanged |
| Block-type select | 84.7×24, padding-right 5 px | 85×24, padding-right 5 px | unchanged |
| Smallest target | 24 px | 24 px | unchanged |
| Tab stops | **19** | **1** | **intentional** — the toolbar is one stop, arrows move inside it |
| `aria-pressed` | 13 | 12 | **intentional** — "Insert table" was a fake toggle; inserting is not a state |
| Accessible names | 18, inherited from `title` | 19/19 explicit `aria-label` | **intentional** |
| Link prompt | `window.prompt` | the app's own prompt dialog | **intentional** — a native prompt cannot be translated, and the board already used the app dialog |
| Dead utilities | `pr-1` on the select never applied | none left | **corrected** — the value is now declared, not accidentally inherited |
| Click steals the editor's caret | no | **yes** | **regression, compensated** — see below |

The select measures 70 px in Italian because "Titolo 1" is shorter than
"Heading 1"; in English it is 85 px, i.e. the baseline. Locale, not layout.

**The regression, and the fix.** The old `TBtn` carried
`onMouseDown={(e) => e.preventDefault()}` with the comment "keep editor focus".
The first migration dropped it, so clicking **Bold** applied the mark — the
command chain calls `.focus()` — but left the caret and the visible selection
on the button. `ToolbarRoot` now takes a `preserveFocus` prop that blocks that
mousedown for its controls (never for a native `<select>`, which needs it to
open). Verified live: after clicking Italic the mark applies, focus is still
the editor and the selection is still "hello".

`.tbtn` stays for now — the bubble and floating menus in `RichTextEditor`, plus
the Sheet and Presentation toolbars, still use it. It goes in **11.1.7**.

## Note: baseline vs migrated (11.1.5b)

A note is markdown, so this bar stays four controls wide and inherits none of
the Document toolbar's formatting grammar.

| Metric | Before | After | Verdict |
|---|---|---|---|
| Write / Preview | ~24 px tall (`px-2.5 py-1 text-xs`) | 24 px (`sm`) | unchanged |
| Export · Close | 28×28 (`.icon-btn`) | 32×32 (`md`) | **intentional** — the `.icon-btn` family normalises to `md`, as Photo did; the targets grow rather than shrink |
| Header height | ~44 px | 49 px | consequence of the line above, accepted |
| `role="toolbar"` + name | none | "Note actions" | **intentional** |
| Tab stops | 4 | 1 | **intentional** |
| View switch state | background colour only | `aria-pressed` | **intentional** — it was unreadable to assistive tech |
| Close accessible name | `title` only | explicit `aria-label` | **intentional** |
| Strings | hardcoded English | EN/IT | **intentional** |

**Two sizes in one bar, on purpose.** Normalising everything to `sm` would have
shrunk two live targets from 28 px to 24 px — the wrong direction, and work
Phase 16 would have to undo for touch. So the segmented view switch keeps its
previous 24 px and the icon actions take the 32 px of their own family. `size`
is per-control precisely so a bar can hold both without forking the component.

`preserveFocus` is deliberately **off** here: nothing in this bar acts on a text
selection, so there is no caret to protect — unlike the Document toolbar.

The primitives gained one thing: `icon` is now optional, so a control that is a
word rather than a picture ("Write", "Preview") renders its label alone and the
visible text becomes the accessible name.

## Spreadsheet: baseline vs migrated (11.1.6a)

The worst surface in the audit — nothing was named, and every state was a
colour. The geometry, however, comes back byte-for-byte.

| Metric | Before | After | Verdict |
|---|---|---|---|
| Strip height · gap · padding · wrap | 33 · 2 · 4/8 · wrap | identical | unchanged |
| `.tbtn` controls | 24×24, padding 5 px | identical | unchanged |
| `+ Row` · `− Row` | 44 px | 44 px | unchanged |
| `+ Col` · `− Col` | 39 px | 39 px | unchanged |
| Number-format select | 144×24, padding 4 px | 144×24, padding **5 px** | **intentional** — 1 px, the toolbar's own scale instead of `.field`'s |
| Accessible names | **0 of 14** | 14 of 14 | **intentional** — a screen reader used to hear "B", "I", "A", "✕", "+ Row" |
| `aria-pressed` | **none** | 5 (bold, italic, three alignments) | **intentional** — state was conveyed by a background colour alone (WCAG 4.1.2) |
| Tab stops | one per control | 1 | **intentional** |
| Read-only | whole bar hidden | whole bar hidden | unchanged, deliberately |
| Strings | hardcoded English | EN/IT, number formats included | **intentional** |

The dead `tbtn px-1.5` and `tbtn w-4` utilities are simply gone rather than
revived: dropping them is why the widths land on exactly their old values.

The colour wells keep their swatch underline — `.toolbar-control` already
declares `position: relative`, so the absolutely-positioned strip needed no
special case (verified in the running app: 16×3 px, inside its button).

**Not changed, on purpose:** clicking a control still moves focus out of the
grid. `preserveFocus` would fix it, but the sheet may commit an in-cell edit on
blur, and proving that is not a normalisation task. Logged for **11.1.7**.

## Order of work

| Step | Content | State |
|---|---|---|
| 11.1.1 | this audit | **done** |
| 11.1.2a | shared primitives + tests | **done** |
| 11.1.2b | roving focus and a11y semantics | **done** |
| 11.1.2c | action registry + i18n keys (EN/IT) | **done** |
| 11.1.2d | Photo migration (reference fixture) | **done** |
| 11.1.2e | Board migration (pilot) | **done** |
| 11.1.2f | visual verification after the layer change | **done** |
| 11.1.5a | Document migration | **done** |
| 11.1.5b | Note migration | **done** |
| 11.1.6a | Sheet migration | **done** |
| 11.1.6b | Presentation migration | next |
| 11.1.6c | Code — action cluster only, no invented bar | |
| 11.1.7 | legacy CSS cleanup (`.tbtn`, `.doc-toolbar`), overflow wiring, final audit | |
