# Graph View — Performance (Phase 9.5)

## Principles

- **Lazy everything.** `GraphWorkspace` is `React.lazy`; the renderer, worker
  client and layout code are excluded from the main bundle. The worker starts
  lazily on first open and is one dedicated chunk.
- **Off the main thread.** The two expensive, pure operations — build
  (normalize + relationship extraction) and layout — run in
  `src/workers/graph.worker.ts`. Document editing never blocks on the graph.
- **No perpetual animation.** The force layout is computed once to a settled
  state; the canvas only redraws on interaction (pan/zoom/hover/select), not on
  a physics loop. Graph mode unmounts (and thus stops rendering) when you leave
  it.
- **Incremental & debounced.** The graph rebuilds only when the project snapshot
  changes, debounced 200 ms so a burst of keystrokes collapses into one build;
  an unchanged content **revision** skips the relayout. Only digested metadata
  is read — opening Graph never loads a rich-document / spreadsheet /
  presentation / code body.
- **Culling & caps.** The canvas culls off-screen nodes and edges, caps visible
  labels (smart mode ≈ 70, prioritised by relevance then degree), limits edge
  decoration on large graphs, and samples the minimap to ≤ ~1500 dots.

## Tiers

| Tier | Nodes | Behaviour |
| --- | --- | --- |
| Small | ≤ 500 | Full labels-on-zoom, full edge styling. |
| Medium | 501–5,000 | Smart labels, full interaction. |
| Large | 5,001–20,000 | Reduced labels, edge cap (~15k drawn), minimap sampled. |
| Extreme | > 20,000 | Fast-path only; orphans/labels reduced; search always available. |

## Measured (Node 22, vitest performance fixtures)

Synthetic connected projects (each node wikilinks ~3 earlier nodes), build +
force layout in-process. These are the DOM-free pipeline costs; the worker moves
them off the UI thread in the app.

| Tier | Nodes | Edges | Index (build) | Force layout |
| --- | --- | --- | --- | --- |
| Small | 500 | ~1,500 | ~5 ms | ~90 ms |
| Medium | 5,000 | ~15,000 | ~30 ms | ~0.6 s |
| Extreme | 20,000 | ~61,000 | ~0.12 s | ~2–6 s |

The layout uses a **uniform spatial grid** for repulsion (near-linear instead of
O(n²)), with iteration counts that scale down as node count grows. Layout is
deterministic given a seed — the same graph lays out identically across reloads.

Reproduce: `npx vitest run src/lib/graph/__tests__/performance.test.ts` (each
tier logs `index … ms, layout … ms`). Timing assertions are generous — they
guard against accidental O(n²) regressions, not exact wall-clock numbers.

## Bundle impact

Graph adds **no main-bundle weight** beyond the tiny settings decoder. Measured
from the production build:

| Chunk | Raw | Gzip | Loaded |
| --- | --- | --- | --- |
| `GraphWorkspace` (UI + renderer) | ~49.8 kB | ~15.7 kB | on first open of Graph |
| `GraphBuilder` (shared build/layout) | ~10.6 kB | ~3.1 kB | by the worker / fallback |
| `graph.worker` | ~16.7 kB | — | lazily, on first build |

## Degradation levers for large/extreme graphs

- Reduce labels (`showLabels: 'selected'` or `'none'`).
- Hide orphans and the project hub; scope to a **Local Graph** around a focus.
- Fixed node size to skip degree scaling.
- The empty/loading states surface counts so a user can narrow before rendering
  everything.
