/**
 * ViewerBudget — caps how many 3D viewers are live at once (PERF-2, item 4).
 *
 * Off-screen viewers already pause themselves; this additionally bounds the
 * number of *simultaneously on-screen* WebGL scenes so a dense board can
 * never spin up dozens of renderers. It is a tiny observable so components
 * re-try for a slot when one frees up. Pure (no React) → unit-testable.
 */
export class ViewerBudget {
  private active = new Set<string>()
  private listeners = new Set<() => void>()

  constructor(public readonly max: number) {}

  /** Take a slot for `id`; idempotent for an id that already holds one. */
  acquire(id: string): boolean {
    if (this.active.has(id)) return true
    if (this.active.size >= this.max) return false
    this.active.add(id)
    this.emit()
    return true
  }

  release(id: string): void {
    if (this.active.delete(id)) this.emit()
  }

  has(id: string): boolean {
    return this.active.has(id)
  }

  get size(): number {
    return this.active.size
  }

  /** Notified when a slot is taken or freed (waiters re-try acquire). */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn()
  }
}

/** App-wide budget: at most 4 live 3D scenes at any moment. */
export const threeViewerBudget = new ViewerBudget(4)
