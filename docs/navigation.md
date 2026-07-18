# Navigation & URL model

Implements issue **#10** (`NAV-1` High): the SPA now has real browser Back/Forward and refreshable deep links. Split-as-mode demotion (`LAT-7` / `NAV-2` / `IA-1`) has since landed — see [Split is a layout, not a mode](#split-is-a-layout-not-a-mode). Workspace auto-hide remains out of scope.

## Navigable identity

Exactly five things define "where you are":

- **project** (`activeProjectId`)
- **section** (`viewMode`: board · doc · sheet · presentation · code · photo)
- **view** — the section's native editor, or `graph` (`viewMode === 'graph'`)
- **layout** — whether the second (split) pane is open (`workspaceLayoutStore.split`)
- **board** (`activeBoardId`)
- the single **open entity** (a doc / code / sheet / presentation / note / asset)

Transient state — card selection, drag positions, scroll, panel toggles — is deliberately **not** part of the identity, so Back/Forward move between meaningful places rather than every micro-interaction.

## The abstraction (`src/lib/nav/navUrl.ts`)

One small, pure, tested module serializes, validates and restores this state:

| Function | Role |
|---|---|
| `serializeNav(nav)` | → `?p=<project>&m=<mode>&b=<board>&e=<kind>.<id>` (or `""`) |
| `parseNav(search)` | URL search → raw params |
| `resolveNav(raw, snapshot)` | raw params + a store snapshot → a **validated** `NavState`, degrading unknown ids |
| `navKey(nav)` | canonical identity string for dedup |

`resolveNav` degrades safely: unknown project → the current one; a board that doesn't belong to the project → that project's first board; a missing entity → dropped (its mode still opens, just empty); an invalid mode → `board`; an unknown entity kind → ignored.

`applyNav` (a store action) sets project · workspace · board · mode · the one open entity in a single transaction, without the side effects of the `open*` helpers. Because bodies persist continuously (CRDT + storage), navigating never loses unsaved work.

## Wiring (`src/lib/nav/useUrlHistory.ts`)

Mounted once in the workspace:

```
store change (project/mode/board/entity) ──▶ history.pushState
Back / Forward (popstate)                ──▶ store.applyNav
direct load / refresh                    ──▶ restore from the URL (replaceState)
```

**Loop-safety:** an `applying` flag suppresses pushes while restoring from the URL, and a `navKey` dedup means only genuine navigation (not the stream of writes from typing, dragging or selecting) ever touches history.

**Invite flow preserved:** the `#invite=` hash flow is untouched — this module owns only the search string and always re-appends the current `location.hash`. Invite handling runs first (it strips its hash via `replaceState`), then history restore runs.

## Examples

| URL | Restores |
|---|---|
| `?p=proj_x&m=board&b=board_1` | project x, Board section, board 1 |
| `?p=proj_x&m=split&b=board_1&e=doc.doc_9` | document `doc_9` in the primary pane with the board beside it (split layout) |
| `?p=proj_x&m=graph&b=board_1` | the Graph view in the single pane |
| `?p=ghost&m=code` | falls back to the current project, Code section, no entity |

## Split is a layout, not a mode

Split used to be a `ViewMode` value, which made it a peer of Board/Document and
produced the "Board is three things at once" problem in the Phase 8 audit
(`IA-1`). It is now a **layout** owned by `src/store/workspaceLayoutStore.ts`,
while `viewMode` carries only the section (plus `graph`, a *view*).

**URLs did not change.** The `m=split` token is kept as the on-the-wire form of
the split layout, so every link shared before the refactor still resolves:

- **Writing** — when the split pane is open, `serializeNav` emits `m=split`
  (instead of the section) plus the usual `e=<kind>.<id>`.
- **Reading** — `resolveNav` turns `m=split` back into `split: true` and derives
  the section from the open entity (`e=doc.…` → the Document section), falling
  back to the Board when no entity is present.

**Persisted state** — a stored `viewMode: 'split'` from an older build is
migrated by the store (`lattice-vault-v1` v2 → v3) to the section it was pairing
with the board: the Document section when an editor entity was open, otherwise
the Board. The split layout itself is not restored — an explicit, honest
degradation rather than a guess (the layout store deliberately does not persist
`split` either).

**Not encoded in the URL:** which content the *secondary* pane shows (Board or
Graph). Like card selection and scroll, it is treated as transient view state; a
restored split always opens with the Board beside the primary pane.

## Tests

`src/lib/nav/navUrl.test.ts` — round-trip, `navKey` dedup, the popstate parse→resolve path, every degradation case (bad project / board / entity / mode / kind), and the `m=split` back-compatibility path (serialize → `m=split`; resolve legacy links with and without an entity; `m=graph` stays a mode). `src/store/boardActions.test.ts` covers `applyNav` restoring the project/mode/entity and no-op'ing on an unknown project. `src/store/workspaceLayoutStore.test.ts` covers the split layout itself.
