# Graph View — Data Model (Phase 9.5)

The graph is a normalized, plain-serializable contract (`src/lib/graph/graphTypes.ts`),
decoupled from the store so it can flow from any future provider and run inside
a Web Worker. `schemaVersion` (currently `1`) versions the serialization.

## Nodes

```ts
type LatticeGraphNode = {
  id: string          // `${kind}:${entityId}` — a stable id, NEVER the label
  entityId: string    // the real Lattice entity id used to open its workspace
  projectId: string
  kind: GraphEntityKind
  label: string
  subtitle?: string
  icon?: string       // plain token → resolved to a component by the renderer
  colorToken?: string // reuses the CardColor palette (+ tag/project specials)
  size?: number       // degree-derived, clamped
  degree?: number
  createdAt?: string
  updatedAt?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}
```

Every node mirrors a **real** entity. `GraphEntityKind` covers project, board,
section, note, document, spreadsheet, presentation, code, asset, pdf, image,
video, audio, model-3d, web-embed, comment, version, user, tag, github-file,
external-file and plugin-entity.

## Edges

```ts
type LatticeGraphEdge = {
  id: string
  source: string
  target: string
  kind: GraphRelationshipKind
  label?: string
  directed: boolean
  weight?: number
  sourceSystem: GraphEdgeSourceSystem  // WHY the edge exists
  metadata?: Record<string, unknown>
}
```

Every edge has a **typed, explainable origin** (`sourceSystem`): `wikilink`,
`backlink`, `board-edge`, `board-card`, `embed`, `asset-source`,
`project-hierarchy`, `tag`, `comment`, `version`, `github`, `ai`, `plugin`.
Backlinks are not separate edges — they are simply the incoming direction of a
`references` edge, matching the "one link, viewed from both ends" model.

## Relationship sources implemented (v1)

| Source system | Extracted from | Edge kind |
| --- | --- | --- |
| `wikilink` | Note `content` `[[...]]`, `RichDocMeta.outgoingLinks`, `CodeDocMeta.outgoingLinks`, resolved by **title** (case-insensitive) | `references` |
| `asset-source` | `sourceAssetId` on doc/code/sheet/presentation | `imported-from` |
| `embed` | `RichDocMeta.linkedAssets` | `references` |
| `asset-source` | `AssetDoc.bundle.dependencies` (GLTF→BIN/textures, OBJ→MTL) | `depends-on` |
| `board-card` | Board cards referencing an entity (collapsed: Board → Entity) | `contains` |
| `board-edge` | React-Flow edges between cards, resolved to their entities | `linked-to` |
| `board-card` | Card instances + sections (when *Show board card instances* is on) | `contains` / `displayed-on` |
| `tag` | `tags[]` on any entity → shared tag node | `tagged-with` |
| `github` | `ProjectSettings.github.repo` + code docs | `github-source` |
| `project-hierarchy` | Project → every top-level entity (Project hub, off by default) | `contains` |

Web embeds become `web-embed` nodes (keyed by the embed id, carrying the URL and
board). Comments/versions/users are wired as seams (edge kinds + settings) but
disabled by default and not populated in v1 (they need collaboration data) —
this avoids activity-derived visual noise.

## Normalization guarantees

`normalizeGraph` (unit-tested) enforces:

- **Identifiers normalized** — `${kind}:${entityId}`; labels are never ids.
- **Dangling edges removed** — an edge whose endpoint node does not exist is
  dropped (so an unresolved `[[wikilink]]` never invents a node).
- **Self-loops removed.**
- **Exact duplicates deduplicated** — keyed by (source, target, kind, origin).
- **Degree + size stamped** on every node; **orphans** = degree 0.
- **Statistics** — node/edge/orphan counts and connected-component (cluster)
  count.
- **Deterministic** — identical snapshots yield an identical `revision`.

Project boundaries are explicit: `snapshotFromState` filters every entity to the
active project before the builder runs, so cross-project entities never appear.
See `graph-view-accessibility.md` and the architecture doc for how permissions
relate to this boundary.

## Settings

```ts
type GraphViewSettings = {
  scope: 'project' | 'local'
  layout: 'force' | 'grid-by-type' | 'radial'
  visibleNodeKinds: GraphEntityKind[]
  visibleRelationshipKinds: GraphRelationshipKind[]
  depth: number                 // 1–5 (clamped)
  showLabels: 'smart' | 'all' | 'selected' | 'none'
  showOrphans: boolean
  showCardInstances: boolean     // default off
  showComments: boolean          // default off
  showVersions: boolean          // default off
  showProject: boolean           // default off (avoids star-shaped noise)
  showTags: boolean              // default on
  linkDistance: number           // 30–400 (clamped)
  nodeSizeMode: 'degree' | 'fixed'
  pinnedPositions: Record<string, { x: number; y: number }>
}
```

Settings are **persisted per project** in the store and always passed through
`decodeGraphSettings`, which clamps every numeric field, validates every enum,
and drops non-finite pinned positions — corrupt or malicious persisted values
can never reach the layout or renderer.

## Extension seams (Phase 9.5 Project Intelligence)

The contract already carries `kind: 'suggested-related'` and
`sourceSystem: 'ai'` for future semantic edges, with
`metadata.confidence`/`metadata.approved`. AI edges must be visually
distinguished (a distinct dashed style is reserved) and unapproved suggestions
must never be mixed into normal project relationships. `GraphRegistry` accepts
plugin-defined node and edge kinds through the same pipeline.
