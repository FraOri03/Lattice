# Graph View — Architecture (Phase 9.5)

Lattice-native **Project Graph View**, inspired by Logseq's graph interaction
principles. Graph is an **automatically generated relationship browser** — the
counterpart to the Board, which is a **manually arranged creative workspace**.
The two are deliberately distinct and never merged.

- **Board** — you place cards by hand; positions are content.
- **Graph** — the app derives the picture from real relationships; positions
  are a view, never a source of truth.

## Role

Graph exists for relationship exploration, knowledge navigation, project
structure discovery, backlink/dependency inspection, orphan detection, cluster
exploration and semantic project understanding. It is read-only: selecting and
focusing are inspection states, not edits. Opening a node hands off to the
entity's native workspace.

## Pipeline

```
Zustand store ──selector──▶ GraphSourceSnapshot (project-scoped, plain)
                                  │
                     ┌────────────┴─────────────┐   (Web Worker, off main thread)
                     ▼                            ▼
              GraphBuilder.extractGraph     forceLayout.computeLayout
              (nodes + typed edges,          (force / grid / radial,
               dedup, degree, stats)          deterministic, seeded)
                     │                            │
                     ▼                            │
          GraphFilterService.applyFilters ◀───────┘   (main thread, cheap)
          (scope, kinds, relationships, orphans, hides)
                     │
                     ▼
              GraphCanvas (Canvas 2D)  +  Inspector · Filters · Search · List
```

- **Build** (normalize + relationship extraction) and **layout** are the two
  expensive, pure operations and run in `src/workers/graph.worker.ts`. A
  main-thread fallback (`GraphWorkerClient`) keeps unit tests and unsupported
  runtimes working.
- **Filtering** is cheap and runs on the main thread so toggling a filter never
  triggers a rebuild — only a relayout of the visible subgraph.
- The full graph is cached by a content **revision**; a burst of edits is
  debounced (200 ms) into a single rebuild, and an unchanged revision skips the
  relayout entirely.

## Provider architecture

`GraphProvider` is the seam that decouples the renderer from the data source.

| File | Responsibility |
| --- | --- |
| `graphTypes.ts` | The normalized data contract (nodes, edges, settings, stats). |
| `graphSource.ts` | `GraphSourceSnapshot` + `snapshotFromState` (project-scoped selector). |
| `GraphBuilder.ts` | Relationship extraction + normalization (dedup, dangling removal, degree, stats). |
| `GraphIndex.ts` | Adjacency, degrees, orphans, connected components, BFS neighbourhood. |
| `GraphFilterService.ts` | Turns settings + focus into the visible subgraph. |
| `GraphQueryService.ts` | Search + inspector grouping + relationship-origin phrasing. |
| `GraphSettingsService.ts` | Defaults, decode and clamping (safe against corrupt persisted values). |
| `GraphLayoutService.ts` | Orchestrates layout via the worker client. |
| `forceLayout.ts` | Clean-room Fruchterman–Reingold + grid + radial layouts. |
| `GraphNavigationService.ts` | Opens a node in its native Lattice workspace. |
| `GraphWorkerClient.ts` | Worker wrapper with a transparent main-thread fallback. |
| `GraphProvider.ts` / `LocalGraphProvider.ts` | Provider interface + the offline default. |
| `GraphRegistry.ts` | Provider registry + plugin-defined node/edge kind seams. |

UI lives in `src/components/graph/` (`GraphWorkspace`, `GraphCanvas`,
`GraphToolbar`, `GraphInspector`, `GraphFilters`, `GraphLegend`, `GraphSearch`,
`GraphMinimap`, `GraphNodeTooltip`, `GraphEmptyState`, `GraphErrorState`,
`GraphListView`, `LocalGraphPanel`, plus the `useGraphController` hook).

## Renderer decision — custom Canvas 2D + Web Worker layout

Options evaluated: PixiJS, Sigma.js, Cytoscape.js, Graphology + Sigma, and a
custom canvas/WebGL renderer. **Chosen: a custom Canvas 2D renderer with a
worker-based force layout.** Rationale:

- **Zero new runtime dependencies / zero new license surface.** Lattice is
  local-first and self-contained; adding Sigma/Graphology/Pixi would add
  dependencies (and a WebGL testing surface) for a feature that Canvas 2D
  handles well up to the medium tier and degrades gracefully beyond it. This is
  the "materially better fit" the brief allows for choosing a custom renderer.
- **Full control over the Lattice design system** — theme tokens, icons, node
  shapes, dashed edge families, reduced-motion — without fighting a library's
  styling model.
- **Trivial code-splitting.** The renderer, worker client and layout code load
  only when Graph opens (`GraphWorkspace` is `React.lazy`); the worker is its
  own chunk. Main-bundle impact is limited to the tiny settings decoder.
- **React Flow was explicitly rejected** for the main graph: it is built for
  manually positioned node editors (which is exactly what the Board already
  uses it for), not automatic relationship layout at scale.

Measured headroom (see `graph-view-performance.md`): 20,000 nodes / ~61,000
edges index in ~0.12 s and lay out in ~2–6 s in a worker, with the canvas
culling off-screen geometry and capping labels.

## Migration impact

Purely additive:

- `ViewMode` gains `'graph'` (placed after `'board'`). Document's internal value
  stays `'doc'`; only its label is "Document" — renaming it would churn
  hundreds of call sites and persisted state for no user benefit.
- The store gains `graphSettings: Record<projectId, GraphViewSettings>`
  (persisted). No persist version bump is required — the key defaults to `{}`
  and old vaults load unchanged.
- No entity models change. No data migration. Board, Split, Document, Sheet,
  Presentation, Code, command palette, history, collaboration, Drive and GitHub
  are untouched.
