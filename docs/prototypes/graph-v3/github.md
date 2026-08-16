repo: FraOri03/Lattice
branch: main
path: src/components/graph

## Last sync
date: 2026-08-15T12:06:48Z

### Updated in this project
- Read the Graph View source and docs to lift the real design language (tokens, CardColor node palette, edge dash families, kind→icon map, canvas interaction model).
- Built a redesigned Nodes/Graph mockup on those exact values — no new design system.
- Replaced all invented iconography with the real geometry from `src/components/Icons.tsx` (24×24, stroke 1.8) and the trademark from `public/favicon.svg`.
- Lifted every small caption to the system `--muted` (#97979f) so nothing sits under the contrast floor index.css sets.

## Screen map
| Screen / frame | Built from |
| --- | --- |
| All frames — colours, radii, controls | src/styles/index.css (`:root` tokens, `.btn` / `.icon-btn` / `.field` / `.insp-h`, `.side-panel-drawer`), src/types/model.ts (CARD_COLORS) |
| Canvas: nodes, edges, labels, dimming | src/components/graph/GraphCanvas.tsx, graphVisuals.tsx, src/lib/graph/graphKindMeta.ts |
| Graph strip, scope, list/legend toggles | src/components/graph/GraphWorkspace.tsx |
| Inspector (01, A, C, D, E) | src/components/graph/GraphInspector.tsx, src/components/graph/graphLabels.ts |
| Adjust popover (D) | src/components/graph/GraphFilters.tsx, docs/graph-view-data-model.md (GraphViewSettings) |
| Search (B) | src/components/graph/GraphSearch.tsx |
| Bottom controls / minimap | src/components/graph/GraphToolbar.tsx, GraphMinimap.tsx |
| Local graph bar (C) | docs/graph-view-interactions.md, LocalGraphPanel.tsx |
| Empty state (F) | src/components/graph/GraphEmptyState.tsx |
| Iconography (nodes, chrome, brand mark) | src/components/Icons.tsx, public/favicon.svg |
| Accessibility decisions | docs/graph-view-accessibility.md |
