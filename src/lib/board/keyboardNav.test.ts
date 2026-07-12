import { describe, expect, it } from 'vitest'
import type { BoardNode } from '@/types/model'
import {
  cardAccessibleName,
  cardTypeNoun,
  isEditableTarget,
  MOVE_STEP,
  MOVE_STEP_LARGE,
  MOVE_STEP_PRECISE,
  moveStepFor,
  nearestInDirection,
  resolveBoardKey,
  type BoardKeyContext,
} from './keyboardNav'

/**
 * Board keyboard operability (A11Y-1). These cover the pure decision layer
 * the canvas controller is built on: which key does what, that shortcuts
 * never fire inside editors, step sizes, accessible names, and spatial
 * targeting for keyboard linking.
 */

const ctx = (over: Partial<BoardKeyContext> = {}): BoardKeyContext => ({
  hasActive: true,
  linking: false,
  readOnly: false,
  editable: false,
  ...over,
})

const node = (over: Partial<BoardNode> & { id: string }): BoardNode =>
  ({
    type: 'note',
    position: { x: 0, y: 0 },
    width: 200,
    height: 140,
    data: { type: 'note', color: 'gray' },
    ...over,
  }) as BoardNode

describe('isEditableTarget — shortcut guard', () => {
  it('treats inputs, textareas, selects and contenteditable as editable', () => {
    expect(isEditableTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true)
    expect(isEditableTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true)
    expect(isEditableTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true)
    expect(
      isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget),
    ).toBe(true)
  })

  it('detects Monaco and the spreadsheet grid via closest()', () => {
    const inMonaco = {
      tagName: 'DIV',
      isContentEditable: false,
      closest: (sel: string) => (sel === '.monaco-editor' ? {} : null),
    }
    const inSheet = {
      tagName: 'DIV',
      isContentEditable: false,
      closest: (sel: string) => (sel === '.sheet-scroll' ? {} : null),
    }
    expect(isEditableTarget(inMonaco as unknown as EventTarget)).toBe(true)
    expect(isEditableTarget(inSheet as unknown as EventTarget)).toBe(true)
  })

  it('does not treat a plain card element as editable', () => {
    const el = { tagName: 'DIV', isContentEditable: false, closest: () => null }
    expect(isEditableTarget(el as unknown as EventTarget)).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})

describe('resolveBoardKey — never fires inside an editor', () => {
  it('returns null for every key when the target is editable', () => {
    for (const key of ['ArrowUp', 'Enter', 'Delete', 'a', 'l', 'Escape']) {
      expect(resolveBoardKey({ key }, ctx({ editable: true }))).toBeNull()
    }
  })
})

describe('resolveBoardKey — creation / selection / move / open / link / delete', () => {
  it('opens the focused card on Enter', () => {
    expect(resolveBoardKey({ key: 'Enter' }, ctx())).toEqual({ kind: 'open' })
  })

  it('moves the focused card with arrows and honours modifiers', () => {
    expect(resolveBoardKey({ key: 'ArrowRight' }, ctx())).toEqual({
      kind: 'move',
      dx: MOVE_STEP,
      dy: 0,
    })
    expect(resolveBoardKey({ key: 'ArrowUp', shift: true }, ctx())).toEqual({
      kind: 'move',
      dx: 0,
      dy: -MOVE_STEP_LARGE,
    })
    expect(resolveBoardKey({ key: 'ArrowLeft', alt: true }, ctx())).toEqual({
      kind: 'move',
      dx: -MOVE_STEP_PRECISE,
      dy: 0,
    })
  })

  it('opens the add-card menu on A (no modifiers), even with nothing focused', () => {
    expect(resolveBoardKey({ key: 'a' }, ctx({ hasActive: false }))).toEqual({
      kind: 'add-menu',
    })
    // A with a command/ctrl modifier is left to the browser
    expect(resolveBoardKey({ key: 'a', meta: true }, ctx())).toBeNull()
  })

  it('starts a keyboard link with L and confirms with Enter/L while linking', () => {
    expect(resolveBoardKey({ key: 'l' }, ctx())).toEqual({ kind: 'link-start' })
    expect(resolveBoardKey({ key: 'Enter' }, ctx({ linking: true }))).toEqual({
      kind: 'link-confirm',
    })
    expect(resolveBoardKey({ key: 'l' }, ctx({ linking: true }))).toEqual({
      kind: 'link-confirm',
    })
    // arrows do not move a card while a link is being drawn
    expect(resolveBoardKey({ key: 'ArrowRight' }, ctx({ linking: true }))).toBeNull()
  })

  it('deletes on Delete/Backspace and cancels on Escape', () => {
    expect(resolveBoardKey({ key: 'Delete' }, ctx())).toEqual({ kind: 'delete' })
    expect(resolveBoardKey({ key: 'Backspace' }, ctx())).toEqual({ kind: 'delete' })
    // delete works from a selection even without a single focused card
    expect(resolveBoardKey({ key: 'Delete' }, ctx({ hasActive: false }))).toEqual({
      kind: 'delete',
    })
    expect(resolveBoardKey({ key: 'Escape' }, ctx())).toEqual({ kind: 'cancel' })
  })

  it('refuses mutating actions for read-only roles but still allows opening', () => {
    const ro = ctx({ readOnly: true })
    expect(resolveBoardKey({ key: 'ArrowRight' }, ro)).toBeNull()
    expect(resolveBoardKey({ key: 'Delete' }, ro)).toBeNull()
    expect(resolveBoardKey({ key: 'l' }, ro)).toBeNull()
    expect(resolveBoardKey({ key: 'a' }, ro)).toBeNull()
    expect(resolveBoardKey({ key: 'Enter' }, ro)).toEqual({ kind: 'open' })
  })

  it('does nothing on arrows/open/link when no card is focused', () => {
    const none = ctx({ hasActive: false })
    expect(resolveBoardKey({ key: 'ArrowRight' }, none)).toBeNull()
    expect(resolveBoardKey({ key: 'Enter' }, none)).toBeNull()
    expect(resolveBoardKey({ key: 'l' }, none)).toBeNull()
  })
})

describe('step sizes + labels', () => {
  it('maps modifiers to step sizes', () => {
    expect(moveStepFor({ key: 'ArrowUp' })).toBe(MOVE_STEP)
    expect(moveStepFor({ key: 'ArrowUp', shift: true })).toBe(MOVE_STEP_LARGE)
    expect(moveStepFor({ key: 'ArrowUp', alt: true })).toBe(MOVE_STEP_PRECISE)
  })

  it('builds accessible names from type + title', () => {
    expect(cardTypeNoun('richdoc')).toBe('document')
    expect(cardAccessibleName(node({ id: 'n', type: 'richdoc', data: { type: 'richdoc', color: 'blue' } }), 'Roadmap')).toBe(
      'document card: Roadmap',
    )
    expect(cardAccessibleName(node({ id: 'n', type: 'note', data: { type: 'note', color: 'gray' } }))).toBe('note card')
    expect(
      cardAccessibleName(node({ id: 's', type: 'section', data: { type: 'section', color: 'gray' } }), 'Ideas'),
    ).toBe('section: Ideas')
  })
})

describe('nearestInDirection — spatial targeting', () => {
  const nodes = [
    node({ id: 'a', position: { x: 0, y: 0 } }),
    node({ id: 'right', position: { x: 400, y: 0 } }),
    node({ id: 'down', position: { x: 0, y: 400 } }),
    node({ id: 'far', position: { x: 2000, y: 0 } }),
  ]

  it('finds the nearest card in a cardinal direction', () => {
    expect(nearestInDirection(nodes, 'a', 'right')).toBe('right')
    expect(nearestInDirection(nodes, 'a', 'down')).toBe('down')
  })

  it('returns null when nothing lies that way', () => {
    expect(nearestInDirection(nodes, 'a', 'left')).toBeNull()
    expect(nearestInDirection(nodes, 'a', 'up')).toBeNull()
  })
})
