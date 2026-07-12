/**
 * Adjacency index over a built graph: degrees, orphans, connected
 * components and breadth-first neighborhood traversal (the engine behind
 * Local Graph depth). Pure and worker-safe — depends only on the contract.
 */
import type { LatticeGraphData, LatticeGraphEdge, LatticeGraphNode } from './graphTypes'

export interface GraphAdjacency {
  /** node id → neighbor node ids, following edge direction (out-links) */
  out: Map<string, Set<string>>
  /** node id → neighbor node ids, against edge direction (in-links) */
  in: Map<string, Set<string>>
  /** node id → all neighbor node ids, ignoring direction */
  undirected: Map<string, Set<string>>
  nodeById: Map<string, LatticeGraphNode>
}

function ensure(map: Map<string, Set<string>>, key: string): Set<string> {
  let set = map.get(key)
  if (!set) {
    set = new Set()
    map.set(key, set)
  }
  return set
}

export function buildAdjacency(
  nodes: LatticeGraphNode[],
  edges: LatticeGraphEdge[],
): GraphAdjacency {
  const out = new Map<string, Set<string>>()
  const inn = new Map<string, Set<string>>()
  const undirected = new Map<string, Set<string>>()
  const nodeById = new Map<string, LatticeGraphNode>()
  for (const n of nodes) {
    nodeById.set(n.id, n)
    ensure(out, n.id)
    ensure(inn, n.id)
    ensure(undirected, n.id)
  }
  for (const e of edges) {
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) continue
    ensure(out, e.source).add(e.target)
    ensure(inn, e.target).add(e.source)
    ensure(undirected, e.source).add(e.target)
    ensure(undirected, e.target).add(e.source)
  }
  return { out, in: inn, undirected, nodeById }
}

/** Degree (total touching edges, ignoring direction) for every node. */
export function computeDegrees(
  nodes: LatticeGraphNode[],
  edges: LatticeGraphEdge[],
): Map<string, number> {
  const degree = new Map<string, number>()
  for (const n of nodes) degree.set(n.id, 0)
  for (const e of edges) {
    if (!degree.has(e.source) || !degree.has(e.target)) continue
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
  }
  return degree
}

/** Node ids with no edges. */
export function findOrphans(
  nodes: LatticeGraphNode[],
  edges: LatticeGraphEdge[],
): string[] {
  const degree = computeDegrees(nodes, edges)
  return nodes.filter((n) => (degree.get(n.id) ?? 0) === 0).map((n) => n.id)
}

/** Number of connected components over the undirected graph. */
export function countComponents(
  nodes: LatticeGraphNode[],
  edges: LatticeGraphEdge[],
): number {
  const adj = buildAdjacency(nodes, edges).undirected
  const seen = new Set<string>()
  let components = 0
  for (const n of nodes) {
    if (seen.has(n.id)) continue
    components++
    // iterative DFS keeps the stack shallow for extreme graphs
    const stack = [n.id]
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      for (const nb of adj.get(id) ?? []) if (!seen.has(nb)) stack.push(nb)
    }
  }
  return components
}

export type TraversalDirection = 'in' | 'out' | 'both'

/**
 * Breadth-first neighborhood around a set of root nodes, up to `depth`
 * hops. Powers Local Graph: depth 1 = direct neighbors, etc. Returns the
 * set of reachable node ids (roots included).
 */
export function neighborhood(
  adjacency: GraphAdjacency,
  roots: string[],
  depth: number,
  direction: TraversalDirection = 'both',
): Set<string> {
  const pick =
    direction === 'in'
      ? adjacency.in
      : direction === 'out'
        ? adjacency.out
        : adjacency.undirected
  const visited = new Set<string>()
  let frontier: string[] = []
  for (const r of roots) {
    if (adjacency.nodeById.has(r) && !visited.has(r)) {
      visited.add(r)
      frontier.push(r)
    }
  }
  const maxDepth = Math.max(0, Math.floor(depth))
  for (let d = 0; d < maxDepth && frontier.length; d++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const nb of pick.get(id) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb)
          next.push(nb)
        }
      }
    }
    frontier = next
  }
  return visited
}

/** Extract the subgraph induced by a set of node ids. */
export function inducedSubgraph(
  data: LatticeGraphData,
  keep: Set<string>,
): { nodes: LatticeGraphNode[]; edges: LatticeGraphEdge[] } {
  return {
    nodes: data.nodes.filter((n) => keep.has(n.id)),
    edges: data.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  }
}
