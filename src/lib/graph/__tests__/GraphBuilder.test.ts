import { describe, expect, it } from 'vitest'
import { extractGraph, nodeId, normalizeGraph } from '../GraphBuilder'
import type { LatticeGraphEdge, LatticeGraphNode } from '../graphTypes'
import {
  asset,
  board,
  boardCard,
  boardEdge,
  code,
  doc,
  note,
  present,
  sheet,
  snapshot,
} from './fixtures'

describe('GraphBuilder — node normalization', () => {
  it('maps every entity kind onto a graph node with icon and colour', () => {
    const g = extractGraph(
      snapshot({
        notes: [note({ id: 'n1', title: 'A' })],
        docs: [doc({ id: 'd1', title: 'B' })],
        sheetDocs: [sheet({ id: 's1', title: 'C' })],
        presentDocs: [present({ id: 'p1', title: 'D' })],
        codeDocs: [code({ id: 'c1', title: 'E' })],
        assets: [asset({ id: 'a1', name: 'f.pdf', kind: 'pdf' })],
        boards: [board({ id: 'b1' })],
      }),
    )
    const byId = new Map(g.nodes.map((n) => [n.id, n]))
    expect(byId.get(nodeId('note', 'n1'))?.kind).toBe('note')
    expect(byId.get(nodeId('document', 'd1'))?.kind).toBe('document')
    expect(byId.get(nodeId('spreadsheet', 's1'))?.kind).toBe('spreadsheet')
    expect(byId.get(nodeId('presentation', 'p1'))?.kind).toBe('presentation')
    expect(byId.get(nodeId('code', 'c1'))?.label).toBe('E.ts')
    expect(byId.get(nodeId('pdf', 'a1'))?.kind).toBe('pdf')
    expect(byId.get(nodeId('board', 'b1'))?.kind).toBe('board')
    // every node carries redundant (non colour-only) encoding
    for (const n of g.nodes) {
      expect(n.icon).toBeTruthy()
      expect(n.colorToken).toBeTruthy()
      expect(n.label).toBeTruthy()
    }
  })

  it('never uses the visible label as the stable id', () => {
    const g = extractGraph(snapshot({ notes: [note({ id: 'n1', title: 'Same Title' })] }))
    const n = g.nodes.find((x) => x.entityId === 'n1')!
    expect(n.id).toBe('note:n1')
    expect(n.id).not.toContain('Same Title')
  })
})

describe('GraphBuilder — wikilinks & backlinks', () => {
  it('turns [[wikilinks]] into typed reference edges resolved by title', () => {
    const g = extractGraph(
      snapshot({
        notes: [
          note({ id: 'n1', title: 'Welcome', content: 'see [[Canvas]] and [[Roadmap]]' }),
          note({ id: 'n2', title: 'Canvas', content: 'back to [[Welcome]]' }),
        ],
        docs: [doc({ id: 'd1', title: 'Roadmap' })],
      }),
    )
    const refs = g.edges.filter((e) => e.sourceSystem === 'wikilink')
    // n1→n2, n1→d1, n2→n1
    expect(refs).toHaveLength(3)
    expect(refs.every((e) => e.kind === 'references' && e.directed)).toBe(true)
    const n1 = nodeId('note', 'n1')
    const n2 = nodeId('note', 'n2')
    expect(refs.some((e) => e.source === n1 && e.target === n2)).toBe(true)
    expect(refs.some((e) => e.source === n2 && e.target === n1)).toBe(true) // backlink direction
    expect(refs.some((e) => e.source === n1 && e.target === nodeId('document', 'd1'))).toBe(true)
  })

  it('drops wikilinks to non-existent titles (never invents nodes)', () => {
    const g = extractGraph(
      snapshot({ notes: [note({ id: 'n1', title: 'A', content: '[[Nowhere]]' })] }),
    )
    expect(g.edges).toHaveLength(0)
    expect(g.nodes).toHaveLength(1)
  })

  it('resolves doc and code outgoingLinks by title', () => {
    const g = extractGraph(
      snapshot({
        notes: [note({ id: 'n1', title: 'Spec' })],
        docs: [doc({ id: 'd1', title: 'Design', outgoingLinks: ['Spec'] })],
        codeDocs: [code({ id: 'c1', title: 'impl', outgoingLinks: ['Spec'] })],
      }),
    )
    expect(g.edges.filter((e) => e.target === nodeId('note', 'n1'))).toHaveLength(2)
  })
})

describe('GraphBuilder — source assets & bundles', () => {
  it('links editable entities to their imported source asset', () => {
    const g = extractGraph(
      snapshot({
        docs: [doc({ id: 'd1', title: 'Report', sourceAssetId: 'a1' })],
        assets: [asset({ id: 'a1', name: 'report.docx', kind: 'document', ext: 'docx' })],
      }),
    )
    const e = g.edges.find((x) => x.kind === 'imported-from')
    expect(e).toBeTruthy()
    expect(e!.source).toBe(nodeId('document', 'd1'))
    expect(e!.target).toBe(nodeId('asset', 'a1'))
    expect(e!.sourceSystem).toBe('asset-source')
  })

  it('links multi-file 3D bundles as depends-on edges', () => {
    const g = extractGraph(
      snapshot({
        assets: [
          asset({
            id: 'a1',
            name: 'scene.gltf',
            kind: 'model3d',
            ext: 'gltf',
            bundle: { dependencies: { 'buffer.bin': 'a2', 'wood.png': 'a3' } },
          }),
          asset({ id: 'a2', name: 'buffer.bin', kind: 'file', ext: 'bin' }),
          asset({ id: 'a3', name: 'wood.png', kind: 'image', ext: 'png' }),
        ],
      }),
    )
    const deps = g.edges.filter((e) => e.kind === 'depends-on')
    expect(deps).toHaveLength(2)
    expect(deps.every((e) => e.source === nodeId('model-3d', 'a1'))).toBe(true)
  })
})

describe('GraphBuilder — board relationships', () => {
  const base = snapshot({
    notes: [note({ id: 'n1', title: 'A' }), note({ id: 'n2', title: 'B' })],
    boards: [
      board({
        id: 'b1',
        nodes: [
          boardCard('card1', 'note', { noteId: 'n1' }),
          boardCard('card2', 'note', { noteId: 'n2' }),
        ],
        edges: [boardEdge('e1', 'card1', 'card2', 'relates to')],
      }),
    ],
  })

  it('collapses card instances into Board → Entity + Entity ↔ Entity edges by default', () => {
    const g = extractGraph(base) // showCardInstances: false
    const contains = g.edges.filter((e) => e.sourceSystem === 'board-card')
    const boardEdges = g.edges.filter((e) => e.sourceSystem === 'board-edge')
    expect(contains).toHaveLength(2) // board contains n1, n2
    expect(contains.every((e) => e.kind === 'contains')).toBe(true)
    expect(boardEdges).toHaveLength(1)
    expect(boardEdges[0].source).toBe(nodeId('note', 'n1'))
    expect(boardEdges[0].target).toBe(nodeId('note', 'n2'))
    expect(boardEdges[0].label).toBe('relates to')
    // no card-instance nodes exist
    expect(g.nodes.some((n) => String(n.entityId).startsWith('card'))).toBe(false)
  })

  it('exposes card-instance nodes when showCardInstances is on', () => {
    const g = extractGraph(base, { showCardInstances: true })
    const cardNodes = g.nodes.filter((n) => n.subtitle === 'Card instance')
    expect(cardNodes).toHaveLength(2)
    // each card shows its underlying entity
    expect(g.edges.some((e) => e.kind === 'displayed-on')).toBe(true)
  })
})

describe('GraphBuilder — tags & github', () => {
  it('creates shared tag nodes and tagged-with edges', () => {
    const g = extractGraph(
      snapshot({
        notes: [note({ id: 'n1', title: 'A', tags: ['research'] })],
        docs: [doc({ id: 'd1', title: 'B', tags: ['research'] })],
      }),
    )
    const tagNode = g.nodes.find((n) => n.kind === 'tag')
    expect(tagNode?.label).toBe('#research')
    // one shared tag node, two entities point at it → a cluster
    expect(g.edges.filter((e) => e.kind === 'tagged-with')).toHaveLength(2)
  })

  it('links code documents to a linked GitHub repository', () => {
    const g = extractGraph(
      snapshot({
        project: { id: 'proj_test', name: 'P', github: { repo: 'acme/app', branch: 'lattice' } },
        codeDocs: [code({ id: 'c1', title: 'main' })],
      }),
    )
    const repo = g.nodes.find((n) => n.kind === 'github-file')
    expect(repo?.label).toBe('acme/app')
    expect(g.edges.some((e) => e.kind === 'github-source')).toBe(true)
  })
})

describe('GraphBuilder — normalization', () => {
  it('removes dangling edges and self-loops and deduplicates', () => {
    const nodes: LatticeGraphNode[] = [
      { id: 'a', entityId: 'a', projectId: 'p', kind: 'note', label: 'A' },
      { id: 'b', entityId: 'b', projectId: 'p', kind: 'note', label: 'B' },
    ]
    const mk = (source: string, target: string): LatticeGraphEdge => ({
      id: `${source}->${target}`,
      source,
      target,
      kind: 'references',
      directed: true,
      sourceSystem: 'wikilink',
    })
    const { edges } = normalizeGraph(nodes, [
      mk('a', 'b'),
      mk('a', 'b'), // exact duplicate
      mk('a', 'ghost'), // dangling
      mk('a', 'a'), // self-loop
    ])
    expect(edges).toHaveLength(1)
  })

  it('computes degree, orphan and cluster statistics', () => {
    const g = extractGraph(
      snapshot({
        notes: [
          note({ id: 'n1', title: 'A', content: '[[B]]' }),
          note({ id: 'n2', title: 'B' }),
          note({ id: 'n3', title: 'Lonely' }), // orphan
        ],
      }),
    )
    expect(g.statistics.nodeCount).toBe(3)
    expect(g.statistics.orphanCount).toBe(1)
    expect(g.statistics.clusterCount).toBe(2) // {A,B} and {Lonely}
    const a = g.nodes.find((n) => n.entityId === 'n1')!
    expect(a.degree).toBe(1)
  })

  it('is deterministic — identical snapshots share a revision', () => {
    const build = () =>
      extractGraph(snapshot({ notes: [note({ id: 'n1', title: 'A', content: '[[A]]' })] }))
    expect(build().revision).toBe(build().revision)
  })
})

describe('GraphBuilder — project scoping', () => {
  it('only contains nodes for the snapshot project', () => {
    // snapshotFromState does the filtering; here we assert the builder never
    // fabricates cross-project nodes from unresolved links.
    const g = extractGraph(
      snapshot({
        projectId: 'proj_test',
        notes: [note({ id: 'n1', title: 'A', content: '[[Secret in other project]]' })],
      }),
    )
    expect(g.nodes).toHaveLength(1)
    expect(g.nodes.every((n) => n.projectId === 'proj_test')).toBe(true)
  })
})
