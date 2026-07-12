import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '@/store/useStore'
import { MODE_METAS } from '@/components/topbarModes'
import { snapshotFromState } from '../graphSource'
import { extractGraph, nodeId } from '../GraphBuilder'
import { navigateToNode } from '../GraphNavigationService'
import { decodeGraphSettings } from '../GraphSettingsService'
import type { LatticeGraphNode } from '../graphTypes'

/**
 * Integration coverage that exercises the real Zustand store, the snapshot
 * selector, the builder and the navigation service together — the DOM-free
 * half of the acceptance criteria (top-bar order, scoping, node → workspace,
 * settings persistence, seed relationships).
 */

function graphNode(kind: LatticeGraphNode['kind'], entityId: string): LatticeGraphNode {
  return { id: nodeId(kind, entityId), entityId, projectId: 'p', kind, label: 'x' }
}

describe('top-bar order', () => {
  it('places Graph immediately after Board', () => {
    expect(MODE_METAS[0].mode).toBe('board')
    expect(MODE_METAS[1].mode).toBe('graph')
    // and the rest of the required order follows
    expect(MODE_METAS.map((m) => m.mode)).toEqual([
      'board',
      'graph',
      'split',
      'doc',
      'sheet',
      'presentation',
      'code',
    ])
  })
})

describe('snapshot project scoping', () => {
  it('only includes entities of the requested project', () => {
    const state = useStore.getState()
    const otherProject = state.createProject({ name: 'Other' })
    // a note in the default project and one in the other project
    const here = state.createNote({ title: 'Mine' })
    useStore.getState().setActiveProject(otherProject)
    const there = useStore.getState().createNote({ title: 'Theirs' })

    const snap = snapshotFromState(useStore.getState(), otherProject)
    const ids = snap.notes.map((n) => n.id)
    expect(ids).toContain(there)
    expect(ids).not.toContain(here)
  })
})

describe('navigation to native workspaces', () => {
  beforeEach(() => {
    useStore.setState({ viewMode: 'graph' })
  })

  it('opens a note node into Document mode', () => {
    const id = useStore.getState().createNote({ title: 'Nav note' })
    const res = navigateToNode(graphNode('note', id))
    expect(res.kind).toBe('opened')
    expect(useStore.getState().activeNoteId).toBe(id)
    expect(useStore.getState().viewMode).toBe('doc')
  })

  it('opens a board node into Board mode', () => {
    useStore.getState().addBoard()
    const boardId = useStore.getState().activeBoardId
    useStore.setState({ viewMode: 'graph' })
    const res = navigateToNode(graphNode('board', boardId))
    expect(res.kind).toBe('opened')
    expect(useStore.getState().viewMode).toBe('board')
  })

  it('opens a splittable entity beside the graph when requested', () => {
    const id = useStore.getState().createDoc({ title: 'Split doc' })
    navigateToNode(graphNode('document', id), { split: true })
    expect(useStore.getState().viewMode).toBe('split')
    expect(useStore.getState().activeDocId).toBe(id)
  })

  it('treats a tag node as a focus-local request, not a navigation', () => {
    const res = navigateToNode(graphNode('tag', 'research'))
    expect(res.kind).toBe('focus-local')
  })
})

describe('graph settings persistence', () => {
  it('clamps and persists per-project settings through the store', () => {
    const pid = useStore.getState().activeProjectId
    useStore.getState().setGraphSettings(pid, { depth: 999, layout: 'radial' })
    const stored = useStore.getState().graphSettings[pid]
    expect(stored.depth).toBe(5) // clamped
    expect(stored.layout).toBe('radial')
    // survives a decode round-trip (what a reload would do)
    expect(decodeGraphSettings(stored).depth).toBe(5)
  })
})

describe('seed relationships end to end', () => {
  it('turns the seeded welcome notes and board edges into graph edges', () => {
    // fresh store state already contains the seed board + notes
    const state = useStore.getState()
    const snap = snapshotFromState(state, 'proj_default')
    const graph = extractGraph(snap)
    // wikilinks: "Welcome to Lattice" ↔ "Canvas basics" / "Roadmap"
    const wiki = graph.edges.filter((e) => e.sourceSystem === 'wikilink')
    expect(wiki.length).toBeGreaterThan(0)
    // board edges become typed board relationships
    const boardEdges = graph.edges.filter((e) => e.sourceSystem === 'board-edge')
    expect(boardEdges.length).toBeGreaterThan(0)
    // every node belongs to the requested project
    expect(graph.nodes.every((n) => n.projectId === 'proj_default')).toBe(true)
  })
})
