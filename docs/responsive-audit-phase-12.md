# Responsive audit — Phase 12.0

The measured baseline for the adaptive shell, and the tier model the rest of
phase 12 implements. It exists to answer one question before any code moves:
**at which width does each surface stop working, and what is supposed to give
way first?**

The short version: the project surface does not fit a 1440 px laptop. Not
"degrades below 1100" — *does not fit*. At 1440 the top bar needs 1400 px in a
1200 px box and pushes 200 px of itself off the right edge of the document, so
the whole page scrolls sideways. The first thing to disappear is the breadcrumb
that says which project you are in.

---

## Method

Measured in the in-app Chromium against `npm run dev`, on the seeded local vault
(1 project, 2 boards, 4 notes; no rich documents, spreadsheets, code files or
decks), signed out, **Italian locale unless stated**, sidebar and inspector
docked, comments panel closed, no call running.

Every number is therefore the **best case**. Opening the comments panel adds
288 px of chrome; a call adds the island; the Photo and Graph sections dock more
panels than the Board does.

Widths are `document.documentElement.clientWidth` (the layout viewport), not
`window.innerWidth` — under mobile emulation the two disagree precisely when the
page overflows, which is the case under study. "Needs" is the element's
`scrollWidth`: the width its content actually asks for.

Screenshots are unavailable in this environment (the browser pane does not
composite frames), so the evidence is geometric — box widths, content widths,
and how many children fall outside their parent's box.

## The measurements

Board section, Italian, sidebar + inspector docked:

| Viewport | Page overflow | Top bar has / needs | Children off the bar | Breadcrumb | Canvas |
|---|---|---|---|---|---|
| 1920 | 0 | 1680 / 1680 | 0 | readable | 1400 |
| 1680 | 0 | 1440 / 1440 | 0 | **11 px** | 1160 |
| 1600 | **40** | 1360 / 1400 | 1 | **0** | 1080 |
| 1440 | **200** | 1200 / 1400 | 4 | 0 | 920 |
| 1280 | **360** | 1040 / 1400 | 7 | 0 | 760 |
| 1024 | **569** | 784 / 1353 | 10 | 0 | 504 |
| 834 | **241** | 594 / 835 | 4 | 0 | 314 |
| 768 | **307** | 528 / 835 | 6 | 0 | 248 |
| 390 | **615** | 150 / 765 | 10 | 0 | **0** |

Two discontinuities in that table are not noise. Between 1024 and 834 the top
bar's demand collapses from 1353 to 835 — that is Tailwind's `lg:` dropping the
eight section labels at 1024. And at 390 the canvas is not small, it is **zero**:
the sidebar and inspector are `flex-none`, the canvas is `min-w-0 flex-1`, so
the canvas is the only thing that can absorb the deficit and it absorbs all of
it.

Other surfaces, same conditions:

| Surface | Width | Result |
|---|---|---|
| Document (note open) | 1280 | overflow 377; bar 1040 / 1417; tab strip fits exactly at 1040 |
| Graph | 1280 | overflow 354; only the sidebar is docked (its three panels are opt-in) |
| Dashboard (Home) | 390 | **overflow 0** — no element wider than the viewport |
| Board, **English** | 1440 | overflow 131 (bar needs 1331) vs 200 in Italian |

## Findings

### F1 · The project surface needs 1640–1670 px

The top bar's non-shrinking content measures 1400–1429 px in Italian, so with a
240 px sidebar the page starts scrolling sideways somewhere between **1640 and
1670** — the exact pixel depends on how much the breadcrumb has already given up
by then (F2). In English the same content is 1331 px, putting the line at
**~1571**. Both are above the most common laptop width. The app is currently
sized for an external monitor, and nothing in the layout says so.

Italian costs about 70 px against English — 200 px of overflow at 1440 instead
of 131, 569 at 1024 instead of 500. That is a real effect and it will recur with
every locale added, but it is not the cause: **both locales overflow on a 1440
laptop**. Sizing the shell for the longest translation is a constraint on the
fix, not an explanation of the bug.

### F2 · The breadcrumb is the crumple zone

`ContextBreadcrumb` is the only `min-w-0` child of the header, so it is the only
one that *can* shrink — and flexbox drains it to zero before anything else gives
up a pixel. At 1680, a width where nothing overflows and the layout looks
healthy, it is already **11 px wide**. "Which project am I in" is the first
thing the shell spends.

Everything else in the bar is effectively `flex-none`: presence, realtime chip,
call, notifications, Share, comments, history, palette, sync, theme, profile.
Eleven controls that never yield, and one label that yields everything.

### F3 · The chrome is unconditional

There is **no way to hide the sidebar or the inspector**. The `collapsed` state
in the store belongs to sidebar *categories* and board *sections*; the panels
themselves have no toggle, no store field, no keyboard shortcut. On the Board
that is 240 + 280 = **520 px of permanent chrome**, before the comments panel's
288.

Read from source, the docked worst case per section:

| Section | Docked chrome | Total |
|---|---|---|
| Board | sidebar 240 + inspector 280 | 520 |
| Document / Sheet / Code | sidebar 240 + inspector 280 | 520 |
| Graph | sidebar 240 + filters 240 + list 288 + inspector 288 | **1056** |
| Photo | sidebar 240 + library 288 + timeline 288 + inspector 288 | **1104** |

The Graph and Photo panels are opt-in, so they are not in the measured table —
but a user who opens them on a 1280 laptop is left 224 px and 176 px of content
respectively.

### F4 · The responsive utilities that exist are measuring the wrong box

`src/styles/index.css` contains **no authored width breakpoint** — the only
media queries in it are `prefers-reduced-motion`. Across the entire `src/` tree
there are **18** Tailwind responsive utilities, and every one of them hides or
shows a *label*: `hidden lg:inline` on the section tabs, on Share, on the
workspace crumb, on the call button, on the realtime chip.

They are also keyed to the wrong number. `lg:` asks about the **viewport**,
while the top bar lives in a box that is 240 px narrower than the viewport — and
narrower still when a split pane is open. At exactly 1024 the media query says
"large, show all eight labels" into a 784 px box, which is the row in the table
with **ten** children hanging outside the bar. The utility fires on the window;
the constraint is the container.

This is the architectural correction phase 12 has to make: the shell's structure
can be keyed to the viewport, but anything that folds inside a box — the top
bar, every mode toolbar — has to be keyed to **its own width**, which in Tailwind
v4 means container queries.

### F5 · Below ~1060 the board toolbar leaves the canvas

Confirmed as [#47](https://github.com/FraOri03/Lattice/issues/47). The board
toolbar is 364 px and is positioned inside the canvas, which is `overflow:
hidden`: at 834 the canvas is 314 px, and at mobile widths the toolbar sits
**182 px outside** the surface that clips it. It is not scrolled off — it is cut
off and unreachable.

`useToolbarOverflow` and `ToolbarOverflow` already exist, are exported and are
unit-tested ([`Toolbar.tsx`](../src/components/ui/toolbar/Toolbar.tsx), line 396).
They have no consumer. The wiring was deliberately deferred at the end of phase
11.1 for two open questions, both still open: what a **split button** does once
it is a menu item (it loses "repeat last tool"), and in **what order** controls
fold. Both are product decisions, listed below.

### F6 · Mobile is not blocked — it is zoomed out to 39%

At 390 px the document is **1005 px** wide. With `width=device-width` in the
viewport meta and no `min-width` anywhere, a phone does the only thing it can:
scale the page to about **39%** to fit. Nothing warns, nothing degrades, nothing
refuses — the app renders its full desktop shell at roughly a third of legible
size, with a 0 px canvas behind it.

That is the one behaviour in this audit that contradicts the product's stated
ethos. Everywhere else Lattice is loud about what it cannot do — the realtime
chip, the local-vault banner, the conversion reports. On a phone it silently
pretends.

### F7 · The sidebar will not survive being touched

31 buttons in the project chrome are under 24 px in at least one dimension, and
**all 31 are in the sidebar**: the filter chips (21 px tall), the category
collapse rows (15 px), and every "new folder" / "new board" / "new document"
affordance (20 × 20). None are on the canvas.

At desktop pointer sizes this is a minor WCAG 2.2 SC 2.5.8 question — some of
them may still pass under the spacing exception, which has to be checked target
by target. It stops being minor the moment the sidebar becomes a **drawer opened
by a thumb**, which is what 12.2 does to it. The tier work inherits this, so it
is listed in the acceptance criteria rather than deferred to an a11y pass.

### F8 · The Dashboard already survives

Home at 390 px has zero overflow and no element wider than the viewport. It was
built after the shell work of 11.2 and it is fluid by construction.

So phase 12 is not "make Lattice responsive". It is **make the project surface
behave like the dashboard already does**.

---

## The tier model

Four tiers. The thresholds come from the measurements above, not from a device
list: each one is the width at which something specific stops fitting.

| Tier | Viewport | Sidebar | Inspector | Top bar | Toolbars | Split | Editing |
|---|---|---|---|---|---|---|---|
| **Full** | ≥ 1440 | docked 240 | docked 280 | all labels | inline | available | everything |
| **Compact** | 1100–1439 | docked 240 | docked 280 | icons only, right cluster folds into an overflow menu, breadcrumb keeps a floor | inline while they fit | **disabled** | everything |
| **Drawer** | 768–1099 | overlay drawer | overlay drawer | as Compact | fold into `ToolbarOverflow` | disabled | everything |
| **Viewer** | < 768 | overlay drawer | overlay drawer | title + menu | primary action only | disabled | read + comment; see below |

Why these lines:

- **1440** — the top bar must be made to fit here (F1). This is the tier
  boundary that requires the most work, and none of it is layout: it is the top
  bar giving up 250 px of intrinsic width.
- **1100** — below this the Board is left under 600 px of canvas with both
  panels docked (F3). 1024 is the familiar number but it is the wrong one: it is
  where the *viewport* is 1024 and the *content box* is 784.
- **768** — below this a docked panel and a usable editor cannot coexist at any
  ratio.

The tiers are keyed to the viewport because they decide **structure** (docked vs
drawer, one pane vs two). Everything that folds *within* a box — the top bar,
each mode toolbar, the tab strip — is keyed to its own container width instead,
for the reason in F4.

**Split is a Full-tier layout.** Two panes at 1100 px leave roughly 290 px each
once the chrome is paid for — under the width at which any editor is usable, so
allowing it there would only produce two broken panes instead of one working
one. The toggle disables below 1440 with a title that says why, which is the
behaviour `SectionTabs` already has for Presentation and Photo (`canSplit`), so
this is an extra condition on an existing rule rather than a new one.

**The sidebar keeps its 240 px down to the Drawer tier.** An icon rail at
Compact would buy ~180 px, but the deficit it would be paying down is not the
sidebar's: the 250 px that have to be found at 1440 are all in the top bar
(F1/F2), and taking them from the sidebar instead would leave the top bar just
as overcommitted while adding tooltips, a hover-expand state and an answer for
the folder tree. The rail stays available as a later refinement, not as part of
this phase.

### What "Viewer" means

Below 768 px the app stays honest rather than complete.

- **Notes and rich documents stay editable.** They are the two editors that
  genuinely work under a thumb.
- **Board becomes navigable, not editable** — pan, zoom, open a card, comment.
- **Sheet, Code and Presentation show an honest "best on desktop" panel** with
  the entity's title, a read-only preview where cheap, and a comment box.
  Monaco, the grid and the 960×540 slide stage cannot be made usable at 390 px
  and pretending otherwise is the F6 failure again, one level down.
- **Comments work everywhere.** Reading and replying on a phone is the realistic
  mobile job.

## What phase 12 has to change

| Step | Work | Closes |
|---|---|---|
| **12.1** | `lib/layout` — one tier source of truth: the thresholds, the rules that read off them (`panelsAreDocked`, `splitAvailable`, `capabilityAt`) and `useViewportTier`. Pure part unit-tested. **Shipped.** The theme side (breakpoint tokens, container-query variants) moved to 12.2, where the `data-tier` writer gives it a consumer — shipping styling affordances ahead of the code that uses them is how `useToolbarOverflow` spent a phase unwired. | — |
| **12.2** | The shell adapts: sidebar and inspector gain an open/closed state and become overlay drawers below Compact; split disabled below Full; the tab strip scrolls instead of squeezing. Sidebar targets brought to 24 px on the way. **Shipped** — built on `SidePanel`, which gained a `side` prop and the drawer behaviour rather than being duplicated. | F3, F7 |
| **12.3** | The top bar folds: breadcrumb gets a minimum, the right cluster collapses into an overflow menu, section labels keyed to the container rather than `lg:`. **Shipped** — two groups fold at two tiers, each rendered once and moved rather than duplicated behind a CSS toggle. `overflow-x-auto` on the bar is the floor under the folding, so the document can never scroll sideways again. | F1, F2, F4 |
| **12.4** | Mode toolbars fold: wire `useToolbarOverflow` on the Board first, then the other five. | F5, [#47](https://github.com/FraOri03/Lattice/issues/47) |
| **12.5** | The Viewer tier: honest panels for Sheet/Code/Presentation, board read-only, and the legacy `.tbtn` controls migrated so the bubble/block menus fold with everything else. | F6, [#48](https://github.com/FraOri03/Lattice/issues/48) |

### Acceptance for the phase

- No horizontal document overflow at **any** width from 320 px up, in both
  locales, in every section, with every optional panel open.
- The breadcrumb never renders below its floor: it truncates, it does not vanish.
- Every control that leaves the top bar or a toolbar is reachable from a menu —
  nothing becomes unreachable, which is what happens today below 1060.
- The board canvas is never narrower than 320 px at any tier where the board is
  editable.
- Below 768 px no editor renders that cannot be operated there.
- Tap targets stay ≥ 24 px (WCAG 2.2 SC 2.5.8) in the drawer and viewer tiers.

### Settled in 12.0

Three product decisions were open while this audit was being written and are now
closed; the tier table above already reflects them.

| Decision | Outcome |
|---|---|
| What survives below 768 px | Notes and rich documents stay editable; board navigable; Sheet/Code/Presentation honest panels; comments everywhere |
| Sidebar at Compact | Keeps 240 px — the 250 px come from the top bar, not from here |
| Split below 1440 | Disabled, with an explaining title, on the existing `canSplit` rule |

### Still open, and owned by 12.4

**Fold order** for each mode toolbar, and what a **split button** becomes once it
is a menu item — it loses "repeat last tool", which is the behaviour that made it
a split button in the first place. These are the two questions that deferred #47
at the end of 11.1. They do not block 12.1–12.3 and are best answered against a
toolbar that is already folding.

### Out of scope for phase 12

- A dedicated mobile UI. The Viewer tier is an honest degradation of the desktop
  shell, not a second product.
- The light-theme focus ring at 2.99:1, still carried from
  [phase 11.1](./toolbar-audit-phase-11-1.md). It needs a new design token and
  it is not a responsive problem.
- Touch gestures beyond what the canvas already supports.

---

See [`architecture/app-shell.md`](./architecture/app-shell.md) for the ownership
contract this phase extends, and
[`ux-ui-remediation-roadmap.md`](./ux-ui-remediation-roadmap.md) §P1.6, which
this audit supersedes with measurements.
