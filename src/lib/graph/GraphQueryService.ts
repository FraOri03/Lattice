/**
 * GraphQueryService — read-only queries over a built graph for search, the
 * inspector and the accessible list view. Pure functions; no rendering.
 */
import type {
  GraphRelationshipKind,
  LatticeGraphData,
  LatticeGraphEdge,
  LatticeGraphNode,
} from './graphTypes'

export interface NodeSearchMatch {
  node: LatticeGraphNode
  score: number
}

/**
 * Rank nodes against a free-text query across label, kind, tags, subtitle
 * and file metadata (name/path/ext). Case-insensitive; empty query returns
 * nothing (search is opt-in). Never matches on the internal node id.
 */
export function searchNodes(
  nodes: LatticeGraphNode[],
  query: string,
  limit = 50,
): NodeSearchMatch[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const matches: NodeSearchMatch[] = []
  for (const node of nodes) {
    const label = node.label.toLowerCase()
    let score = 0
    if (label === q) score = 100
    else if (label.startsWith(q)) score = 80
    else if (label.includes(q)) score = 60
    else if ((node.subtitle ?? '').toLowerCase().includes(q)) score = 40
    else if (node.kind.includes(q)) score = 30
    else if ((node.tags ?? []).some((t) => t.toLowerCase().includes(q))) score = 35
    else {
      const meta = node.metadata ?? {}
      const haystack = [meta.ext, meta.mime, meta.url, meta.repo, meta.tag]
        .filter((v): v is string => typeof v === 'string')
        .join(' ')
        .toLowerCase()
      if (haystack.includes(q)) score = 25
    }
    if (score > 0) matches.push({ node, score })
  }
  matches.sort((a, b) => b.score - a.score || a.node.label.localeCompare(b.node.label))
  return matches.slice(0, limit)
}

export function outgoingEdges(data: LatticeGraphData, nodeId: string): LatticeGraphEdge[] {
  return data.edges.filter((e) => e.source === nodeId)
}

export function incomingEdges(data: LatticeGraphData, nodeId: string): LatticeGraphEdge[] {
  return data.edges.filter((e) => e.target === nodeId)
}

export interface RelationshipGroup {
  kind: GraphRelationshipKind
  direction: 'incoming' | 'outgoing'
  entries: { edge: LatticeGraphEdge; node: LatticeGraphNode }[]
}

/**
 * Neighbours of a node grouped by relationship kind and direction — the data
 * behind the inspector's "linked entities" and the accessible list view.
 */
export function groupedNeighbors(
  data: LatticeGraphData,
  nodeId: string,
): RelationshipGroup[] {
  const byId = new Map(data.nodes.map((n) => [n.id, n]))
  const groups = new Map<string, RelationshipGroup>()
  const push = (edge: LatticeGraphEdge, direction: 'incoming' | 'outgoing') => {
    const otherId = direction === 'outgoing' ? edge.target : edge.source
    const node = byId.get(otherId)
    if (!node) return
    const key = `${direction}:${edge.kind}`
    let group = groups.get(key)
    if (!group) {
      group = { kind: edge.kind, direction, entries: [] }
      groups.set(key, group)
    }
    group.entries.push({ edge, node })
  }
  for (const e of data.edges) {
    if (e.source === nodeId) push(e, 'outgoing')
    if (e.target === nodeId) push(e, 'incoming')
  }
  return [...groups.values()].sort(
    (a, b) => a.direction.localeCompare(b.direction) || a.kind.localeCompare(b.kind),
  )
}

/** Human-readable phrasing of why an edge exists (inspector "Origin"). */
export function relationshipOrigin(edge: LatticeGraphEdge): string {
  switch (edge.sourceSystem) {
    case 'wikilink':
      return 'Wikilink reference in the document body'
    case 'backlink':
      return 'Backlink from another entity'
    case 'board-edge':
      return 'Connection drawn between cards on a board'
    case 'board-card':
      return 'Card placed on a board'
    case 'embed':
      return 'Asset embedded in the document'
    case 'asset-source':
      return 'Imported source file relationship'
    case 'project-hierarchy':
      return 'Belongs to the project'
    case 'tag':
      return 'Shared tag'
    case 'github':
      return 'Linked GitHub repository'
    case 'comment':
      return 'Comment thread on the entity'
    case 'version':
      return 'Saved version of the entity'
    case 'ai':
      return 'AI-suggested relationship (Project Intelligence)'
    case 'plugin':
      return 'Contributed by a plugin'
    default:
      return 'Derived relationship'
  }
}
