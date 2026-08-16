import { describe, expect, it } from 'vitest'
import {
  canRedo,
  canUndo,
  commit,
  initHistory,
  redo,
  seal,
  undo,
} from './history'

/**
 * The non-destructive-editing keystone (Phase 0). These prove the transaction
 * coalescing that makes "one drag / one typed word = one undo step" true, plus
 * bounded eviction and the redo invariants.
 */

describe('present history', () => {
  it('pushes a new entry per distinct commit and undoes/redoes it', () => {
    let h = initHistory(0)
    h = commit(h, 1)
    h = commit(h, 2)
    expect(h.present).toBe(2)
    expect(canUndo(h)).toBe(true)
    h = undo(h)
    expect(h.present).toBe(1)
    h = undo(h)
    expect(h.present).toBe(0)
    expect(canUndo(h)).toBe(false)
    h = redo(h)
    expect(h.present).toBe(1)
  })

  it('coalesces commits sharing a key into a single undo step', () => {
    let h = initHistory('')
    h = commit(h, 'h', 'type')
    h = commit(h, 'he', 'type')
    h = commit(h, 'hel', 'type')
    h = commit(h, 'hello', 'type')
    expect(h.present).toBe('hello')
    // four keystrokes → one entry back to the pre-typing value
    h = undo(h)
    expect(h.present).toBe('')
    expect(canUndo(h)).toBe(false)
  })

  it('starts a new entry when the coalesce key changes or is sealed', () => {
    let h = initHistory('')
    h = commit(h, 'a', 'k1')
    h = commit(h, 'ab', 'k1')
    h = commit(h, 'ab!', 'k2') // different key → new entry
    expect(h.past.length).toBe(2)

    let h2 = initHistory('')
    h2 = commit(h2, 'a', 'k1')
    h2 = seal(h2)
    h2 = commit(h2, 'aa', 'k1') // same key but window sealed → new entry
    expect(h2.past.length).toBe(2)
  })

  it('ignores no-op commits (value unchanged)', () => {
    let h = initHistory(5)
    h = commit(h, 5)
    h = commit(h, 5)
    expect(h.past.length).toBe(0)
  })

  it('clears the redo stack on a fresh commit', () => {
    let h = initHistory(0)
    h = commit(h, 1)
    h = undo(h)
    expect(canRedo(h)).toBe(true)
    h = commit(h, 2)
    expect(canRedo(h)).toBe(false)
  })

  it('evicts the oldest entries beyond the limit', () => {
    let h = initHistory(0, 3)
    for (let i = 1; i <= 10; i++) h = commit(h, i)
    // limit 3 → only the last 3 prior states are undoable
    expect(h.past.length).toBe(3)
    h = undo(h)
    h = undo(h)
    h = undo(h)
    expect(canUndo(h)).toBe(false)
    expect(h.present).toBe(7)
  })
})
