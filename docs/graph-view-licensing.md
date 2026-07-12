# Graph View — Licensing & Clean-Room Note (Phase 9.5)

*This is an engineering compliance note, not legal advice.*

## Logseq as a product/behaviour reference only

Lattice's Graph View is **inspired by Logseq's graph interaction principles**.
Logseq was used as a **product and behaviour reference** — the general ideas of a
global vs. local graph, pages-as-nodes / references-as-edges, hover-to-highlight
a neighbourhood, click-to-navigate, orphan toggling, force-directed physics with
adjustable node size and link distance, and search-to-locate.

### Logseq license status

Logseq is licensed under the **GNU AGPL v3**. Its source is written in
ClojureScript and uses a Pixi-based renderer. Because AGPL is a strong copyleft
license, **no Logseq source, CSS, assets, fixtures, algorithms transcribed from
its code, or naming conventions are copied into Lattice.**

## Clean-room statement

This implementation was written independently from documented and observable
behaviour:

- **No source-code reuse.** No ClojureScript was ported, transcribed or
  paraphrased into TypeScript. No functions were ported line-by-line.
- **No CSS or visual assets** were copied. Node/edge styling is built from
  Lattice's own design tokens (`CardColor` palette, `--accent`/`--muted`/… CSS
  variables) and its existing icon set.
- **No test fixtures** were copied. All fixtures are original
  (`src/lib/graph/__tests__/fixtures.ts`).
- **No Logseq-specific variable or function names** appear in the codebase.
- The layout is an **independent implementation of the published
  Fruchterman–Reingold algorithm** (a widely documented, decades-old method),
  with a uniform-grid repulsion optimization written from scratch. No
  third-party graph-layout library was used or adapted.

The result is accurately described as: **"Lattice-native Graph View inspired by
Logseq's graph interaction principles."** No Logseq code is embedded, so no
Logseq integration is claimed.

## Renderer & dependency licenses

The renderer decision (see `graph-view-architecture.md`) is a **custom Canvas 2D
renderer with a Web Worker force layout** — deliberately chosen partly to keep
the license surface clean.

- **No new runtime dependencies were added** for Graph View. It uses only the
  browser Canvas 2D API, Web Workers, and Lattice's already-present stack
  (React 19, Zustand, Vite) — all already vetted in the project.
- Renderer libraries that were evaluated but **not** adopted, with their
  licenses, for the record:

  | Library | License | Adopted? |
  | --- | --- | --- |
  | Sigma.js | MIT | No |
  | Graphology | MIT | No |
  | PixiJS | MIT | No |
  | Cytoscape.js | MIT | No |

  (All are permissive/MIT and would have been license-compatible; they were
  declined on dependency-footprint and fit grounds, not licensing.)

## Legal review items

- Confirm the "inspired by, clean-room" framing in user-facing docs before any
  public marketing copy names Logseq.
- If a future provider embeds any third-party graph library, record its license
  here and re-check compatibility with Lattice's license before shipping.
- AGPL obligations attach to *distributing modified Logseq code*; since none is
  present, they do not attach to Lattice via this feature.
