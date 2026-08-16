# Graph View — Accessibility (Phase 9.5)

Graph View is built so it does **not** repeat the Board's historical
keyboard-accessibility gap. A canvas is inherently hard for assistive tech, so
accessibility rests on two legs: a keyboard-operable canvas **and** a fully
structured list alternative that is always one click away.

## Keyboard operation of the canvas

The canvas container is `role="application"`, `tabIndex=0`, with an aria-label
explaining the controls. Focusing it selects the first node.

- `↑ / ↓` — move focus through all nodes (stable alphabetical order).
- `← / →` — traverse the focused node's **connected** neighbours.
- `Enter` — open the focused node's workspace; `Ctrl/Cmd+Enter` — open in Split.
- `Space` — select/inspect the focused node.
- `Esc` — clear selection and focus.
- `F` fit · `+ / −` zoom.

Moving focus centres the node and announces `"{label}, {kind}, {n} links"`
through a visually-hidden `aria-live="polite"` region.

## Structured list alternative

The **List view** toggle (top strip, keyboard-reachable) replaces the canvas
with a semantic, screen-reader-friendly structure: a searchable list of nodes
and, for the selected node, its relationships as headed lists grouped by
direction and kind:

```
Selected: Project Brief
Incoming · References
  - Research Notes
Outgoing · Linked on board
  - Budget Sheet
  - Brand Assets
```

Every item is a real `<button>`; the node list is a `<ul>`/`<li>`. The error
state also offers the list view as a reduced fallback, so exploration is never
fully blocked.

## Perceptual accessibility

- **Never colour-only.** Node type is encoded by **icon + shape + label**
  redundantly — boards are larger outlined nodes, tags are accent pills, and the
  legend pairs every colour with an icon and a name.
- **Reduced motion.** The layout is still static and precomputed: **no
  continuous physics, no intro or reveal animation**, and nodes appear at their
  settled positions rather than flying into them.

  19B added one deliberate movement — picking a search result or focusing a
  node flies the camera there over ~220ms instead of teleporting, so you keep
  your bearings. That means `prefers-reduced-motion` is **no longer respected
  by having nothing to animate**: `GraphCanvas.centerOn` checks the query and,
  when motion is reduced, moves the camera to its destination in a single
  frame. Any future animation in this view owes the same check — the guarantee
  is now maintained, not inherent. (The base app also neutralizes CSS
  transitions under this query.)
- **Fixed-size mode.** *Fixed node size* removes degree-based sizing so nodes are
  uniform and predictable.
- **Visible focus.** The focused node draws an accent halo; all interactive
  controls inherit the app's global `:focus-visible` outline.
- **Hit targets.** Node hit-testing adds a zoom-compensated tolerance so small
  nodes remain clickable; toolbar/filter controls use the app's standard 24–28px
  targets.
- **Announcements.** Selection/focus changes are announced via `aria-live`; the
  live stats readout is text, not colour.

## Permissions & privacy in the graph

Graph visibility follows Lattice's per-project permission model. Access control
is enforced per project (realtime room ACLs); every member of a project sees
that project's entities, and `snapshotFromState` filters strictly to the active
project so **no other project's entities, titles or counts leak** into the
graph, search, inspector or statistics. Viewer/Commenter get the same graph
visibility as Editors (Graph is read-only navigation) plus their existing
abilities; Graph never becomes a side channel to restricted entities. A future
server-backed provider must filter inaccessible data **server-side** — client
filtering is a boundary, not authorization.
