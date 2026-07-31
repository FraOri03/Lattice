import { describe, expect, it } from 'vitest'
import { moveShot, renumberShots, resolveCardShot } from './shots'
import type { PhotoShot } from '@/types/photo'

const shot = (id: string, number: number): PhotoShot => ({
  id,
  number,
  name: `Shot ${id}`,
  description: '',
  priority: 'Medium',
  status: 'Draft',
  checklist: [],
  elements: [],
})

const sequence = () => [shot('a', 1), shot('b', 2), shot('c', 3)]

describe('renumberShots', () => {
  it('numbers shots by their position', () => {
    const out = renumberShots([shot('a', 7), shot('b', 2)])
    expect(out.map((s) => s.number)).toEqual([1, 2])
  })

  it('keeps the objects it does not have to change', () => {
    const shots = sequence()
    const out = renumberShots(shots)
    expect(out[0]).toBe(shots[0])
  })
})

describe('moveShot', () => {
  it('moves a shot later and renumbers the sequence', () => {
    const out = moveShot(sequence(), 'a', 1)
    expect(out.map((s) => s.id)).toEqual(['b', 'a', 'c'])
    expect(out.map((s) => s.number)).toEqual([1, 2, 3])
  })

  it('moves a shot earlier', () => {
    expect(moveShot(sequence(), 'c', -1).map((s) => s.id)).toEqual(['a', 'c', 'b'])
  })

  it('moves across more than one place', () => {
    expect(moveShot(sequence(), 'a', 2).map((s) => s.id)).toEqual(['b', 'c', 'a'])
  })

  it('returns the same array at the ends, so a no-op adds no undo step', () => {
    const shots = sequence()
    expect(moveShot(shots, 'a', -1)).toBe(shots)
    expect(moveShot(shots, 'c', 1)).toBe(shots)
    expect(moveShot(shots, 'b', 0)).toBe(shots)
    expect(moveShot(shots, 'nope', 1)).toBe(shots)
  })

  it('leaves the other shots untouched', () => {
    const shots = sequence()
    const out = moveShot(shots, 'a', 1)
    expect(out.find((s) => s.id === 'c')).toBe(shots[2])
  })
})

describe('resolveCardShot', () => {
  it('follows the active shot when the card pins nothing', () => {
    const res = resolveCardShot(sequence(), 'b', undefined)
    expect(res).toEqual({ kind: 'active', shot: expect.objectContaining({ id: 'b' }) })
  })

  it('falls back to the first shot when the active id is unknown', () => {
    const res = resolveCardShot(sequence(), 'gone', undefined)
    expect(res.kind === 'active' && res.shot.id).toBe('a')
  })

  it('shows the pinned shot regardless of what the editor has open', () => {
    const res = resolveCardShot(sequence(), 'a', 'c')
    expect(res).toEqual({ kind: 'pinned', shot: expect.objectContaining({ id: 'c' }) })
  })

  it('reports a deleted pinned shot instead of drawing another one', () => {
    expect(resolveCardShot(sequence(), 'a', 'deleted')).toEqual({ kind: 'missing' })
  })

  it('reports an empty scene', () => {
    expect(resolveCardShot([], 'a', undefined)).toEqual({ kind: 'empty' })
    expect(resolveCardShot([], 'a', 'c')).toEqual({ kind: 'empty' })
  })
})
