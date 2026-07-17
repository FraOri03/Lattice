/**
 * Thin client over the graph Web Worker. Building and laying out large
 * graphs is expensive, so it runs off the main thread. If workers are
 * unavailable (unit tests, unsupported runtimes) every call transparently
 * falls back to running the same pure functions on the main thread.
 *
 * The worker module is imported lazily via `new URL(...)` so Vite emits it
 * as its own chunk — the graph renderer and layout code stay out of the
 * main bundle until Graph mode is opened.
 */
import type { GraphBuildOptions } from './GraphBuilder'
import type { GraphSourceSnapshot } from './graphSource'
import type { LatticeGraphData } from './graphTypes'
import type { LayoutInput, LayoutPositions } from './forceLayout'

export type GraphWorkerRequest =
  | { type: 'build'; requestId: number; snapshot: GraphSourceSnapshot; options: GraphBuildOptions }
  | { type: 'layout'; requestId: number; input: LayoutInput }

export type GraphWorkerResponse =
  | { type: 'build'; requestId: number; data: LatticeGraphData }
  | { type: 'layout'; requestId: number; positions: LayoutPositions }
  | { type: 'error'; requestId: number; message: string }

type Pending = {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

class GraphWorkerClient {
  private worker: Worker | null = null
  private nextId = 1
  private pending = new Map<number, Pending>()
  private failed = false

  private ensureWorker(): Worker | null {
    if (this.failed) return null
    if (this.worker) return this.worker
    try {
      this.worker = new Worker(new URL('../../workers/graph.worker.ts', import.meta.url), {
        type: 'module',
      })
      this.worker.onmessage = (ev: MessageEvent<GraphWorkerResponse>) => {
        const msg = ev.data
        const p = this.pending.get(msg.requestId)
        if (!p) return
        this.pending.delete(msg.requestId)
        if (msg.type === 'error') p.reject(new Error(msg.message))
        else if (msg.type === 'build') p.resolve(msg.data)
        else p.resolve(msg.positions)
      }
      this.worker.onerror = () => {
        // fall back to main-thread execution from here on
        this.failed = true
        for (const [, p] of this.pending) p.reject(new Error('graph worker error'))
        this.pending.clear()
        this.worker?.terminate()
        this.worker = null
      }
      return this.worker
    } catch {
      this.failed = true
      return null
    }
  }

  async buildGraph(
    snapshot: GraphSourceSnapshot,
    options: GraphBuildOptions,
  ): Promise<LatticeGraphData> {
    const worker = this.ensureWorker()
    if (!worker) {
      const { extractGraph } = await import('./GraphBuilder')
      return extractGraph(snapshot, options)
    }
    const requestId = this.nextId++
    try {
      return await new Promise<LatticeGraphData>((resolve, reject) => {
        this.pending.set(requestId, { resolve: resolve as (v: unknown) => void, reject })
        worker.postMessage({ type: 'build', requestId, snapshot, options } satisfies GraphWorkerRequest)
      })
    } catch {
      const { extractGraph } = await import('./GraphBuilder')
      return extractGraph(snapshot, options)
    }
  }

  async computeLayout(input: LayoutInput): Promise<LayoutPositions> {
    const worker = this.ensureWorker()
    if (!worker) {
      const { computeLayout } = await import('./forceLayout')
      return computeLayout(input)
    }
    const requestId = this.nextId++
    try {
      return await new Promise<LayoutPositions>((resolve, reject) => {
        this.pending.set(requestId, { resolve: resolve as (v: unknown) => void, reject })
        worker.postMessage({ type: 'layout', requestId, input } satisfies GraphWorkerRequest)
      })
    } catch {
      const { computeLayout } = await import('./forceLayout')
      return computeLayout(input)
    }
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    this.pending.clear()
  }
}

/** Shared singleton — one worker for the whole Graph workspace. */
export const graphWorker = new GraphWorkerClient()
