/**
 * Graph View data contract (Phase 9.5).
 *
 * A normalized, plain-serializable relationship model that is decoupled
 * from the Zustand project store. The same shapes flow from every future
 * source — LocalGraphProvider (this phase), a Supabase-backed provider, a
 * semantic/AI provider, or plugin contributions — so the renderer never
 * needs to know where a node came from.
 *
 * Graph is an automatically generated RELATIONSHIP BROWSER, not an editable
 * board: nodes mirror real Lattice entities and every edge has a typed,
 * explainable origin. Nothing here is a source of truth — it is derived
 * from project state on demand.
 *
 * This module is intentionally free of React, the store, and the DOM so it
 * can run inside the graph Web Worker and inside unit tests.
 */

/** Serialization version for {@link LatticeGraphData}; bump on shape changes. */
export const GRAPH_SCHEMA_VERSION = 1

/** Every kind of real entity a graph node can mirror. */
export type GraphEntityKind =
  | 'project'
  | 'board'
  | 'section'
  | 'note'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'code'
  | 'asset'
  | 'pdf'
  | 'image'
  | 'video'
  | 'audio'
  | 'model-3d'
  | 'web-embed'
  | 'comment'
  | 'version'
  | 'user'
  | 'tag'
  | 'github-file'
  | 'external-file'
  | 'plugin-entity'

/** Every typed, explainable relationship a graph edge can represent. */
export type GraphRelationshipKind =
  | 'references'
  | 'backlink'
  | 'contains'
  | 'belongs-to'
  | 'embedded-in'
  | 'displayed-on'
  | 'source-of'
  | 'imported-from'
  | 'linked-to'
  | 'depends-on'
  | 'parent-of'
  | 'child-of'
  | 'tagged-with'
  | 'mentions'
  | 'created-by'
  | 'edited-by'
  | 'commented-on'
  | 'version-of'
  | 'github-source'
  | 'external-source'
  | 'generated-by'
  | 'suggested-related' // reserved for Phase 9.5 AI Project Intelligence
  | 'plugin-defined'

/**
 * Which real subsystem produced an edge. Used by the inspector to explain
 * "why does this relationship exist?" and to power relationship filters.
 * Extended beyond the base set with `tag` and `ai` so tag clusters and
 * future semantic suggestions carry an honest origin.
 */
export type GraphEdgeSourceSystem =
  | 'wikilink'
  | 'backlink'
  | 'board-edge'
  | 'board-card'
  | 'embed'
  | 'asset-source'
  | 'project-hierarchy'
  | 'tag'
  | 'comment'
  | 'version'
  | 'github'
  | 'ai'
  | 'plugin'

export type LatticeGraphNode = {
  /** stable graph id, `${kind}:${entityId}` — never the visible label */
  id: string
  /** the underlying Lattice entity id used to open the native workspace */
  entityId: string
  projectId: string
  kind: GraphEntityKind
  label: string
  subtitle?: string
  icon?: string
  colorToken?: string
  size?: number
  degree?: number
  createdAt?: string
  updatedAt?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

export type LatticeGraphEdge = {
  id: string
  source: string
  target: string
  kind: GraphRelationshipKind
  label?: string
  directed: boolean
  weight?: number
  sourceSystem: GraphEdgeSourceSystem
  metadata?: Record<string, unknown>
}

export type LatticeGraphData = {
  /** schema version so persisted/worker payloads stay forward-compatible */
  schemaVersion: number
  projectId: string
  nodes: LatticeGraphNode[]
  edges: LatticeGraphEdge[]
  generatedAt: string
  /** content hash of the source snapshot — lets callers skip rebuilds */
  revision: string
  statistics: GraphStatistics
}

export type GraphStatistics = {
  nodeCount: number
  edgeCount: number
  orphanCount: number
  clusterCount?: number
}

/** Graph scope: the whole project, or a neighborhood around one entity. */
export type GraphScope = 'project' | 'local'

export type GraphLayoutKind = 'force' | 'grid-by-type' | 'radial'

export type GraphLabelMode = 'smart' | 'all' | 'selected' | 'none'

export type GraphNodeSizeMode = 'degree' | 'fixed'

/** Per-project, user-persisted graph preferences. */
export type GraphViewSettings = {
  scope: GraphScope
  layout: GraphLayoutKind
  visibleNodeKinds: GraphEntityKind[]
  visibleRelationshipKinds: GraphRelationshipKind[]
  /** local-graph traversal radius (1–5) */
  depth: number
  showLabels: GraphLabelMode
  showOrphans: boolean
  /** expose individual board card instances instead of Board → Entity edges */
  showCardInstances: boolean
  showComments: boolean
  showVersions: boolean
  /** include the Project hub node (off by default — avoids star-shaped noise) */
  showProject: boolean
  /** include entity → tag edges */
  showTags: boolean
  /** force-layout target link distance (clamped) */
  linkDistance: number
  nodeSizeMode: GraphNodeSizeMode
  /** user-pinned positions, keyed by graph node id */
  pinnedPositions: Record<string, { x: number; y: number }>
}

/** A settled 2-D position for a node, produced by the layout service. */
export type GraphNodePosition = { x: number; y: number }

export type GraphLayoutResult = {
  positions: Record<string, GraphNodePosition>
  /** whether the layout physics reached a stable state */
  settled: boolean
}
