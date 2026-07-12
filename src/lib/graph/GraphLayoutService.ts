/**
 * GraphLayoutService — orchestrates layout for the workspace. It is a thin
 * seam over the worker client so components don't reach into the worker
 * directly, and so a future provider could supply server-computed positions
 * instead of running the local force layout.
 */
import type { GraphViewSettings, LatticeGraphEdge, LatticeGraphNode } from './graphTypes'
import type { LayoutInput, LayoutPositions } from './forceLayout'
import { graphWorker } from './GraphWorkerClient'

export interface LayoutRequest {
  nodes: LatticeGraphNode[]
  edges: LatticeGraphEdge[]
  settings: Pick<GraphViewSettings, 'layout' | 'linkDistance' | 'pinnedPositions'>
  focusId?: string | null
  seed?: string
}

/** Compute node positions for the visible subgraph (off the main thread). */
export function layoutGraph(request: LayoutRequest): Promise<LayoutPositions> {
  const input: LayoutInput = {
    nodes: request.nodes,
    edges: request.edges,
    settings: request.settings,
    focusId: request.focusId ?? null,
    seed: request.seed,
  }
  return graphWorker.computeLayout(input)
}
