import { describe, expect, it } from 'vitest'
import { computeBorders } from './borders'

/**
 * Borders depend on where a cell sits in the selection, which is what
 * separates "outline" (the block's outer edge only) from "all".
 */

const rect = (r1: number, c1: number, r2: number, c2: number) => ({ r1, c1, r2, c2 })

/** Patches as a { "r:c": "trbl" } map, listing the sides that are drawn. */
function sides(patches: ReturnType<typeof computeBorders>) {
  const out: Record<string, string> = {}
  for (const p of patches) {
    out[`${p.r}:${p.c}`] = p.bd
      ? (['t', 'r', 'b', 'l'] as const).filter((s) => p.bd?.[s]).join('')
      : ''
  }
  return out
}

describe('computeBorders', () => {
  it('draws every side of every cell for "all"', () => {
    expect(sides(computeBorders(rect(0, 0, 1, 1), 'all'))).toEqual({
      '0:0': 'trbl',
      '0:1': 'trbl',
      '1:0': 'trbl',
      '1:1': 'trbl',
    })
  })

  it('draws only the block edge for "outline"', () => {
    // corners get two sides, and a 2x2 block is all corners
    expect(sides(computeBorders(rect(0, 0, 1, 1), 'outline'))).toEqual({
      '0:0': 'tl',
      '0:1': 'tr',
      '1:0': 'bl',
      '1:1': 'rb',
    })
  })

  it('gives an interior cell no sides when outlining', () => {
    const map = sides(computeBorders(rect(0, 0, 2, 2), 'outline'))
    expect(map['1:1']).toBe('')
    expect(map['0:1']).toBe('t')
    expect(map['1:0']).toBe('l')
  })

  it('wraps a single cell on all four sides when outlining', () => {
    expect(sides(computeBorders(rect(2, 3, 2, 3), 'outline'))).toEqual({ '2:3': 'trbl' })
  })

  it('clears borders for "none"', () => {
    const patches = computeBorders(rect(0, 0, 1, 0), 'none')
    expect(patches.every((p) => p.bd === undefined)).toBe(true)
    expect(patches).toHaveLength(2)
  })

  it('normalises a rectangle given back to front', () => {
    expect(sides(computeBorders(rect(1, 1, 0, 0), 'all'))).toEqual(
      sides(computeBorders(rect(0, 0, 1, 1), 'all')),
    )
  })

  it('covers every cell in the rectangle', () => {
    expect(computeBorders(rect(0, 0, 2, 3), 'all')).toHaveLength(12)
  })
})
