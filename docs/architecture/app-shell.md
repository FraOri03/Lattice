# Application shell — the ownership contract

Who owns what in the shell, and which state the URL is allowed to define. It
exists to answer one question before the code does: *when two places could hold
the same fact, which one is the truth?*

```
Surface
├── Dashboard          — no project open
└── Project
    ├── Toolbar        — per mode, what this editor can really do
    ├── Tabs           — the open entities of this project, every section (11.3)
    ├── Workspace      — the editor(s) for the active section
    └── Inspector      — properties of the current selection
```

## Ownership

| Concern | Owner | Notes |
|---|---|---|
| The URL contract | [`lib/nav/navUrl.ts`](../../src/lib/nav/navUrl.ts) | pure: serialize · parse · resolve · key. No React, no store import. |
| Browser history | [`lib/nav/useUrlHistory.ts`](../../src/lib/nav/useUrlHistory.ts) | **the only place that calls `pushState`/`replaceState`.** Mounted once. |
| Where that "once" is | `AppShell` in [`App.tsx`](../../src/App.tsx) | history, global shortcuts, collaboration and the overlays mount **above** the surface switch — inside a surface they would unmount on the way to the other one. |
| Surface · project · board · mode | `useStore` | written as one transaction by `applyNav`. |
| The open entity | `useStore.tabSessions` | one session per project: the open entities and which is active. **The single source of truth since 11.3** — the URL serialises from it, and hydration prunes it. |
| What is open, read | [`lib/tabs/openEntity`](../../src/lib/tabs/openEntity.ts) | `useOpenId('doc')` / `useOpenEntity()`. The `active*Id` fields no longer exist (11.3.5). |
| Split layout | [`store/workspaceLayoutStore.ts`](../../src/store/workspaceLayoutStore.ts) | UI-only. Deliberately not persisted. |
| Selection, scroll, panel toggles | the components themselves | never navigation. |
| Toolbars | [`components/ui/toolbar`](../../src/components/ui/toolbar) | primitives; each mode composes them. |

## What the URL owns

The URL defines **where you are**, never **what you are looking at in detail**.

| In the URL | Not in the URL |
|---|---|
| the surface (dashboard = no params) | card selection, cursor, scroll |
| `p` — project | which panels are open |
| `m` — section, or `split` for the layout | the secondary pane's content |
| `b` — board | in-flight editor state |
| `e` — `<kind>.<id>`, the single open entity | anything a reload should not restore |

Two consequences worth stating plainly:

- **`navSurface` is not persisted.** The URL owns it. That is exactly what makes
  *"refresh inside a project returns to that project"* and *"the bare root URL is
  Home"* both true without a special case anywhere.
- **The split layout is not restored** from a link. `m=split` survives as a
  legacy token so old links resolve, but the layout store does not persist, and
  a restored `m=split` opens the Board beside the primary pane. An honest
  degradation beats a guess.

## The single-writer rule

```
store change ──▶ useUrlHistory ──▶ history.pushState
popstate     ──▶ useUrlHistory ──▶ store.applyNav
load/refresh ──▶ useUrlHistory ──▶ store.applyNav
```

Nothing else writes history, and `applyNav` is the only action that applies a
whole navigation at once. A `navKey` dedup keeps the stream of ordinary store
writes — typing, dragging, selecting — out of the history stack.

If a component ever needs to "navigate", it calls a store action. It does not
touch `location` or `history`.

## The hazard this document exists for — and how 11.3 closed it

The store used to hold **six independent entity slots** — `activeNoteId`,
`activeDocId`, `activeCodeId`, `activeSheetId`, `activePresentId`,
`activeAssetId` — that nothing reconciled, while the URL carried exactly **one**
open entity. They agreed only because every `open*` helper cleared the other
five by hand. Six chances to forget, and one was already taken: `openNote` left
`activePresentId` set.

Since **11.3.2** the truth is one place: a project's `TabSession` holds the open
entities and which one is active. **11.3.5** finished the job by deleting the six
fields outright — a projection kept in state is a second source of truth one
`set()` away, and keeping it in step is work someone has to remember. What is
open is now *read*:

> **There is no `activeDocId`.** Open, close and focus go through the session
> ([`lib/tabs/tabSession.ts`](../../src/lib/tabs/tabSession.ts) and the
> `with*Tab` helpers in the store); components ask
> [`openEntity`](../../src/lib/tabs/openEntity.ts) — `useOpenId('doc')`,
> `useOpenEntity()` — and services use its pure form.

That is what makes the classic bug unreachable: there is no slot left to survive
a closed tab, so no section can reopen an entity nobody has open. Removing the
fields also flushed out the last two places still writing them by hand —
`closePresent`, which 11.3.2 had missed, and `documentPaneFor`, whose whole
priority order existed to referee slots that can no longer disagree.

`codeTabs` — a code-only list that duplicated the same fact — folded into the
session in the v4 → v5 migration, together with whatever the slots held, so no
one's open file was lost on the way in.

What the session is *not*: it is per project and persisted, while the URL still
carries a single entity. A link says which tab is **active**, never which tabs
exist — so opening a deep link focuses that entity and leaves the rest of the
strip alone, and a link with no `e=` focuses nothing without closing anything.

Both directions read the session and nothing else. `currentNav` serialises the
active tab (11.3.4); it does **not** walk the six slots looking for one that is
set, which is what it used to do. And because sessions are persisted while the
vault can move underneath them — a file deleted in another browser, a different
export restored — hydration runs `pruneTabSessions`: a tab pointing at nothing
is dropped there, at the source. The strip already refused to draw ghosts, but
"next tab" would have happily focused one.

The strip that shows it belongs to the **project**, not to a section: a note, a
spreadsheet and a code file sit side by side, and selecting one takes you to the
section it lives in. Its keys all carry Alt, because `Cmd/Ctrl+W` belongs to the
browser and cannot be borrowed — `Ctrl/⌘+Alt+PageDown` / `PageUp` move along the
strip and `Ctrl/⌘+Alt+W` closes the current tab. PageUp/PageDown and W were
chosen over brackets or arrows so the chord needs no AltGr on an Italian layout
and does not collide with the screen-rotation shortcut some Windows graphics
drivers still bind to `Ctrl+Alt+Arrow`.

It is drawn **whenever a project is open**, empty session included. Hiding it
until something was open made it invisible on the path most people take —
Home, then a project, which lands on the Board section with nothing open — and
it read as a missing feature rather than as an empty one. Empty, it is not a
`tablist` (a tab list with no tabs is a control a screen reader announces and
then cannot enter) but a line of text in the same box, so the workspace below
does not shift by a row when the first tab arrives.

## Adding something navigable

1. Can a reload legitimately restore it? If no, it is UI state — stop here.
2. Add it to `NavState` and to `serializeNav` / `parseNav` / `navKey`.
3. Give `resolveNav` a **degradation** for the invalid case. There is no
   "guess something reasonable" fallback: an unknown project resolves to the
   dashboard, not to a different project.
4. Extend `applyNav` so the whole state lands in one transaction.
5. Test the round trip *and* every degradation.

## Anti-patterns

| Don't | Because |
|---|---|
| `history.pushState` outside `useUrlHistory` | two writers, and the dedup stops working |
| persist `navSurface` | the URL and storage would disagree on the first deep link |
| write `activeDocId` (or any of the six) | they are derived from the tab session; writing one re-creates the second source of truth 11.3 removed |
| put selection or scroll in the URL | Back/Forward would step through micro-interactions |
| a fallback that picks a *different* project | landing somewhere unrequested is worse than landing Home |

## Status

| Piece | State |
|---|---|
| Surface model, URL contract, history binding | **done** (11.0) |
| Per-mode toolbars on shared primitives | **done** (11.1) |
| Dashboard screen | **done** (11.2) — `AppShell` switches on `navSurface`; recents resolved cross-project in [`lib/recents`](../../src/lib/recents/resolveRecents.ts) |
| Tab sessions | **done** (11.3.1–11.3.2) — the model, and the store built on it |
| The six `active*Id` slots | **retired** (11.3.5) — gone from state; what is open is read from the session |
| Tab strip UI | **done** (11.3.3) — one strip per project above the workspace, in [`EntityTabStrip`](../../src/components/shell/EntityTabStrip.tsx) |

See also [navigation.md](../navigation.md) for the URL examples and the
degradation table, and [toolbar-audit-phase-11-1.md](../toolbar-audit-phase-11-1.md)
for the toolbar grammar.
