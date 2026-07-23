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

describe('duplicateCard — a copy shares the file', () => {
  beforeEach(resetBoard)

  it('points the copy at the same asset instead of copying the bytes', () => {
    const s = useStore.getState()
    const original = s.addCard('asset', { x: 0, y: 0 }, { assetId: 'asset_1' })
    const copy = useStore.getState().duplicateCard(original)
    expect(copy).toBeTruthy()
    const nodes = board().nodes
    expect(nodes).toHaveLength(2)
    // same asset id on both cards — one blob, two views
    expect(nodes.map((n) => n.data.assetId)).toEqual(['asset_1', 'asset_1'])
    expect(copy).not.toBe(original)
  })

  it('offsets the copy so it does not hide the original', () => {
    const original = useStore
      .getState()
      .addCard('asset', { x: 100, y: 50 }, { assetId: 'asset_1' })
    const copy = useStore.getState().duplicateCard(original)!
    const node = board().nodes.find((n) => n.id === copy)!
    expect(node.position).toEqual({ x: 124, y: 74 })
  })

  it('gives the copy independent geometry and styling', () => {
    const original = useStore
      .getState()
      .addCard('asset', { x: 0, y: 0 }, { assetId: 'asset_1' })
    const copy = useStore.getState().duplicateCard(original)!
    useStore.getState().resizeCard(copy, 500, 400)
    useStore.getState().updateCardData(copy, { color: 'red', caption: 'copy only' })

    const originalNode = board().nodes.find((n) => n.id === original)!
    const copyNode = board().nodes.find((n) => n.id === copy)!
    expect(copyNode.width).toBe(500)
    expect(originalNode.width).not.toBe(500)
    expect(copyNode.data.color).toBe('red')
    expect(originalNode.data.color).toBe('gray')
    expect(originalNode.data.caption).toBeUndefined()
    // …while still sharing the underlying file
    expect(copyNode.data.assetId).toBe(originalNode.data.assetId)
  })

  it('selects the copy and deselects everything else', () => {
    const original = useStore
      .getState()
      .addCard('asset', { x: 0, y: 0 }, { assetId: 'asset_1' })
    const copy = useStore.getState().duplicateCard(original)!
    const selected = board().nodes.filter((n) => n.selected)
    expect(selected).toHaveLength(1)
    expect(selected[0].id).toBe(copy)
  })

  it('shares the entity for every reference-backed card type', () => {
    // images, video, audio and attachments all arrive as `asset` cards, and
    // documents/sheets/decks reference their entity the same way
    for (const [type, data] of [
      ['asset', { assetId: 'asset_1' }],
      ['richdoc', { docId: 'doc_1' }],
      ['sheet', { sheetId: 'sheet_1' }],
      ['code', { codeId: 'code_1' }],
      ['presentation', { presentId: 'pres_1' }],
    ] as const) {
      resetBoard()
      const original = useStore.getState().addCard(type, { x: 0, y: 0 }, data)
      const copy = useStore.getState().duplicateCard(original)!
      const copyNode = board().nodes.find((n) => n.id === copy)!
      expect(copyNode.data).toMatchObject(data)
    }
  })

  it('gives a duplicated section a fresh identity and no children', () => {
    const s = useStore.getState()
    const sectionId = s.addSection({ x: 0, y: 0 }, 'Group')
    const child = useStore.getState().addCard('asset', { x: 20, y: 20 }, { assetId: 'a1' })
    useStore.getState().attachCardToSection(child, sectionId)

    const copy = useStore.getState().duplicateCard(sectionId)!
    expect(copy).not.toBe(sectionId)
    const copyNode = board().nodes.find((n) => n.id === copy)!
    // a section node's id IS its section id
    expect(copyNode.data.section?.id).toBe(copy)
    // the copy is an empty frame; the original keeps its card
    expect(copyNode.data.section?.childCardIds).toEqual([])
    const originalNode = board().nodes.find((n) => n.id === sectionId)!
    expect(originalNode.data.section?.childCardIds).toEqual([child])
    // sections must precede their children for React Flow
    expect(board().nodes[0].type).toBe('section')
  })

  it('returns null for a card that no longer exists', () => {
    expect(useStore.getState().duplicateCard('card_missing')).toBeNull()
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
