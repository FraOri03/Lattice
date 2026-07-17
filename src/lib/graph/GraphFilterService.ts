/**
 * GraphFilterService — turns the full built graph plus the user's settings
 * into the subgraph the renderer actually draws.
 *
 * A critical guarantee: filtering removes nodes and edges from the DATA, not
 * just their paint. The renderer only ever receives visible elements, so a
 * hidden node can never intercept a click or leak through search — filters
 * affect visibility and hit-testing together.
 */
import type {
  GraphEntityKind,
  GraphStatistics,
  GraphViewSettings,
  LatticeGraphData,
  LatticeGraphEdge,
  LatticeGraphNode,
} from './graphTypes'
import { buildAdjacency, computeDegrees, countComponents, neighborhood } from './GraphIndex'

export interface FilterInput {
  data: LatticeGraphData
  settings: GraphViewSettings
  /** focus node id for local scope (ignored for project scope) */
  focusId?: string | null
}

export interface FilteredGraph {
  nodes: LatticeGraphNode[]
  edges: LatticeGraphEdge[]
  statistics: GraphStatistics
  /** true when local scope was requested but no focus is selected yet */
  needsFocus: boolean
}

/** The set of node kinds that should be visible given the settings. */
export function effectiveVisibleKinds(settings: GraphViewSettings): Set<GraphEntityKind> {
  const set = new Set(settings.visibleNodeKinds)
  // dedicated toggles win over the raw kind list
  if (!settings.showProject) set.delete('project')
  if (!settings.showTags) set.delete('tag')
  if (!settings.showComments) set.delete('comment')
  if (!settings.showVersions) {
    set.delete('version')
  }
  return set
}

export function applyFilters(input: FilterInput): FilteredGraph {
  const { data, settings } = input
  const kinds = effectiveVisibleKinds(settings)
  const rels = new Set(settings.visibleRelationshipKinds)

  // A: node-kind visibility
  const kindVisible = new Set(
    data.nodes.filter((n) => kinds.has(n.kind)).map((n) => n.id),
  )
  // B: relationship-kind visibility (both endpoints must survive step A)
  let edges = data.edges.filter(
    (e) => rels.has(e.kind) && kindVisible.has(e.source) && kindVisible.has(e.target),
  )
  let nodes = data.nodes.filter((n) => kindVisible.has(n.id))

  // C: local scope — keep only the neighborhood around the focus
  let needsFocus = false
  if (settings.scope === 'local') {
    if (input.focusId && kindVisible.has(input.focusId)) {
      const adj = buildAdjacency(nodes, edges)
      const keep = neighborhood(adj, [input.focusId], settings.depth, 'both')
      nodes = nodes.filter((n) => keep.has(n.id))
      edges = edges.filter((e) => keep.has(e.source) && keep.has(e.target))
    } else {
      needsFocus = true
    }
  }

  // D: orphan visibility (relative to the already-filtered edge set)
  if (!settings.showOrphans) {
    const degree = computeDegrees(nodes, edges)
    // the focus node always survives, even with no visible links
    nodes = nodes.filter(
      (n) => (degree.get(n.id) ?? 0) > 0 || n.id === input.focusId,
    )
    const surviving = new Set(nodes.map((n) => n.id))
    edges = edges.filter((e) => surviving.has(e.source) && surviving.has(e.target))
  }

  const finalDegree = computeDegrees(nodes, edges)
  return {
    nodes,
    edges,
    needsFocus,
    statistics: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      orphanCount: nodes.filter((n) => (finalDegree.get(n.id) ?? 0) === 0).length,
      clusterCount: countComponents(nodes, edges),
    },
  }
}
