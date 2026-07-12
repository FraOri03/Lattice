/**
 * LocalGraphProvider — the default, offline provider. It builds the graph
 * from an in-memory project snapshot via the worker (with a main-thread
 * fallback). No network, no cloud services required.
 */
import type { GraphProvider } from './GraphProvider'
import type { GraphBuildOptions } from './GraphBuilder'
import type { GraphSourceSnapshot } from './graphSource'
import type { LatticeGraphData } from './graphTypes'
import { graphWorker } from './GraphWorkerClient'

export class LocalGraphProvider implements GraphProvider {
  readonly id = 'local'
  readonly label = 'Local project graph'
  readonly requiresNetwork = false

  buildGraph(
    snapshot: GraphSourceSnapshot,
    options: GraphBuildOptions,
  ): Promise<LatticeGraphData> {
    return graphWorker.buildGraph(snapshot, options)
  }
}

export const localGraphProvider = new LocalGraphProvider()
