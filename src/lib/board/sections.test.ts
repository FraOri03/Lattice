import { describe, expect, it } from 'vitest'
import type { BoardNode } from '@/types/model'
import { absolutePositionOf, orderSectionsFirst } from './sections'

/**
 * Guards the coordinate maths behind remote presence on the board.
 *
 * Division of labour worth stating, because it decides what is testable
 * here: screen→flow conversion (pan and zoom) is React Flow's
 * `screenToFlowPosition`, and BoardPresenceLayer renders through
 * `ViewportPortal`, so peer cursors ride the canvas transform for free and
 * stay correct at any zoom without arithmetic of ours.
 *
 * What Lattice does own is section-relative→absolute: React Flow stores a
 * child's position relative to its parent section, while a peer's
 * selection outline must be drawn in absolute flow coordinates. Get this
 * wrong and a remote selection renders offset by the section's origin —
 * visibly, and only for cards that live inside sections.
 */

const card = (id: string, x: number, y: number, parentId?: string): BoardNode =>
  ({
    id,
    type: 'note',
    position: { x, y },
    width: 200,
    height: 120,
    ...(parentId ? { parentId } : {}),
    data: { type: 'note', color: 'gray' },
  }) as BoardNode

const section = (id: string, x: number, y: number): BoardNode =>
  ({
    id,
    type: 'section',
    position: { x, y },
    width: 800,
    height: 600,
    data: { type: 'section', color: 'gray' },
  }) as BoardNode

describe('absolutePositionOf', () => {
  it('returns a top-level node position unchanged', () => {
    const node = card('c1', 120, 240)
    expect(absolutePositionOf(node, [node])).toEqual({ x: 120, y: 240 })
  })

  it('offsets a child by its section origin', () => {
    // the peer-selection outline case: React Flow reports {40,30} for a
    // card whose real canvas position is {540,430}
    const parent = section('s1', 500, 400)
    const child = card('c1', 40, 30, 's1')
    expect(absolutePositionOf(child, [parent, child])).toEqual({ x: 540, y: 430 })
  })

  it('handles negative section origins', () => {
    const parent = section('s1', -300, -150)
    const child = card('c1', 50, 25, 's1')
    expect(absolutePositionOf(child, [parent, child])).toEqual({ x: -250, y: -125 })
  })

  it('falls back to the raw position when the parent is missing', () => {
    // a peer may have a card selected while the section arrives late over
    // the CRDT, or was just deleted — the overlay must not crash or NaN
    const orphan = card('c1', 10, 20, 'gone')
    const pos = absolutePositionOf(orphan, [orphan])
    expect(pos).toEqual({ x: 10, y: 20 })
    expect(Number.isFinite(pos.x)).toBe(true)
    expect(Number.isFinite(pos.y)).toBe(true)
  })

  it('is pure: it never mutates the node it reads', () => {
    const parent = section('s1', 100, 100)
    const child = card('c1', 5, 5, 's1')
    absolutePositionOf(child, [parent, child])
    expect(child.position).toEqual({ x: 5, y: 5 })
  })
})

describe('orderSectionsFirst', () => {
  it('puts every section before every card', () => {
    // React Flow requires parents to precede children; the CRDT delivers
    // remote nodes in arbitrary order
    const nodes = [card('c1', 0, 0, 's1'), section('s1', 0, 0), card('c2', 0, 0)]
    const ordered = orderSectionsFirst(nodes)
    expect(ordered.map((n) => n.id)).toEqual(['s1', 'c1', 'c2'])
  })

  it('preserves every node exactly once', () => {
    const nodes = [card('c1', 0, 0), section('s1', 0, 0), card('c2', 0, 0)]
    const ordered = orderSectionsFirst(nodes)
    expect(ordered).toHaveLength(nodes.length)
    expect(new Set(ordered.map((n) => n.id))).toEqual(new Set(['c1', 's1', 'c2']))
  })
})
