import { describe, expect, it } from 'vitest'
import {
  fileInto,
  foldersOf,
  groupByFolder,
  itemsInFolder,
  nextFolderOrder,
  unfileFrom,
  uniqueFolderName,
} from './folders'
import type { Folder } from '@/types/model'

/**
 * Folder grouping rules. The load-bearing guarantee here is that folders
 * only ever hold a POINTER: no operation may lose an item, so deleting a
 * folder or pointing at a missing one must still surface everything.
 */

const folder = (over: Partial<Folder> & { id: string }): Folder => ({
  name: over.id,
  category: 'docs',
  projectId: 'proj_a',
  order: 0,
  collapsed: false,
  createdAt: 0,
  updatedAt: 0,
  ...over,
})

const item = (id: string, folderId?: string) => ({ id, folderId })

describe('foldersOf', () => {
  it('keeps only the category and project asked for', () => {
    const folders = {
      f1: folder({ id: 'f1', category: 'docs', projectId: 'proj_a' }),
      f2: folder({ id: 'f2', category: 'notes', projectId: 'proj_a' }),
      f3: folder({ id: 'f3', category: 'docs', projectId: 'proj_b' }),
    }
    expect(foldersOf(folders, 'docs', 'proj_a').map((f) => f.id)).toEqual(['f1'])
  })

  it('sorts by order, then by name', () => {
    const folders = {
      b: folder({ id: 'b', name: 'Beta', order: 1 }),
      a: folder({ id: 'a', name: 'Alpha', order: 0 }),
      c: folder({ id: 'c', name: 'Aaa', order: 1 }),
    }
    expect(foldersOf(folders, 'docs', 'proj_a').map((f) => f.name)).toEqual([
      'Alpha',
      'Aaa',
      'Beta',
    ])
  })
})

describe('groupByFolder', () => {
  it('splits items into their folders and the unfiled remainder', () => {
    const folders = [folder({ id: 'f1' }), folder({ id: 'f2' })]
    const { groups, unfiled } = groupByFolder(
      [item('a', 'f1'), item('b'), item('c', 'f2'), item('d', 'f1')],
      folders,
    )
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'd'])
    expect(groups[1].items.map((i) => i.id)).toEqual(['c'])
    expect(unfiled.map((i) => i.id)).toEqual(['b'])
  })

  it('keeps an empty folder in the output', () => {
    const { groups } = groupByFolder([item('a')], [folder({ id: 'f1' })])
    expect(groups).toHaveLength(1)
    expect(groups[0].items).toEqual([])
  })

  it('shows items pointing at a missing folder as unfiled, never hidden', () => {
    const { groups, unfiled } = groupByFolder([item('a', 'ghost')], [folder({ id: 'f1' })])
    expect(groups[0].items).toEqual([])
    expect(unfiled.map((i) => i.id)).toEqual(['a'])
  })

  it('loses nothing: every item lands in exactly one bucket', () => {
    const folders = [folder({ id: 'f1' }), folder({ id: 'f2' })]
    const items = [item('a', 'f1'), item('b'), item('c', 'ghost'), item('d', 'f2')]
    const { groups, unfiled } = groupByFolder(items, folders)
    const seen = [...groups.flatMap((g) => g.items), ...unfiled].map((i) => i.id)
    expect(seen.sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('unfileFrom — deleting a folder keeps its items', () => {
  it('clears the pointer instead of removing records', () => {
    const records = { a: item('a', 'f1'), b: item('b', 'f2'), c: item('c') }
    const out = unfileFrom(records, ['f1'])
    expect(Object.keys(out).sort()).toEqual(['a', 'b', 'c'])
    expect(out.a.folderId).toBeUndefined()
    expect(out.b.folderId).toBe('f2')
  })

  it('returns the same object when nothing pointed at the folder', () => {
    const records = { a: item('a', 'f2') }
    expect(unfileFrom(records, ['f1'])).toBe(records)
  })
})

describe('fileInto — moving between folders', () => {
  it('moves an item into a folder', () => {
    const out = fileInto({ a: item('a') }, 'a', 'f1')
    expect(out.a.folderId).toBe('f1')
  })

  it('moves an item out with null', () => {
    const out = fileInto({ a: item('a', 'f1') }, 'a', null)
    expect(out.a.folderId).toBeUndefined()
  })

  it('is a no-op for an unknown item or an unchanged folder', () => {
    const records = { a: item('a', 'f1') }
    expect(fileInto(records, 'ghost', 'f1')).toBe(records)
    expect(fileInto(records, 'a', 'f1')).toBe(records)
  })
})

describe('naming and ordering', () => {
  it('appends a suffix instead of allowing a duplicate name', () => {
    const siblings = [folder({ id: 'f1', name: 'Drafts' })]
    expect(uniqueFolderName('Drafts', siblings)).toBe('Drafts 2')
    expect(uniqueFolderName('drafts', siblings)).toBe('drafts 2')
    expect(uniqueFolderName('Other', siblings)).toBe('Other')
  })

  it('keeps counting past an existing suffix', () => {
    const siblings = [
      folder({ id: 'f1', name: 'Drafts' }),
      folder({ id: 'f2', name: 'Drafts 2' }),
    ]
    expect(uniqueFolderName('Drafts', siblings)).toBe('Drafts 3')
  })

  it('falls back to a default for a blank name', () => {
    expect(uniqueFolderName('   ', [])).toBe('New folder')
  })

  it('puts a new folder after the existing ones', () => {
    expect(nextFolderOrder([])).toBe(0)
    expect(nextFolderOrder([folder({ id: 'a', order: 0 }), folder({ id: 'b', order: 4 })])).toBe(5)
  })

  it('lists the items a folder holds', () => {
    const items = [item('a', 'f1'), item('b'), item('c', 'f1')]
    expect(itemsInFolder(items, 'f1').map((i) => i.id)).toEqual(['a', 'c'])
  })
})
