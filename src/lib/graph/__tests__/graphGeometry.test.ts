import { describe, expect, it } from 'vitest'
import {
  boxesOverlap,
  distanceToSegment,
  easeOutCubic,
  edgeAt,
  placeLabels,
  tweenCamera,
} from '../graphGeometry'
import { componentIds } from '../GraphIndex'
import { computeLayout } from '../forceLayout'
import type { LatticeGraphEdge, LatticeGraphNode } from '../graphTypes'

const edge = (id: string, source: string, target: string): LatticeGraphEdge => ({
  id,
  source,
  target,
  kind: 'references',
  directed: true,
  sourceSystem: 'wikilink',
})

const node = (id: string): LatticeGraphNode => ({
  id,
  entityId: id,
  projectId: 'p',
  kind: 'note',
  label: id,
})

describe('distanceToSegment', () => {
  it('measures to the segment, not to the infinite line', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 10, y: 0 }
    // straight out from the middle
    expect(distanceToSegment({ x: 5, y: 3 }, a, b)).toBeCloseTo(3)
    // far beyond the end: the distance is to the endpoint, not zero
    expect(distanceToSegment({ x: 100, y: 0 }, a, b)).toBeCloseTo(90)
  })

  it('handles a segment of no length without dividing by zero', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(5)
  })
})

describe('edgeAt', () => {
  const screen: Record<string, { x: number; y: number }> = {
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
    c: { x: 0, y: 100 },
  }
  const input = {
    edges: [edge('e1', 'a', 'b'), edge('e2', 'a', 'c')],
    screenOf: (id: string) => screen[id],
    threshold: 6,
  }

  it('finds the edge under the point', () => {
    expect(edgeAt({ x: 50, y: 2 }, input)?.id).toBe('e1')
    expect(edgeAt({ x: 2, y: 50 }, input)?.id).toBe('e2')
  })

  it('returns nothing when the point is not near any edge', () => {
    expect(edgeAt({ x: 60, y: 60 }, input)).toBeNull()
  })

  it('prefers the nearer edge where two run close together', () => {
    expect(edgeAt({ x: 3, y: 1 }, input)?.id).toBe('e1')
    expect(edgeAt({ x: 1, y: 3 }, input)?.id).toBe('e2')
  })

  it('skips an edge whose endpoint is not on screen', () => {
    const partial = { ...input, screenOf: (id: string) => (id === 'b' ? undefined : screen[id]) }
    expect(edgeAt({ x: 50, y: 0 }, partial)).toBeNull()
  })
})

describe('placeLabels', () => {
  const box = (x: number, y: number) => ({ x, y, w: 40, h: 12 })

  it('keeps the first of two labels that would overlap', () => {
    const kept = placeLabels([{ id: 'a', box: box(0, 0) }, { id: 'b', box: box(10, 0) }], 10)
    expect(kept.map((k) => k.id)).toEqual(['a'])
  })

  it('keeps both when they clear each other', () => {
    const kept = placeLabels([{ id: 'a', box: box(0, 0) }, { id: 'b', box: box(50, 0) }], 10)
    expect(kept.map((k) => k.id)).toEqual(['a', 'b'])
  })

  it('respects the cap even when nothing collides', () => {
    const kept = placeLabels(
      [{ id: 'a', box: box(0, 0) }, { id: 'b', box: box(50, 0) }, { id: 'c', box: box(100, 0) }],
      2,
    )
    expect(kept).toHaveLength(2)
  })

  it('drops nothing when the list is empty', () => {
    expect(placeLabels([], 5)).toEqual([])
  })
})

describe('boxesOverlap', () => {
  it('is false for boxes that merely touch', () => {
    expect(boxesOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false)
  })
})

describe('camera flight', () => {
  it('starts where it was and ends where it was asked', () => {
    const from = { x: 0, y: 0 }
    const to = { x: 100, y: 50 }
    expect(tweenCamera(from, to, 0)).toEqual(from)
    expect(tweenCamera(from, to, 1)).toEqual(to)
  })

  it('eases out — more than half way at the half-way point', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
    expect(tweenCamera({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.5).x).toBeGreaterThan(50)
  })

  it('clamps a progress value that ran past the end', () => {
    expect(easeOutCubic(2)).toBe(1)
    expect(easeOutCubic(-1)).toBe(0)
  })
})

describe('componentIds', () => {
  it('gives connected nodes the same id and separate ones their own', () => {
    const nodes = [node('a'), node('b'), node('c')]
    const ids = componentIds(nodes, [edge('e', 'a', 'b')])
    expect(ids.get('a')).toBe(ids.get('b'))
    expect(ids.get('c')).not.toBe(ids.get('a'))
  })

  it('gives every node an id, including an orphan', () => {
    const ids = componentIds([node('a')], [])
    expect(ids.size).toBe(1)
  })
})

describe('radial layout — branches read as branches (19B)', () => {
  /**
   * Two first-hop neighbours, each with its own children. Grouping means a
   * child sits nearer its own parent's direction than the other parent's.
   */
  const nodes = ['root', 'l', 'r', 'l1', 'l2', 'r1', 'r2'].map(node)
  const edges = [
    edge('e1', 'root', 'l'),
    edge('e2', 'root', 'r'),
    edge('e3', 'l', 'l1'),
    edge('e4', 'l', 'l2'),
    edge('e5', 'r', 'r1'),
    edge('e6', 'r', 'r2'),
  ]
  const positions = computeLayout({
    nodes,
    edges,
    settings: { layout: 'radial', linkDistance: 90, pinnedPositions: {} },
    focusId: 'root',
    seed: 'test',
  })

  const angleOf = (id: string) => Math.atan2(positions[id].y, positions[id].x)
  const angularGap = (a: string, b: string) => {
    const d = Math.abs(angleOf(a) - angleOf(b))
    return Math.min(d, Math.PI * 2 - d)
  }

  it('places every node', () => {
    for (const n of nodes) expect(positions[n.id]).toBeDefined()
  })

  it('keeps each child closer in angle to its own parent than to the other', () => {
    expect(angularGap('l1', 'l')).toBeLessThan(angularGap('l1', 'r'))
    expect(angularGap('r1', 'r')).toBeLessThan(angularGap('r1', 'l'))
  })

  it('keeps siblings together rather than scattering them round the ring', () => {
    expect(angularGap('l1', 'l2')).toBeLessThan(angularGap('l1', 'r1'))
  })
})
