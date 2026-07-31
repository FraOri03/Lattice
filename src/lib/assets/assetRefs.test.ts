import { describe, expect, it } from 'vitest'
import {
  assetRefsOf,
  describeAssetRefs,
  isAssetReferenced,
  summarizeAssetRefs,
  type AssetRefIndex,
} from './assetRefs'
import type { AssetDoc, Board, BoardNode, RichDocMeta } from '@/types/model'

/**
 * Reference counting is what makes "duplicate a card without duplicating the
 * file" safe: the same asset id may be reachable from many cards, documents
 * and bundles, and deleting the binary is only correct once none are left.
 */

const card = (id: string, assetId?: string): BoardNode => ({
  id,
  type: assetId ? 'asset' : 'note',
  position: { x: 0, y: 0 },
  data: { type: assetId ? 'asset' : 'note', color: 'gray', assetId },
})

const board = (id: string, name: string, nodes: BoardNode[]): Board => ({
  id,
  name,
  nodes,
  edges: [],
})

const asset = (id: string, name: string, deps?: Record<string, string>): AssetDoc => ({
  id,
  name,
  kind: 'image',
  ext: 'png',
  mime: 'image/png',
  size: 1,
  originalName: `${name}.png`,
  importedAt: 0,
  assetPath: `assets/${id}.png`,
  importPath: `imports/${name}.png`,
  ...(deps ? { bundle: { dependencies: deps } } : {}),
})

const doc = (id: string, title: string, linked: string[] = []): RichDocMeta => ({
  id,
  title,
  type: 'rich-document',
  createdAt: 0,
  updatedAt: 0,
  linkedAssets: linked,
  outgoingLinks: [],
  snippet: '',
  wordCount: 0,
  outline: [],
  tags: [],
  metadata: {},
})

const index = (over: Partial<AssetRefIndex> = {}): Partial<AssetRefIndex> => over

describe('assetRefsOf', () => {
  it('finds every card pointing at the same asset', () => {
    // the core dedup case: one image inserted twice
    const refs = assetRefsOf(
      'asset_1',
      index({
        boards: { b1: board('b1', 'Moodboard', [card('c1', 'asset_1'), card('c2', 'asset_1')]) },
      }),
    )
    expect(refs).toHaveLength(2)
    expect(refs.every((r) => r.kind === 'card')).toBe(true)
  })

  it('counts references across separate boards', () => {
    const refs = assetRefsOf(
      'asset_1',
      index({
        boards: {
          b1: board('b1', 'One', [card('c1', 'asset_1')]),
          b2: board('b2', 'Two', [card('c2', 'asset_1')]),
        },
      }),
    )
    expect(refs).toHaveLength(2)
    expect(refs.map((r) => r.label)).toEqual(['card on One', 'card on Two'])
  })

  it('ignores cards that reference a different asset', () => {
    const refs = assetRefsOf(
      'asset_1',
      index({ boards: { b1: board('b1', 'B', [card('c1', 'asset_2'), card('c2')]) } }),
    )
    expect(refs).toHaveLength(0)
  })

  it('finds documents embedding the asset', () => {
    const refs = assetRefsOf(
      'asset_1',
      index({ docs: { d1: doc('d1', 'Spec', ['asset_1']) } }),
    )
    expect(refs).toEqual([{ kind: 'document', id: 'd1', label: 'Spec' }])
  })

  it('finds an entity keeping the asset as its imported original', () => {
    const refs = assetRefsOf(
      'asset_1',
      index({ docs: { d1: { ...doc('d1', 'Report'), sourceAssetId: 'asset_1' } } }),
    )
    expect(refs).toEqual([
      { kind: 'source', id: 'd1', label: 'Report (imported original)' },
    ])
  })

  it('finds another asset naming it as a bundle companion', () => {
    const refs = assetRefsOf(
      'tex_1',
      index({
        assets: {
          model: asset('model', 'scene.gltf', { 'textures/wood.png': 'tex_1' }),
          tex_1: asset('tex_1', 'wood'),
        },
      }),
    )
    expect(refs).toEqual([
      { kind: 'bundle', id: 'model', label: 'scene.gltf (companion file)' },
    ])
  })

  it('does not count an asset as referencing itself', () => {
    const refs = assetRefsOf(
      'a1',
      index({ assets: { a1: asset('a1', 'self', { 'x.png': 'a1' }) } }),
    )
    expect(refs).toHaveLength(0)
  })

  it('treats ignored cards as already deleted', () => {
    const idx = index({
      boards: { b1: board('b1', 'B', [card('c1', 'asset_1'), card('c2', 'asset_1')]) },
    })
    // deleting only c1 still leaves c2 holding the file
    expect(isAssetReferenced('asset_1', idx, { ignoreCardIds: ['c1'] })).toBe(true)
    // deleting both releases it
    expect(isAssetReferenced('asset_1', idx, { ignoreCardIds: ['c1', 'c2'] })).toBe(false)
  })

  it('returns nothing for an unreferenced or empty id', () => {
    expect(assetRefsOf('nope', index({ boards: {} }))).toHaveLength(0)
    expect(assetRefsOf('', index({}))).toHaveLength(0)
  })

  it('tolerates a partial index', () => {
    expect(() => assetRefsOf('a1', {})).not.toThrow()
  })
})

describe('describeAssetRefs', () => {
  it('is empty when nothing references the asset', () => {
    expect(describeAssetRefs([])).toBe('')
  })

  it('uses the singular for one reference', () => {
    const refs = assetRefsOf(
      'asset_1',
      index({ boards: { b1: board('b1', 'B', [card('c1', 'asset_1')]) } }),
    )
    expect(describeAssetRefs(refs)).toBe('1 card')
  })

  it('joins several kinds readably', () => {
    const refs = assetRefsOf(
      'asset_1',
      index({
        boards: { b1: board('b1', 'B', [card('c1', 'asset_1'), card('c2', 'asset_1')]) },
        docs: { d1: doc('d1', 'Spec', ['asset_1']) },
      }),
    )
    expect(describeAssetRefs(refs)).toBe('2 cards and 1 document')
    expect(summarizeAssetRefs(refs)).toMatchObject({ card: 2, document: 1 })
  })
})
