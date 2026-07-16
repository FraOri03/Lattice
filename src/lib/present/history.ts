/**
 * Generic bounded undo/redo history with transaction coalescing (Phase 0).
 *
 * The presentation editor's #1 gap was that edits were not reversible: the
 * deck body was replaced wholesale on every change with nothing recording the
 * previous state (see docs/presentation-editor-audit.md · ISS-1). This module
 * is the non-destructive-editing keystone every later phase builds on.
 *
 * It is deliberately pure and framework-free so the collapse/undo/redo logic
 * is unit-testable in the node vitest environment (no DOM). Time-based
 * coalescing (e.g. debouncing text typing) is the caller's job: the caller
 * passes a stable `coalesceKey` for edits that should merge into one entry —
 * this core only compares keys, it never looks at the clock.
 */

export interface HistoryState<T> {
  /** the current value */
  readonly present: T
  /** older values, oldest first; length ≤ limit */
  readonly past: readonly T[]
  /** redo stack, next-to-redo first */
  readonly future: readonly T[]
  /** coalesce key of the entry currently on top of `present` (null = sealed) */
  readonly coalesceKey: string | null
  /** max number of undo steps retained */
  readonly limit: number
}

const DEFAULT_LIMIT = 100

export function initHistory<T>(present: T, limit = DEFAULT_LIMIT): HistoryState<T> {
  return { present, past: [], future: [], coalesceKey: null, limit: Math.max(1, limit) }
}

/**
 * Record a new value.
 *
 * - With no `coalesceKey` (or a different one than the last commit) a new undo
 *   entry is pushed: the current `present` moves onto `past`, `future` clears.
 * - With a `coalesceKey` equal to the previous commit's key the value is
 *   *amended* in place — `past` is untouched — so a whole drag or a typed word
 *   collapses into a single undo step.
 *
 * A no-op (`next === present`) is ignored so identical re-commits never grow
 * the stack.
 */
export function commit<T>(
  h: HistoryState<T>,
  next: T,
  coalesceKey?: string,
): HistoryState<T> {
  if (Object.is(next, h.present)) {
    // value unchanged; still allow sealing/opening the coalesce window
    return coalesceKey === h.coalesceKey ? h : { ...h, coalesceKey: coalesceKey ?? null }
  }

  // amend the current entry (same non-null coalesce key) — no new undo step
  if (coalesceKey != null && coalesceKey === h.coalesceKey) {
    return { ...h, present: next, future: [] }
  }

  // push a new entry
  const past = [...h.past, h.present]
  const trimmed = past.length > h.limit ? past.slice(past.length - h.limit) : past
  return {
    ...h,
    present: next,
    past: trimmed,
    future: [],
    coalesceKey: coalesceKey ?? null,
  }
}

/** Seal the current coalesce window so the next commit starts a new entry. */
export function seal<T>(h: HistoryState<T>): HistoryState<T> {
  return h.coalesceKey === null ? h : { ...h, coalesceKey: null }
}

export function canUndo<T>(h: HistoryState<T>): boolean {
  return h.past.length > 0
}

export function canRedo<T>(h: HistoryState<T>): boolean {
  return h.future.length > 0
}

export function undo<T>(h: HistoryState<T>): HistoryState<T> {
  if (!h.past.length) return h
  const previous = h.past[h.past.length - 1]
  return {
    ...h,
    present: previous,
    past: h.past.slice(0, -1),
    future: [h.present, ...h.future],
    coalesceKey: null,
  }
}

export function redo<T>(h: HistoryState<T>): HistoryState<T> {
  if (!h.future.length) return h
  const next = h.future[0]
  return {
    ...h,
    present: next,
    past: [...h.past, h.present],
    future: h.future.slice(1),
    coalesceKey: null,
  }
}

/** Replace the present without touching history (e.g. an external reload). */
export function reset<T>(h: HistoryState<T>, present: T): HistoryState<T> {
  return initHistory(present, h.limit)
}
