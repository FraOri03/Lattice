# Application shell — the ownership contract

Who owns what in the shell, and which state the URL is allowed to define. It
exists to answer one question before the code does: *when two places could hold
the same fact, which one is the truth?*

```
Surface
├── Dashboard          — no project open
└── Project
    ├── Toolbar        — per mode, what this editor can really do
    ├── Tabs           — open entities (Phase 11.3, not built yet)
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
| The open entity | `useStore` (`active*Id`) | **today six independent slots — see the hazard below.** |
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

## The hazard this document exists for

The store holds **six independent entity slots** — `activeNoteId`, `activeDocId`,
`activeCodeId`, `activeSheetId`, `activePresentId`, `activeAssetId` — and
`setViewMode` does **not** reconcile them. The URL, by contrast, carries exactly
**one** open entity. They agree today only because every `open*` helper clears
the other five.

That is the seam where a second source of truth gets born. The rule:

> **Never decide what is open by reading a single `active*Id`.** Derive it from
> the navigation state. When Phase 11.3 introduces tabs, the tab session becomes
> the single source and these slots must be **derived from it, then retired** —
> not maintained alongside it.

A tab strip that keeps its own list *and* leaves the slots writable will produce
the classic bug: close the tab, the slot survives, the section reopens the
entity. If both must exist during the migration, the slots are a read-only
projection of the active tab, and the tests say so.

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
| read `activeDocId` to decide what is open | it is one of six slots that are not reconciled |
| put selection or scroll in the URL | Back/Forward would step through micro-interactions |
| a fallback that picks a *different* project | landing somewhere unrequested is worse than landing Home |

## Status

| Piece | State |
|---|---|
| Surface model, URL contract, history binding | **done** (11.0) |
| Per-mode toolbars on shared primitives | **done** (11.1) |
| Dashboard screen | **done** (11.2) — `AppShell` switches on `navSurface`; recents resolved cross-project in [`lib/recents`](../../src/lib/recents/resolveRecents.ts) |
| Tabs | 11.3 — must arrive as the single source of truth for open entities |

See also [navigation.md](../navigation.md) for the URL examples and the
degradation table, and [toolbar-audit-phase-11-1.md](../toolbar-audit-phase-11-1.md)
for the toolbar grammar.
