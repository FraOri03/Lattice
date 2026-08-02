import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '@/store/useStore'
import { currentNav } from './useUrlHistory'
import { serializeNav } from './navUrl'

/**
 * The serialisation half of the URL contract (Phase 11.3.4).
 *
 * The URL's open entity is the ACTIVE TAB. It used to be whichever of the six
 * `active*Id` slots was set first in a hand-written priority order — harmless
 * once exactly one can be set, but it read the projection as if it were the
 * source. These assert the direction of that dependency, which is the whole
 * point of the phase.
 */

beforeEach(() => useStore.setState({ tabSessions: {}, navSurface: 'project' }))

describe('the URL follows the tab session', () => {
  it('carries the active tab', () => {
    const s = useStore.getState()
    const id = s.createNote()
    s.openNote(id)

    const nav = currentNav()
    expect(nav).toMatchObject({ surface: 'project', entity: { kind: 'note', id } })
    expect(serializeNav(nav)).toContain(`e=note.${id}`)
  })

  it('carries no entity when nothing is focused, and keeps the tabs', () => {
    const s = useStore.getState()
    const id = s.createNote()
    s.openNote(id)
    useStore.getState().closeEntityTab({ kind: 'note', id })

    const nav = currentNav()
    expect(nav.surface === 'project' && nav.entity).toBeUndefined()
    expect(serializeNav(nav)).not.toContain('e=')
  })

  it('does not invent an entity from a stale slot', () => {
    const s = useStore.getState()
    const id = s.createNote()
    // a slot written behind the session's back — what every open* helper used
    // to do, and what nothing may do again
    useStore.setState({ activeNoteId: id })

    const nav = currentNav()
    expect(nav.surface === 'project' && nav.entity).toBeUndefined()
  })

  it('says nothing about a project when the dashboard is showing', () => {
    useStore.getState().openDashboard()
    expect(currentNav()).toEqual({ surface: 'dashboard' })
    expect(serializeNav(currentNav())).toBe('')
  })
})
