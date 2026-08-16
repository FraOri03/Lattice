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
