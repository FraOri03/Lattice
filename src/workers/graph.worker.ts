/// <reference lib="webworker" />
/**
 * Graph indexing + layout worker.
 *
 * Runs the two expensive, pure operations off the main thread so document
 * editing and the UI never block while a project graph is (re)built:
 *
 *  - `build`  — normalize entities, extract typed relationships, drop
 *               dangling edges, deduplicate, compute degrees, orphans and
 *               connected components (see GraphBuilder);
 *  - `layout` — force-directed / grid / radial positioning (see forceLayout).
 *
 * Messages in and out are plain, structured-cloneable data. All heavy graph
 * code lives behind this module, so it ships as its own lazily-loaded chunk.
 */
import { extractGraph } from '@/lib/graph/GraphBuilder'
import { computeLayout } from '@/lib/graph/forceLayout'
import type {
  GraphWorkerRequest,
  GraphWorkerResponse,
} from '@/lib/graph/GraphWorkerClient'

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (ev: MessageEvent<GraphWorkerRequest>) => {
  const msg = ev.data
  try {
    if (msg.type === 'build') {
      const data = extractGraph(msg.snapshot, msg.options)
      const res: GraphWorkerResponse = { type: 'build', requestId: msg.requestId, data }
      ctx.postMessage(res)
    } else if (msg.type === 'layout') {
      const positions = computeLayout(msg.input)
      const res: GraphWorkerResponse = { type: 'layout', requestId: msg.requestId, positions }
      ctx.postMessage(res)
    }
  } catch (err) {
    const res: GraphWorkerResponse = {
      type: 'error',
      requestId: msg.requestId,
      message: err instanceof Error ? err.message : 'graph worker failed',
    }
    ctx.postMessage(res)
  }
}
