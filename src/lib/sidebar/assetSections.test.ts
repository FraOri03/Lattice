import { describe, expect, it } from 'vitest'
import type { Board, BoardNode } from '@/types/model'
import { assetSectionGroups } from './assetSections'

/**
 * The asset library's automatic grouping by board section.
 *
 * What is load-bearing here is that the grouping is a READING of the board
 * and never a second copy of it: a file's group follows the card that uses
 * it, and a file no section uses must still reach the caller ungrouped, so
 * that grouping can never make a file disappear from the sidebar.
 */

const section = (id: string, title: string, x: number, y: number): BoardNode =>
  ({
    id,
    type: 'section',
    position: { x, y },
    width: 800,
    height: 600,
    data: {
      type: 'section',
      color: 'gray',
      section: {
        id,
        title,
        x,
        y,
        width: 800,
        height: 600,
        color: 'gray',
        collapsed: false,
        childCardIds: [],
        metadata: {},
      },
    },
  }) as BoardNode

const card = (id: string, assetId?: string, parentId?: string): BoardNode =>
  ({
    id,
    type: assetId ? 'asset' : 'note',
    position: { x: 10, y: 10 },
    ...(parentId ? { parentId } : {}),
    data: { type: assetId ? 'asset' : 'note', color: 'gray', assetId },
  }) as BoardNode

const board = (name: string, nodes: BoardNode[]): Board => ({
  id: `board_${name}`,
  name,
  nodes,
  edges: [],
})

const asset = (id: string, folderId?: string) => ({ id, folderId })

describe('assetSectionGroups', () => {
  it('groups a file under the section whose card uses it', () => {
    const boards = [
      board('Storyboard', [
        section('s1', 'KEYFRAME 8', 0, 0),
        card('c1', 'a1', 's1'),
        card('c2', 'a2', 's1'),
      ]),
    ]
    const groups = assetSectionGroups([asset('a1'), asset('a2')], boards)
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('KEYFRAME 8')
    expect(groups[0].id).toBe('s1')
    expect(groups[0].items.map((a) => a.id)).toEqual(['a1', 'a2'])
  })

  it('leaves a file ungrouped when its card sits outside every section', () => {
    const boards = [board('Storyboard', [section('s1', 'KEYFRAME 8', 0, 0), card('c1', 'a1')])]
    expect(assetSectionGroups([asset('a1')], boards)).toEqual([])
  })

  it('leaves a file ungrouped when nothing on any board uses it', () => {
    const boards = [board('Storyboard', [section('s1', 'KEYFRAME 8', 0, 0), card('c1', 'a1', 's1')])]
    const groups = assetSectionGroups([asset('a1'), asset('a2')], boards)
    expect(groups.flatMap((g) => g.items.map((a) => a.id))).toEqual(['a1'])
  })

  it('lists a file under every section that uses it', () => {
    const boards = [
      board('Storyboard', [
        section('s1', 'KEYFRAME 8', 0, 0),
        section('s2', 'KEYFRAME 9', 0, 900),
        card('c1', 'a1', 's1'),
        card('c2', 'a1', 's2'),
      ]),
    ]
    const groups = assetSectionGroups([asset('a1')], boards)
    expect(groups.map((g) => g.label)).toEqual(['KEYFRAME 8', 'KEYFRAME 9'])
    expect(groups.every((g) => g.items.length === 1)).toBe(true)
  })

  it('counts a file once per section however many cards use it', () => {
    const boards = [
      board('Storyboard', [
        section('s1', 'KEYFRAME 8', 0, 0),
        card('c1', 'a1', 's1'),
        card('c2', 'a1', 's1'),
      ]),
    ]
    expect(assetSectionGroups([asset('a1')], boards)[0].items).toHaveLength(1)
  })

  it('orders sections top to bottom, then left to right', () => {
    const boards = [
      board('Storyboard', [
        section('s3', 'THIRD', 900, 900),
        section('s1', 'FIRST', 0, 0),
        section('s2', 'SECOND', 0, 900),
        card('c1', 'a1', 's1'),
        card('c2', 'a2', 's2'),
        card('c3', 'a3', 's3'),
      ]),
    ]
    expect(assetSectionGroups([asset('a1'), asset('a2'), asset('a3')], boards).map((g) => g.label))
      .toEqual(['FIRST', 'SECOND', 'THIRD'])
  })

  it('keeps the caller ordering inside a group', () => {
    const boards = [
      board('Storyboard', [
        section('s1', 'KEYFRAME 8', 0, 0),
        card('c1', 'a1', 's1'),
        card('c2', 'a2', 's1'),
      ]),
    ]
    // callers sort by import date, newest first — the group must not resort
    const groups = assetSectionGroups([asset('a2'), asset('a1')], boards)
    expect(groups[0].items.map((a) => a.id)).toEqual(['a2', 'a1'])
  })

  it('walks the boards it is given, naming each section board in the hint', () => {
    const boards = [
      board('Shots', [section('s1', 'KEYFRAME 8', 0, 0), card('c1', 'a1', 's1')]),
      board('Moodboard', [section('s2', 'Refs', 0, 0), card('c2', 'a2', 's2')]),
    ]
    const groups = assetSectionGroups([asset('a1'), asset('a2')], boards)
    expect(groups.map((g) => g.hint)).toEqual([
      'Used by cards in this section on Shots',
      'Used by cards in this section on Moodboard',
    ])
  })

  it('falls back to a readable label for an unnamed section', () => {
    const boards = [board('Storyboard', [section('s1', '   ', 0, 0), card('c1', 'a1', 's1')])]
    expect(assetSectionGroups([asset('a1')], boards)[0].label).toBe('Section')
  })

  it('ignores boards without sections and cards without assets', () => {
    const boards = [board('Notes only', [card('c1'), card('c2')])]
    expect(assetSectionGroups([asset('a1')], boards)).toEqual([])
  })
})
