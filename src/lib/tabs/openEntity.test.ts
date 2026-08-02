import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '@/store/useStore'
import { openEntityOf, openIdOf, tabShortcutFor } from './openEntity'

/**
 * Reading what is open, and the keys that move between tabs (11.3.3/11.3.5).
 *
 * The shortcut mapping is asserted here rather than through the browser on
 * purpose: automation does not deliver PageUp/PageDown reliably (the event
 * arrives with an empty `key`), so driving it that way would prove nothing.
 */

const key = (k: string, mods: { ctrl?: boolean; meta?: boolean; alt?: boolean } = {}) => ({
  key: k,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  altKey: !!mods.alt,
})

describe('tabShortcutFor', () => {
  it('cycles with Ctrl/Cmd+Alt+PageDown / PageUp', () => {
    expect(tabShortcutFor(key('PageDown', { ctrl: true, alt: true }))).toBe('next')
    expect(tabShortcutFor(key('PageUp', { ctrl: true, alt: true }))).toBe('previous')
    expect(tabShortcutFor(key('PageDown', { meta: true, alt: true }))).toBe('next')
  })

  it('closes with Ctrl/Cmd+Alt+W, whatever the shift state spells', () => {
    expect(tabShortcutFor(key('w', { ctrl: true, alt: true }))).toBe('close')
    expect(tabShortcutFor(key('W', { meta: true, alt: true }))).toBe('close')
  })

  it('never claims Cmd/Ctrl+W — that one belongs to the browser', () => {
    expect(tabShortcutFor(key('w', { ctrl: true }))).toBeNull()
    expect(tabShortcutFor(key('w', { meta: true }))).toBeNull()
  })

  it('ignores the bare keys and Alt on its own', () => {
    expect(tabShortcutFor(key('PageDown'))).toBeNull()
    expect(tabShortcutFor(key('PageDown', { alt: true }))).toBeNull()
    expect(tabShortcutFor(key('a', { ctrl: true, alt: true }))).toBeNull()
  })
})

describe('openEntityOf / openIdOf', () => {
  beforeEach(() => useStore.setState({ tabSessions: {}, navSurface: 'project' }))

  it('answers with the active tab, and only for its own kind', () => {
    const s = useStore.getState()
    const id = s.createNote()
    s.openNote(id)

    const state = useStore.getState()
    expect(openEntityOf(state)).toEqual({ kind: 'note', id })
    expect(openIdOf(state, 'note')).toBe(id)
    expect(openIdOf(state, 'doc')).toBeNull()
  })

  it('answers null when the project has nothing focused', () => {
    const state = useStore.getState()
    expect(openEntityOf(state)).toBeNull()
    expect(openIdOf(state, 'note')).toBeNull()
  })
})
