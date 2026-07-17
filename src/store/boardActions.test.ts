import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './useStore'

/**
 * Store actions that the board keyboard controller (A11Y-1) and the URL
 * history restore (issue #10) drive. Testing them directly proves the
 * create/select/move/link/delete + restore operations without mounting
 * React Flow (which needs layout/WebGL jsdom can't provide), and exercises
 * the board at scale (the "100+ cards stays coherent" case).
 */

function board() {
  const s = useStore.getState()
  return s.boards[s.activeBoardId]
}

function resetBoard() {
  const s = useStore.getState()
  const bid = s.activeBoardId
  useStore.setState({
    boards: { ...s.boards, [bid]: { ...s.boards[bid], nodes: [], edges: [] } },
  })
}

describe('board keyboard-driven actions', () => {
  beforeEach(resetBoard)

  it('adds a card already selected (creation → selection follows it)', () => {
    const id = useStore.getState().addCard('link', { x: 10, y: 20 })
    expect(board().nodes.find((n) => n.id === id)?.selected).toBe(true)
    expect(board().nodes.filter((n) => n.selected)).toHaveLength(1)
  })

  it('selectCard selects exactly one card', () => {
    const a = useStore.getState().addCard('link', { x: 0, y: 0 })
    const b = useStore.getState().addCard('link', { x: 100, y: 0 })
    useStore.getState().selectCard(a)
    expect(board().nodes.find((n) => n.id === a)?.selected).toBe(true)
    expect(board().nodes.find((n) => n.id === b)?.selected).toBe(false)
  })

  it('nudgeCards moves a card by a delta (arrow-key move)', () => {
    const id = useStore.getState().addCard('link', { x: 100, y: 100 })
    useStore.getState().nudgeCards([id], 10, -50)
    expect(board().nodes.find((n) => n.id === id)?.position).toEqual({ x: 110, y: 50 })
  })

  it('onConnect links two cards (keyboard link)', () => {
    const a = useStore.getState().addCard('link', { x: 0, y: 0 })
    const b = useStore.getState().addCard('link', { x: 200, y: 0 })
    useStore
      .getState()
      .onConnect({ source: a, target: b, sourceHandle: null, targetHandle: null })
    expect(board().edges.some((e) => e.source === a && e.target === b)).toBe(true)
  })

  it('deleteCard removes the card and its edges', () => {
    const a = useStore.getState().addCard('link', { x: 0, y: 0 })
    const b = useStore.getState().addCard('link', { x: 200, y: 0 })
    useStore
      .getState()
      .onConnect({ source: a, target: b, sourceHandle: null, targetHandle: null })
    useStore.getState().deleteCard(a)
    expect(board().nodes.find((n) => n.id === a)).toBeUndefined()
    expect(board().edges.some((e) => e.source === a)).toBe(false)
  })

  it('stays coherent with 120 cards (large board)', () => {
    for (let i = 0; i < 120; i++) {
      useStore.getState().addCard('link', { x: i * 10, y: 0 })
    }
    expect(board().nodes).toHaveLength(120)
    const last = board().nodes[board().nodes.length - 1]
    useStore.getState().selectCard(last.id)
    useStore.getState().nudgeCards([last.id], 5, 5)
    expect(board().nodes.filter((n) => n.selected)).toHaveLength(1)
    const count = board().nodes.length
    useStore.getState().deleteCard(last.id)
    expect(board().nodes).toHaveLength(count - 1)
  })
})

describe('applyNav — URL/history restore', () => {
  it('restores project, mode and the single open entity', () => {
    const s = useStore.getState()
    const pid = s.activeProjectId
    const docId = s.createDoc({ title: 'Restore me' })
    s.applyNav({ projectId: pid, mode: 'doc', entity: { kind: 'doc', id: docId } })
    const after = useStore.getState()
    expect(after.activeProjectId).toBe(pid)
    expect(after.viewMode).toBe('doc')
    expect(after.activeDocId).toBe(docId)
    // opening one entity clears the others
    expect(after.activeSheetId).toBeNull()
    expect(after.activeCodeId).toBeNull()
  })

  it('ignores an unknown project id (safe no-op)', () => {
    const before = useStore.getState().activeProjectId
    useStore.getState().applyNav({ projectId: 'proj_missing', mode: 'board' })
    expect(useStore.getState().activeProjectId).toBe(before)
  })
})
