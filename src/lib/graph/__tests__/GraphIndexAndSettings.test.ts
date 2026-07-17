import { describe, expect, it } from 'vitest'
import { buildAdjacency, countComponents, findOrphans, neighborhood } from '../GraphIndex'
import {
  clampGraphSettings,
  decodeGraphSettings,
  defaultGraphSettings,
  DEPTH_MAX,
  LINK_DISTANCE_MAX,
} from '../GraphSettingsService'
import { searchNodes, groupedNeighbors } from '../GraphQueryService'
import { extractGraph, nodeId } from '../GraphBuilder'
import type { LatticeGraphEdge, LatticeGraphNode } from '../graphTypes'
import { doc, note, snapshot } from './fixtures'

const N = (id: string): LatticeGraphNode => ({
  id,
  entityId: id,
  projectId: 'p',
  kind: 'note',
  label: id.toUpperCase(),
})
const E = (source: string, target: string): LatticeGraphEdge => ({
  id: `${source}->${target}`,
  source,
  target,
  kind: 'references',
  directed: true,
  sourceSystem: 'wikilink',
})

describe('GraphIndex — traversal', () => {
  const nodes = ['a', 'b', 'c', 'd', 'e'].map(N)
  const edges = [E('a', 'b'), E('b', 'c'), E('c', 'd')] // e is isolated

  it('finds orphans and counts connected components', () => {
    expect(findOrphans(nodes, edges)).toEqual(['e'])
    expect(countComponents(nodes, edges)).toBe(2) // {a,b,c,d}, {e}
  })

  it('walks the neighbourhood by depth and direction', () => {
    const adj = buildAdjacency(nodes, edges)
    expect(neighborhood(adj, ['a'], 1, 'both')).toEqual(new Set(['a', 'b']))
    expect(neighborhood(adj, ['a'], 2, 'both')).toEqual(new Set(['a', 'b', 'c']))
    expect(neighborhood(adj, ['a'], 5, 'out')).toEqual(new Set(['a', 'b', 'c', 'd']))
    // against direction: nothing flows into a
    expect(neighborhood(adj, ['a'], 5, 'in')).toEqual(new Set(['a']))
  })
})

describe('GraphSettingsService — decode & clamp', () => {
  it('returns defaults for garbage input', () => {
    expect(decodeGraphSettings(null)).toEqual(defaultGraphSettings())
    expect(decodeGraphSettings('nonsense')).toEqual(defaultGraphSettings())
  })

  it('clamps unsafe numeric settings', () => {
    const decoded = decodeGraphSettings({ depth: 999, linkDistance: 99999 })
    expect(decoded.depth).toBe(DEPTH_MAX)
    expect(decoded.linkDistance).toBe(LINK_DISTANCE_MAX)
    const low = decodeGraphSettings({ depth: -5, linkDistance: -100 })
    expect(low.depth).toBeGreaterThanOrEqual(1)
    expect(low.linkDistance).toBeGreaterThanOrEqual(30)
  })

  it('rejects invalid enums and keeps valid partial values', () => {
    const decoded = decodeGraphSettings({ layout: 'evil', scope: 'local', showOrphans: false })
    expect(decoded.layout).toBe('force') // fell back
    expect(decoded.scope).toBe('local') // kept
    expect(decoded.showOrphans).toBe(false)
  })

  it('drops non-finite pinned positions', () => {
    const decoded = decodeGraphSettings({
      pinnedPositions: {
        good: { x: 10, y: 20 },
        bad: { x: NaN, y: 5 },
        wrong: { x: 'nope' },
      },
    })
    expect(decoded.pinnedPositions).toEqual({ good: { x: 10, y: 20 } })
  })

  it('clampGraphSettings round-trips a valid object', () => {
    const s = defaultGraphSettings()
    expect(clampGraphSettings(s)).toEqual(s)
  })
})

describe('GraphQueryService', () => {
  const data = extractGraph(
    snapshot({
      notes: [note({ id: 'n1', title: 'Project Brief', content: '[[Budget]]' })],
      docs: [doc({ id: 'd1', title: 'Budget' })],
    }),
  )

  it('search matches by label but never by internal id', () => {
    expect(searchNodes(data.nodes, 'brief').map((m) => m.node.entityId)).toEqual(['n1'])
    expect(searchNodes(data.nodes, 'note:n1')).toHaveLength(0)
    expect(searchNodes(data.nodes, '')).toHaveLength(0)
  })

  it('groups neighbours by direction and relationship kind', () => {
    const groups = groupedNeighbors(data, nodeId('note', 'n1'))
    const outgoing = groups.find((g) => g.direction === 'outgoing')
    expect(outgoing?.entries[0].node.entityId).toBe('d1')
  })
})
