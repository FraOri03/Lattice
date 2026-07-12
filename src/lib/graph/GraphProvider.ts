/**
 * GraphProvider — the seam that lets the graph be sourced from somewhere
 * other than the local store in the future without touching the renderer.
 *
 * v1 ships {@link LocalGraphProvider} (builds from an in-memory project
 * snapshot). Later phases can add a SupabaseGraphProvider (server-filtered,
 * permission-enforced), a semantic/AI provider, or plugin providers — all
 * returning the same {@link LatticeGraphData} contract.
 */
import type { GraphBuildOptions } from './GraphBuilder'
import type { GraphSourceSnapshot } from './graphSource'
import type { LatticeGraphData } from './graphTypes'

export interface GraphProvider {
  readonly id: string
  readonly label: string
  /**
   * Whether this provider can run entirely offline. Base Graph must work
   * without cloud services; only enhancement providers may require them.
   */
  readonly requiresNetwork: boolean
  buildGraph(
    snapshot: GraphSourceSnapshot,
    options: GraphBuildOptions,
  ): Promise<LatticeGraphData>
}
