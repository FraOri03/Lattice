import { describe, expect, it } from 'vitest'
import { alignElements, distributeElements, type AlignItem } from './align'

const A: AlignItem = { id: 'a', x: 0, y: 0, w: 100, h: 50 }
const B: AlignItem = { id: 'b', x: 200, y: 100, w: 100, h: 100 }

describe('present alignment', () => {
  it('aligns left / right / horizontal-center', () => {
    expect(alignElements([A, B], 'left').get('b')).toEqual({ x: 0, y: 100 })
    expect(alignElements([A, B], 'right').get('a')).toEqual({ x: 200, y: 0 })
    // union bounds 0..300 → center 150; A(w100)→x=100, B(w100)→x=100
    expect(alignElements([A, B], 'hcenter').get('a')).toEqual({ x: 100, y: 0 })
    expect(alignElements([A, B], 'hcenter').get('b')).toEqual({ x: 100, y: 100 })
  })

  it('aligns top / bottom / vertical-center', () => {
    expect(alignElements([A, B], 'top').get('b')).toEqual({ x: 200, y: 0 })
    // bounds 0..200 → bottom; A(h50)→150, B(h100)→100
    expect(alignElements([A, B], 'bottom').get('a')).toEqual({ x: 0, y: 150 })
    // center 100; A(h50)→75, B(h100)→50
    expect(alignElements([A, B], 'vcenter').get('a')).toEqual({ x: 0, y: 75 })
  })

  it('needs at least two elements to align', () => {
    expect(alignElements([A], 'left').size).toBe(0)
  })

  it('distributes horizontally with equal gaps', () => {
    const items: AlignItem[] = [
      { id: 'a', x: 0, y: 0, w: 100, h: 50 },
      { id: 'b', x: 150, y: 0, w: 100, h: 50 },
      { id: 'c', x: 400, y: 0, w: 100, h: 50 },
    ]
    const out = distributeElements(items, 'h')
    expect(out.get('a')).toEqual({ x: 0, y: 0 }) // outer pinned
    expect(out.get('c')).toEqual({ x: 400, y: 0 }) // outer pinned
    expect(out.get('b')).toEqual({ x: 200, y: 0 }) // equal 100px gaps
  })

  it('needs at least three elements to distribute', () => {
    expect(distributeElements([A, B], 'h').size).toBe(0)
  })
})

/**
 * Aligning against a frame (#254 follow-up).
 *
 * With one element there is nothing to line up against, so the reference
 * becomes the slide. Centring a single box is the commonest alignment there
 * is, and it used to be impossible.
 */
describe('alignElements — against a frame', () => {
  const slide = { x: 0, y: 0, w: 960, h: 540 }
  const box = { id: 'a', x: 100, y: 100, w: 200, h: 80 }

  it('does nothing for one element when no frame is given', () => {
    expect(alignElements([box], 'hcenter').size).toBe(0)
  })

  it('centres a single element on the frame', () => {
    const out = alignElements([box], 'hcenter', slide)
    expect(out.get('a')).toEqual({ x: 380, y: 100 })
  })

  it('centres it vertically without touching the other axis', () => {
    const out = alignElements([box], 'vcenter', slide)
    expect(out.get('a')).toEqual({ x: 100, y: 230 })
  })

  it('takes each edge of the frame', () => {
    expect(alignElements([box], 'left', slide).get('a')).toEqual({ x: 0, y: 100 })
    expect(alignElements([box], 'right', slide).get('a')).toEqual({ x: 760, y: 100 })
    expect(alignElements([box], 'top', slide).get('a')).toEqual({ x: 100, y: 0 })
    expect(alignElements([box], 'bottom', slide).get('a')).toEqual({ x: 100, y: 460 })
  })

  it('moves a whole selection onto the frame when one is given', () => {
    const two = [box, { id: 'b', x: 500, y: 300, w: 100, h: 40 }]
    const out = alignElements(two, 'left', slide)
    expect(out.get('a')?.x).toBe(0)
    expect(out.get('b')?.x).toBe(0)
  })

  it('still aligns to the selection when no frame is given', () => {
    const two = [box, { id: 'b', x: 500, y: 300, w: 100, h: 40 }]
    const out = alignElements(two, 'left')
    expect(out.get('a')?.x).toBe(100)
    expect(out.get('b')?.x).toBe(100)
  })

  it('has nothing to say about an empty selection', () => {
    expect(alignElements([], 'left', slide).size).toBe(0)
  })
})
