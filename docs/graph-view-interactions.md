# Graph View — Interactions (Phase 9.5)

## Entering Graph

- **Graph tab** in the top navigation, next to Board. Graph is a *view* of the
  content, not a section: it toggles on top of whatever section you are in, and
  the tab is a toggle (`aria-pressed`), not a section selector. With **Split**
  on, Graph occupies the *second* pane, so "editor on the left, Graph on the
  right" is a normal state.
- Command palette: **Open Graph view** (`Ctrl/Cmd K` → "graph").
- Keyboard: **`G G`** (press G twice within 500 ms; ignored while typing).
- Browser history: Graph is a first-class navigable mode in the unified URL
  history system (`src/lib/nav/`) — entering Graph pushes a `?m=graph` history
  entry, so Back/Forward move in and out of it and a direct link / reload
  restores it. The mode is also persisted in the store.

## Pointer

| Action | Result |
| --- | --- |
| Hover node | Lightweight tooltip (title, kind, tags, link count, modified) + neighbourhood highlight (rest dimmed). |
| Single click node | Select → open Inspector. Stays in Graph (inspection, not navigation). |
| Double click node | Open the entity in its native workspace. |
| Ctrl/Cmd + double click | Open beside the graph (Split) where the kind supports it. |
| Drag node | Reposition; on release the node is **pinned** (persisted per project, separate from relationships). |
| Drag background | Pan. |
| Wheel / pinch | Zoom toward the cursor. |
| Click background | Clear selection. |

Opening dispatches through `GraphNavigationService`: note/document → Document,
spreadsheet → Sheet, presentation → Presentation, code → Code, board → Board,
asset → preview, web-embed → its board (or its URL), tag → focus local graph.

## Keyboard (canvas)

`↑/↓` move through all nodes · `←/→` traverse the focused node's connected
neighbours · `Enter` open · `Ctrl+Enter` open in Split · `Space` select ·
`Esc` clear · `F` fit · `+/−` zoom. The focused node is announced via an
`aria-live` region. See `graph-view-accessibility.md`.

## Inspector (right panel)

For a selected node: icon + kind, title, tags, incoming/outgoing/total link
counts, and **linked entities grouped by relationship and direction**. Actions:
open, open beside graph, focus local graph, copy link (`[[wikilink]]` where
applicable), hide from the current graph. Each relationship row **explains why
it exists** (origin + optional edge label) on hover, e.g. *"Wikilink reference
in the document body"* or *"Connection drawn between cards on a board — 'relates
to'"*.

## Filters & saved views (left panel)

Scope (Project / Local + depth 1–5), layout, link distance, label mode, fixed
node size, orphan/tag/project/card-instance toggles, per-entity-kind visibility
(grouped Knowledge / Structure / Assets / External) and per-relationship-kind
visibility. **Filters affect the data, not just the paint** — a hidden node is
removed from the visible graph, so it cannot be clicked, hovered or found by
search. All settings persist per project.

## Search

Search by title, type, tag, file name, metadata or path. Matches are
highlighted and non-matches dimmed; `Enter` focuses/centres the first result,
`Esc` clears, picking a result centres it. Search never matches on the internal
node id and never surfaces hidden nodes.

## Scopes & layouts

- **Project Graph** — the whole project. Default node types: notes, documents,
  spreadsheets, presentations, code, boards, assets, tags. Default exclusions:
  comments, versions, users, card instances, the project hub.
- **Local Graph** — the neighbourhood around a focused entity, depth 1–5,
  in/out/both. Selecting a node → "Focus local graph" enters it; "Exit local
  graph" returns. With no focus yet, the full graph is shown with a hint. The
  full Graph mode is primary; `LocalGraphPanel` is a reusable compact panel for
  embedding elsewhere (optional in v1).
- **Layouts** — Force directed (default), Grid by type, Radial from selection.
  Layout is deterministic (seeded) so the picture is stable across reloads, and
  is persisted per project.

## States

- **Loading** — "Building project graph…" with a progressive node/link count.
- **Empty** — explains why (no entities / everything filtered) and offers a way
  forward (new note, open board, reset filters). Never a blank dark canvas.
- **Error** — the specific message, **Rebuild index**, and **Open list view** as
  a reduced accessible fallback.
