# Performance

Implements issue **#11**: three.js lazy-loading (`PERF-1`/`LAT-4`) and off-screen animation/virtualization (`PERF-2`/`LAT-5`). Both were High.

## PERF-1 — three.js out of the main bundle

Previously the whole of three.js (~170 kB gz) shipped in the initial `index` chunk even though only 3D previews/cards use it.

**What changed:**
- The two static `import * as THREE` sites are now behind lazy boundaries:
  - `src/components/board/ThreeScene.tsx` — the `embed3d` card scene, loaded via `React.lazy` from `cards.tsx`.
  - `src/components/preview/ThreeDViewer.tsx` — the asset model viewer, loaded via `React.lazy` from `ThreeDViewerLazy.tsx`, which every consumer (asset preview pane, doc embed block, board asset card) imports instead of the real viewer.
- `vite.config.ts` adds a `manualChunks` rule that groups `node_modules/three/**` (core + `three/addons` loaders/controls) into one dedicated `three` chunk, so the boundary is explicit and can't silently fold back into `index` via a barrel import.
- A lightweight, dimensionally-stable skeleton (`ThreePlaceholder`) shows while the chunk loads.

**Bundle measurements (production, gzip):**

| Chunk | Before | After |
|---|---:|---:|
| main `index` | **700.5 kB** (three.js inside) | **549.7 kB** |
| `three` (lazy) | — | 153.6 kB |
| `ThreeScene` (lazy) | — | 0.9 kB |
| `ThreeDViewer` (lazy) | — | 2.6 kB |
| Monaco `CodeEditor` (lazy) | 864.7 kB | 864.7 kB (unchanged) |

The main entry chunk dropped **≈ 151 kB gzip** and no longer contains three.js. Reproduce with `npm run build` and read the printed gzip column.

## PERF-2 — off-screen loops and windowing

The audit found the board unresponsive because every 3D card ran a continuous `requestAnimationFrame` + OrbitControls auto-rotate even off-screen. Fixed in `src/lib/perf/`:

- **`useInViewport`** — an `IntersectionObserver` (200 px root margin) plus a `visibilitychange` listener. Returns `onScreen`, `pageVisible` and their conjunction `active`. The observer is disconnected on unmount.
- **Full suspension.** A viewer's loop runs only while `active` — off-screen, page-hidden, or (via unmount) when the board mode isn't showing. Off-screen means **no rAF ticks and no auto-rotate**. `computeActive` / `shouldAnimate` are pure and tested.
- **On-demand asset viewer.** `ThreeDViewer` no longer runs a perpetual loop: it schedules a frame only on interaction (OrbitControls `change`), while damping settles, on resize, and when it becomes active. A still model on a still board schedules **zero frames**.
- **Concurrency cap.** `ViewerBudget` (max 4) bounds simultaneously live 3D scenes; a viewer without a slot shows a paused placeholder instead of spinning up another WebGL context.
- **Expensive media.** Video cards defer their player until first on-screen and pause a native `<video>` when it leaves the viewport.

### Windowing strategy (and why not `onlyRenderVisibleElements`)

The requirement is to virtualize **without** destructively unmounting cards that are selected, dragged, linked, or needed for visible edge routing, and **without** losing editor/CRDT state. React Flow's built-in `onlyRenderVisibleElements` unmounts off-screen nodes, which risks exactly that.

Instead this is **content-windowing**: the lightweight card chrome always stays mounted (so edges compute, selection persists, and layout never shifts — a stable placeholder holds every un-mounted body), while only the **heavy content** (3D scenes, video players) suspends when off-screen. Card previews read from the store/`StorageProvider`, and the real editors live in the workspace panes bound to Yjs — so mounting/unmounting a card body never loses editor or CRDT state.

**Result:** a 100+ card board stays interactive (verified at the store level with 120 cards), and a static board with no visible 3D runs no animation loops — CPU is idle.

## Tests

`src/lib/perf/viewerBudget.test.ts` (cap, release/cleanup, waiter notification, the pure animate decision), `src/lib/perf/useInViewport.test.tsx` (observe on mount, disconnect on unmount), `src/components/preview/ThreeDViewerLazy.test.tsx` (off-screen → placeholder, three.js not loaded).

## Known limitations

- In an environment that reports the tab as permanently hidden (some headless/embedded panes), `document.hidden` stays true, so viewers correctly stay paused and the on-screen render path can't be exercised there; real visible tabs render normally.
- Windowing suspends the heaviest content (3D fully, video deferred); other card kinds keep their existing (already-light) rendering.
