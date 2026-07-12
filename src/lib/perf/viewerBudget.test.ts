import { describe, expect, it, vi } from 'vitest'
import { ViewerBudget } from './viewerBudget'
import { computeActive, shouldAnimate } from './visibility'

/**
 * PERF-2: the concurrent 3D-viewer cap and the pure "should this animate?"
 * decision. Covers acquiring/releasing slots (cleanup), the cap, waiter
 * notification, and that off-screen or page-hidden fully suspends a loop.
 */

describe('ViewerBudget', () => {
  it('caps the number of simultaneous slots', () => {
    const b = new ViewerBudget(2)
    expect(b.acquire('a')).toBe(true)
    expect(b.acquire('b')).toBe(true)
    expect(b.acquire('c')).toBe(false) // full
    expect(b.size).toBe(2)
  })

  it('acquire is idempotent for the same id', () => {
    const b = new ViewerBudget(1)
    expect(b.acquire('a')).toBe(true)
    expect(b.acquire('a')).toBe(true)
    expect(b.size).toBe(1)
  })

  it('frees a slot on release and lets a waiter in', () => {
    const b = new ViewerBudget(1)
    b.acquire('a')
    expect(b.acquire('b')).toBe(false)
    b.release('a')
    expect(b.has('a')).toBe(false)
    expect(b.acquire('b')).toBe(true)
  })

  it('notifies subscribers when slots change, and unsubscribes cleanly', () => {
    const b = new ViewerBudget(1)
    const fn = vi.fn()
    const off = b.subscribe(fn)
    b.acquire('a') // emit
    b.release('a') // emit
    expect(fn).toHaveBeenCalledTimes(2)
    off()
    b.acquire('c')
    expect(fn).toHaveBeenCalledTimes(2) // no more after unsubscribe
  })
})

describe('visibility decisions', () => {
  it('is active only when on-screen AND the page is visible', () => {
    expect(computeActive(true, true)).toBe(true)
    expect(computeActive(false, true)).toBe(false)
    expect(computeActive(true, false)).toBe(false)
    expect(computeActive(false, false)).toBe(false)
  })

  it('animates only when active and holding a budget slot', () => {
    expect(shouldAnimate(true, true)).toBe(true)
    expect(shouldAnimate(true, false)).toBe(false)
    expect(shouldAnimate(false, true)).toBe(false)
  })
})
