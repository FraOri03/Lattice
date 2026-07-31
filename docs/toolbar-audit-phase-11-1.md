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

## Order of work

| Step | Content | State |
|---|---|---|
| 11.1.1 | this audit | **done** |
| 11.1.2 | shared primitives (`ToolbarRoot`, `ToolbarButton`, `ToolbarGroup`, overflow) | next |
| 11.1.3 | per-mode action registry + i18n keys | |
| 11.1.4 | Board migration (pilot — must keep every action and every test) | |
| 11.1.5 | Document / Note migration | |
| 11.1.6 | Sheet · Presentation · Code · Photo migration | |
| 11.1.7 | responsive, a11y, i18n and tests across all modes | |
