# Global search and the New entry point — Phase 13.4

Both already exist. `src/components/CommandPalette.tsx` searches projects,
boards and entities, and carries all seven creation actions — note, document,
spreadsheet, presentation, code file, board, project — plus the utility
commands. The dashboard's job is not to build a second one; it is to stop
building a second one, and to fix the two things in the existing palette that
break the moment no project is open.

Companions: [dashboard-ia-phase-13-1.md](dashboard-ia-phase-13-1.md)
(destinations), [dashboard-visual-spec-phase-13-2.md](dashboard-visual-spec-phase-13-2.md)
(where the controls sit at each tier),
[dashboard-data-contract-phase-13-3.md](dashboard-data-contract-phase-13-3.md)
(what search can and cannot see).

---

## 1. One search, and the field is a launcher

The prototype puts two affordances side by side in the top bar: a 260 px
`Search everything…` input and, next to it, a button badged `Ctrl K`. That is
the second search this phase exists to prevent — two rankings, two empty
states, two sets of keyboard bugs, and a user who has to learn which one is
better.

**The field is a launcher.** A button styled as a field: it holds no input
state, and clicking or focusing it opens the palette with the caret already in
the palette's own input. Today's `Dashboard.tsx` already does exactly this —
its search button calls `setPaletteOpen(true)` — so this is the existing
pattern given the visual weight the landing surface deserves.

Consequences worth stating, because they are what make it one search:

- The placeholder is the palette's, in both places, so the promise is identical.
- Nothing is typed into the launcher. There is no "press Enter to search".
- At Compact and below the launcher collapses to the icon button it already is
  (13.2), and `Ctrl/Cmd+K` keeps working at every tier.

## 2. What "global" costs the current palette

Two bugs that only appear once the dashboard exists.

**Entity search is scoped to the active project.** Every entity loop filters on
`x.projectId === s.activeProjectId`, and going Home deliberately leaves
`activeProjectId` intact (`applyNav` does not tear the project down). So from
the dashboard the palette silently searches *the last project you happened to
open* while presenting itself as global. Boards have the same filter. Projects
are already searched globally, which is why the inconsistency has gone
unnoticed.

**On the dashboard, search covers every project the device holds.** Each result
names its project, and names its workspace too when that differs from the
active one. Inside a project the palette keeps a project-first order — you are
somewhere, and the thing you want is usually here — but it no longer *hides*
the rest: matches from other projects rank below, under their own header.

**Search reaches what this device holds.** A project that lives only in someone
else's Drive folder and has never been opened here is not searchable, because
its data is not present (13.3). When Drive is connected the no-results state
says so in one line rather than implying the thing does not exist.

## 3. Ranking

`includes()` in insertion order is not a ranking. Four tiers, applied to the
item's display name:

1. exact match
2. name starts with the query
3. any word in the name starts with the query
4. the query appears anywhere

Within a tier: recently opened first (the palette already knows), then the
active project's items, then alphabetical. Ties between an action and a thing
break **toward the thing** — a document you already made is more specific than
a command that would make another.

**Sections are ordered by their best-scoring member**, not by a fixed list.
This is what stops seven `New …` actions from burying the document you are
looking for whenever your query starts with "new". Headers stay in place;
their order follows the results.

Caps: five per section, twenty overall. Narrowing is done by typing, never by
paging.

## 4. What the palette offers with an empty query

The zero-query state is the palette's real home screen, and on the dashboard it
is the fastest route to everything the IA added:

| Section | Contents |
|---|---|
| Recently opened | the six most recent entries, resolved (already built) |
| Create | the seven creation actions, in the order the New menu uses |
| Go to | Home · Recents · Starred · Shared with me · Invites · Trash |
| Workspace | switch workspace (each one named) |
| Settings | theme, shortcuts, Drive, GitHub, share |

The **Go to** section is new and comes straight from 13.1: five destinations
arrived, and the palette is their keyboard route.

## 5. No results is a place to act, not a dead end

Today: *"Nothing matches “x”"*. It becomes three things:

- the query, quoted, so a typo is visible;
- the scope, when it is not everything — "nothing on this device matches" with
  the Drive line from §2 when it applies;
- **create with this name**: `Create note “quarterly review”`, and the same for
  document and board. A search that failed has already told us what the user
  wanted to call the thing.

## 6. The New entry point

**One list, two places.** The New menu and the palette's Create section render
from the same source, in the same order:

Project · Board · Document · Markdown note · Spreadsheet · Presentation · Code
file · — · Link a GitHub repository

No "New folder" on the dashboard: folders are per project and per category
(13.1), so they are created where they live.

**Every creation names its destination.** This is the decision the prototype
leaves open, and the code makes it urgent: `createNote()` files into
`get().activeProjectId`, so "New note" from Home lands in whatever project was
last open — invisibly, with no way to tell before or after.

| Where you are | What New does |
|---|---|
| A project surface | creates in that project; the menu header names it ("Create in Acme Rebrand") |
| The dashboard | the entity items open a **target picker**, pre-filled with the most recently opened project and confirmable with one keystroke; the created entity then opens there, which is also the answer to "where did it go" |
| The dashboard, one project only | the picker is pre-resolved and shown as a named header rather than a step |
| The dashboard, no projects | the entity items are disabled with the reason, and New project is the only live item |

**New project** is always available and always lands in the active workspace,
which the header names. It never silently creates a workspace, and — per 13.1 —
switching workspace never creates a project either.

**Per-kind capability notes** ("Board — read-only with comments on mobile") are
the prototype's mobile sheet copy, and they belong to the kind, not to the
phone: they show at Viewer tier in whichever surface the menu is rendered.

## 7. Mobile

The same palette, presented as a sheet. `MobileNav`'s search sheet — its own
pool, its own `includes()` filter, its own empty state — goes away; that is the
third ranking this phase is meant to prevent. New opens the same list as a
sheet, from the top bar, since 13.2 removed the floating button.

## 8. Corrections to apply

**Prototype**

1. The top-bar search field becomes a launcher; the separate `Ctrl K` button
   merges into it (one control, showing the shortcut).
2. Draw the palette. It is the surface this sub-phase is about and it appears
   nowhere in the mockup: zero-query state, results with project and workspace
   attribution, section headers, no-results with create-from-query.
3. `New project` joins the New menu (`newProjectBtnStyle` exists and is never
   rendered), and the mobile create sheet gains it too.
4. The New menu grows a target line on the dashboard.
5. `MobileNav`'s search sheet is replaced by the palette in a sheet.

**Code, for 15.3**

6. Entity and board search stop filtering on `activeProjectId` when the surface
   is the dashboard; results carry project attribution either way.
7. Ranking replaces insertion order.
8. `Go to` commands for the five destinations, once they exist.
9. Creation from the dashboard resolves a target instead of inheriting
   `activeProjectId`.

## Not settled here

Focus order inside the palette, `role`/`aria-activedescendant` semantics for the
result list, the announcement when results change, and the EN/IT keys for every
string above — all in
[dashboard-acceptance-phase-13-5.md](dashboard-acceptance-phase-13-5.md). The
palette today is a plain overlay with no dialog role and no listbox semantics,
so this is not a formality.
