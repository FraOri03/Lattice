# Dashboard visual specification — Phase 13.2

What the new dashboard looks like, precisely enough that 15.1 can build it
without opening the prototype, and that the next prototype pass has nothing
left to invent.

The `UI Board Mockup` prototype already proves most of it: both themes off one
token map, kind-specific preview placeholders instead of fake screenshots,
`SyncState` as one component with eight states that each pair a shape with a
word, and five sections that explain their own failures in prose. This document
pins down what it leaves open — density, the two card anatomies, the state
matrix, the 390 px contract — and corrects three places where it invents a
vocabulary the app already has.

Companion documents: [dashboard-ia-phase-13-1.md](dashboard-ia-phase-13-1.md)
(destinations, scoping, URL) and
[responsive-audit-phase-12.md](responsive-audit-phase-12.md) (the tier model
this reuses).

---

## 1. Density is the shipped tier model

The prototype invents four thresholds of its own: a "tablet 834" frame, a
measured `stageW < 1150` that thins the child pages, a `showTopExtras >= 1000`
that hides search and avatars, and a separate 390 px phone. The app already
ships four tiers in `src/lib/layout/tiers.ts`, published as `data-tier` on the
root element by `useTierAttribute`.

**The dashboard uses those tiers. It does not add a fifth number.**

| Tier | Width | Sidebar | Top bar | Project grid | Resume rail | Row metadata |
|---|---|---|---|---|---|---|
| **Full** | ≥ 1440 | docked 240 | search field, Share, New, avatars, sync, notifications, theme, profile | 3 columns | 4 cards | full |
| **Compact** | 1100–1439 | docked 240 | avatars drop; search collapses to the palette button | 2 columns | 3 cards | full |
| **Drawer** | 768–1099 | overlay drawer + edge handle | title, New, sync, overflow menu | 2 columns | 2 cards | scope chip drops |
| **Viewer** | < 768 | overlay drawer | title + menu | 1 column, list-first | 2 cards, horizontal scroll | kind · project · time only |

The prototype's mapping is then: *Desktop 1440* = Full, *Tablet 834* = Drawer,
*Mobile 390* = Viewer. Its `>= 1000` and `< 1150` become 1100; its 834 frame is
a Drawer sample, not a tier of its own.

Grid columns are a **container** decision, not a viewport one — the sidebar
drawer changes the content box without changing the viewport, and the prototype
already measures its stage with a `ResizeObserver` for exactly this reason.
Tiers decide structure (docked vs drawer, which controls exist); the content
grid uses `auto-fill` with a 220 px minimum, as today's `Dashboard.tsx` already
does.

## 2. One mobile model, not two

`MobileNav` proposes a bottom tab bar (Home · Recent · Favorites · Profile), a
floating create button, and full-height sheets for search, notifications and
creation. It is well made, and it is a **second navigation model**: the project
surface at the same width uses the shipped Viewer tier — overlay drawer with an
edge handle, top bar folded to title + menu. A bottom bar that exists on Home
and vanishes the moment you open a project is a worse answer than a consistent
one, and phase 12 put a dedicated mobile UI out of scope on purpose.

**Decision: the dashboard at Viewer reuses the shipped shell.** The six
destinations live in the drawer, next to the project tree they already sit
beside on the desktop. No bottom bar, no floating button — New stays in the top
bar where it is at every other tier.

What `MobileNav` contributes and keeps: list-first content, rows at 48–60 px
with a 44×32 thumb, thinned metadata, and the honest per-kind note on creation
("Board — read-only with comments on mobile"), which belongs in the New menu at
every tier, not only on the phone.

If a bottom bar is wanted later, it has to arrive for every surface at once —
its own phase, not a dashboard detail.

## 3. Grid and list

The toggle exists on Recents and Starred and works; on Home it changes state and
nothing else, because Home has no list rendering and `ProjectCard` has no row.

**The toggle governs the project sections only** — Starred, Recent, Projects,
Archived. The resume rail is always a rail (it is a horizontal shortcut, not a
collection), the workspace chips are always chips, the stat tiles are always
tiles, the invite strip is always rows. A toggle that silently governs half a
page is why this one reads as broken.

One preference, shared by Home and every destination, persisted like theme and
locale: it expresses how dense a user wants their lists, not what a page is.

## 4. Card and row anatomy

Two components, each with two shapes. `EntityCard` already has both; the row is
the shape that has to be added to `ProjectCard`, and it must use the same grid
so the two never drift.

**Project card** — preview (kind placeholder, 16:10) · starred badge (top-left,
over the preview) · sync badge (top-right, over the preview) · kind icon + name
+ overflow menu · location · time · author · collaborator avatars · sync scope.

**Project row** — `44px thumb · 16px kind icon · name (min 140px, truncates) ·
location · updated · sync chip · 24px star · 24px menu`, the column template
`EntityCard` already uses, minus the selection checkbox where multi-select does
not apply.

Rules that hold in both shapes and at every tier:

- The name truncates; nothing else pushes it. Location, time and author drop in
  that order as the container narrows.
- Star and overflow are always 24 px minimum and always in the same corner.
- The sync chip is never colour alone — shape plus word, per `SyncState`.
- One card, one project: a project appears in exactly one section of Home, the
  rule `Dashboard.tsx` already applies (Starred claims first, then Recent, then
  the rest).
- The preview is a kind placeholder until a thumbnail generator exists. When one
  does, `thumbLoading` is a **card-level** property, not a page data state —
  every surface that draws a preview honours it, and the global "Thumbs loading"
  control in the prototype disappears.

## 5. The state matrix

Five states, not three. The prototype already distinguishes *empty* from
*no-results* everywhere except Home, and that distinction is worth keeping: an
empty shelf and a filter that matches nothing need different words and different
actions.

| Section | Loading | Empty | No results | Offline | Error |
|---|---|---|---|---|---|
| Home (whole surface) | skeleton | first-run | — | banner | ✓ |
| Home § each section | skeleton | ✓ | — | — | inherits |
| Recents | skeleton | ✓ | ✓ | ✓ | ✓ |
| Starred | skeleton | ✓ | ✓ | ✓ | ✓ |
| Shared with me | skeleton | ✓ | ✓ | ✓ | ✓ |
| Invites | skeleton | ✓ | ✓ | ✓ | ✓ |
| Trash | skeleton | ✓ | ✓ | **✓ (missing)** | ✓ |

**The copy pattern**, which the prototype's best strings already follow and
which every state must now follow explicitly:

> **what happened · what is still safe · what to do next**

"The local vault index failed to open. Reload the workspace — nothing has been
lost, your files are still on disk." Cause, reassurance, action. A state that
cannot name a cause is not ready to ship.

**Loading.** The skeleton mirrors the shape it replaces — card grid, row list or
rail — so nothing jumps when content arrives. It carries no text for the first
600 ms; past that it gains one line saying what is being read ("Reading the
local index…"), because a skeleton that never resolves is the one case where
silence is indistinguishable from a hang. Reduced-motion behaviour is 13.5's to
specify; the skeleton must not be the only signal.

**Offline** applies to any section whose content can live outside this device.
Trash qualifies — deletions travel to Drive and the countdown keeps running
while you are offline — so its missing offline state is a gap, not a choice.

**Error is per section, not per page**, except when the vault index itself fails,
which is the one failure that takes the whole surface.

## 6. Home owes a section-level empty state

`homeShowStates` currently replaces the entire page with one state block, so the
most common first-run shape — one project, nothing starred, no invites — has no
design. Home's sections, in order, each with what it says when it holds nothing:

| Section | Empty behaviour |
|---|---|
| Greeting + view toggle | always present |
| Resume where you left off | hidden entirely until there is a second entry — a rail of one is noise |
| Stat tiles (projects · boards · files · storage) | always present; zero is a real answer, and storage says "nothing stored yet" rather than `0 B` |
| Workspaces | hidden when the user has only the personal workspace |
| Starred | one line: what starring is for and where the star lives |
| Recent projects | hidden when Projects below already shows everything |
| Projects | the first-run empty state, with Create a project |
| Archived | hidden when empty |
| Pending invites | hidden when empty — never an empty inbox |

**Home must show every project.** The prototype shows Starred and four Recent
and stops; a workspace with twenty projects leaves fourteen of them nowhere,
which breaks the 13.1 decision that Home *is* the project index. The Projects
and Archived sections that today's `Dashboard.tsx` already renders stay.

## 7. The 390 px contract

Today's Home survives 390 px with zero horizontal overflow because it was built
fluid (audit F8). The new design inherits that as a hard property, not an
aspiration:

- No horizontal page scroll at 390 px, in either locale, in either theme.
- Fixed-column grids are the risk: the resume rail (`repeat(4, …)`), the stat
  tiles (`repeat(3, …)`) and the folder/workspace chips (`repeat(4, …)`) are all
  fixed-count in the prototype. All become `auto-fill` with a minimum, or a
  scroll rail with a snap.
- Row grids with six or more columns (Shared, Trash) collapse to thumb, name and
  one action; the rest moves into the meta line, which the prototype already
  builds.
- Two-button rows (invite accept/decline) stack rather than shrink below 24 px.
- Italian is the measuring locale, per phase 12: it costs about 70 px against
  English on a bar of controls.

## 8. Corrections to apply

Ordered by how much they change:

1. **`Lattice Dashboard.dc.html`** — Home renders a list branch for the project
   sections when `view === 'list'`; the four fixed-column grids become
   `auto-fill`; the Projects and Archived sections come back; each section gets
   its own empty behaviour from §6; the storage stat tile joins the other three;
   the tier controls become Full / Compact / Drawer / Viewer.
2. **`ProjectCard.dc.html`** — gains the row shape, sharing `EntityCard`'s
   column template.
3. **`MobileNav.dc.html`** — bottom bar, floating button and search sheet come
   out; the drawer becomes the shipped Viewer-tier drawer; the per-kind
   capability notes move into the shared New menu.
4. **`TrashPage.dc.html`** — gains the offline state.
5. **`EmptyState.dc.html`** — the loading variant takes an optional delayed line;
   skeleton shape becomes a prop (rail / grid / rows) instead of one fixed shape.
6. **All pages** — `thumb-loading` stops being a global data state and becomes a
   card property.

## Not settled here

Where each section's data comes from and how the server-backed ones present
themselves until they are real — settled in
[dashboard-data-contract-phase-13-3.md](dashboard-data-contract-phase-13-3.md),
which adds a sixth state (*unavailable*) to the five above; search and the New entry point
(13.4, #69); acceptance criteria, the EN/IT key list, focus order, live regions,
target sizes and reduced motion —
[dashboard-acceptance-phase-13-5.md](dashboard-acceptance-phase-13-5.md), which
carries the reduced-motion rule the skeleton above defers to.
