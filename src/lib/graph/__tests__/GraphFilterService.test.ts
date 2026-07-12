import { describe, expect, it } from 'vitest'
import { extractGraph, nodeId } from '../GraphBuilder'
import { applyFilters } from '../GraphFilterService'
import { defaultGraphSettings } from '../GraphSettingsService'
import type { GraphViewSettings } from '../graphTypes'
import { doc, note, snapshot } from './fixtures'

function settings(patch: Partial<GraphViewSettings> = {}): GraphViewSettings {
  return { ...defaultGraphSettings(), ...patch }
}

const sample = () =>
  extractGraph(
    snapshot({
      notes: [
        note({ id: 'n1', title: 'A', content: '[[B]]', tags: ['x'] }),
        note({ id: 'n2', title: 'B' }),
        note({ id: 'n3', title: 'Orphan' }),
      ],
      docs: [doc({ id: 'd1', title: 'Doc', outgoingLinks: ['A'] })],
    }),
  )

describe('GraphFilterService', () => {
  it('hides nodes whose kind is filtered out — and their edges with them', () => {
    const data = sample()
    const filtered = applyFilters({
      data,
      settings: settings({ visibleNodeKinds: ['note'] }), // hide documents
    })
    expect(filtered.nodes.every((n) => n.kind === 'note')).toBe(true)
    // the doc→A reference edge must be gone since one endpoint is hidden
    expect(filtered.edges.some((e) => e.source === nodeId('document', 'd1'))).toBe(false)
  })

  it('removes hidden nodes from the data (not just their paint)', () => {
    const data = sample()
    const filtered = applyFilters({ data, settings: settings({ showTags: false }) })
    // tag nodes are entirely absent → cannot be hit-tested or searched
    expect(filtered.nodes.some((n) => n.kind === 'tag')).toBe(false)
  })

  it('hides orphans when showOrphans is off', () => {
    const data = sample()
    const withOrphans = applyFilters({ data, settings: settings({ showOrphans: true }) })
    const withoutOrphans = applyFilters({ data, settings: settings({ showOrphans: false }) })
    expect(withOrphans.nodes.some((n) => n.entityId === 'n3')).toBe(true)
    expect(withoutOrphans.nodes.some((n) => n.entityId === 'n3')).toBe(false)
  })

  it('filters by relationship kind', () => {
    const data = sample()
    const filtered = applyFilters({
      data,
      settings: settings({ visibleRelationshipKinds: ['tagged-with'] }),
    })
    expect(filtered.edges.every((e) => e.kind === 'tagged-with')).toBe(true)
  })

  it('local scope keeps only the neighbourhood around the focus at the given depth', () => {
    const data = extractGraph(
      snapshot({
        notes: [
          note({ id: 'n1', title: 'A', content: '[[B]]' }),
          note({ id: 'n2', title: 'B', content: '[[C]]' }),
          note({ id: 'n3', title: 'C', content: '[[D]]' }),
          note({ id: 'n4', title: 'D' }),
        ],
      }),
    )
    const depth1 = applyFilters({
      data,
      settings: settings({ scope: 'local', depth: 1, showProject: false }),
      focusId: nodeId('note', 'n1'),
    })
    // A + its direct neighbour B
    expect(new Set(depth1.nodes.map((n) => n.entityId))).toEqual(new Set(['n1', 'n2']))

    const depth2 = applyFilters({
      data,
      settings: settings({ scope: 'local', depth: 2 }),
      focusId: nodeId('note', 'n1'),
    })
    expect(new Set(depth2.nodes.map((n) => n.entityId))).toEqual(new Set(['n1', 'n2', 'n3']))
  })

  it('signals when local scope has no focus selected', () => {
    const data = sample()
    const filtered = applyFilters({ data, settings: settings({ scope: 'local' }), focusId: null })
    expect(filtered.needsFocus).toBe(true)
  })
})
