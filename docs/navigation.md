# Navigation & URL model

Implements issue **#10** (`NAV-1` High): the SPA now has real browser Back/Forward and refreshable deep links. The Medium items in the same issue (Split-as-mode demotion, Workspace auto-hide) are intentionally **out of scope** here.

## Navigable identity

Exactly four things define "where you are":

- **project** (`activeProjectId`)
- **mode** (`viewMode`: board · split · doc · sheet · presentation · code)
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
| `?p=proj_x&m=board&b=board_1` | project x, board mode, board 1 |
| `?p=proj_x&m=split&b=board_1&e=doc.doc_9` | board 1 with document `doc_9` open beside it |
| `?p=ghost&m=code` | falls back to the current project, code mode, no entity |

## Tests

`src/lib/nav/navUrl.test.ts` — round-trip, `navKey` dedup, the popstate parse→resolve path, and every degradation case (bad project / board / entity / mode / kind). `src/store/boardActions.test.ts` covers `applyNav` restoring the project/mode/entity and no-op'ing on an unknown project.
