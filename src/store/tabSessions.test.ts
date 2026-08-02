import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './useStore'

/**
 * Tab sessions in the store (Phase 11.3.2).
 *
 * The store used to hold six independent entity slots that nothing
 * reconciled. They are now derived from the active tab, and these are the
 * consequences worth locking down: the projection really is exclusive, a
 * project remembers what it had open, and closing something updates both the
 * strip and the slots — the "close the tab, the slot survives, the section
 * reopens the entity" bug has nowhere left to live.
 */

const slots = () => {
  const s = useStore.getState()
  return {
    note: s.activeNoteId,
    doc: s.activeDocId,
    code: s.activeCodeId,
    sheet: s.activeSheetId,
    present: s.activePresentId,
    asset: s.activeAssetId,
  }
}

const sessionTabs = () => {
  const s = useStore.getState()
  return (s.tabSessions[s.activeProjectId]?.tabs ?? []).map((t) => `${t.kind}:${t.id}`)
}

beforeEach(() => useStore.setState({ tabSessions: {}, navSurface: 'project' }))

describe('the slots are a projection of the active tab', () => {
  it('sets exactly one slot, whatever was open before', () => {
    const s = useStore.getState()
    const present = s.createPresentDoc()
    s.openPresent(present)
    expect(slots().present).toBe(present)

    const note = useStore.getState().createNote()
    useStore.getState().openNote(note)

    // openNote used to clear four of the five other slots and forget
    // activePresentId; deriving all six removes the chance to forget one
    expect(Object.values(slots()).filter(Boolean)).toEqual([note])
  })

  it('records what is open as a tab, without duplicating on re-open', () => {
    const s = useStore.getState()
    const a = s.createNote()
    const b = s.createDoc()
    s.openNote(a)
    s.openDoc(b)
    s.openNote(a)
    expect(sessionTabs()).toEqual([`note:${a}`, `doc:${b}`])
    expect(slots().note).toBe(a)
  })
})

describe('closing', () => {
  it('moves focus to the tab that takes its place and updates the slots', () => {
    const s = useStore.getState()
    const a = s.createNote()
    const b = s.createDoc()
    s.openNote(a)
    s.openDoc(b)

    useStore.getState().closeEntityTab({ kind: 'doc', id: b })

    expect(sessionTabs()).toEqual([`note:${a}`])
    expect(slots().doc).toBeNull()
    expect(slots().note).toBe(a)
  })

  it('drops the tab when the entity is deleted', () => {
    const s = useStore.getState()
    const id = s.createNote()
    s.openNote(id)
    useStore.getState().deleteNote(id)

    expect(sessionTabs()).toEqual([])
    expect(Object.values(slots()).filter(Boolean)).toEqual([])
  })

  it('closes only its own kind when a section closes', () => {
    const s = useStore.getState()
    const note = s.createNote()
    const sheet = s.createSheetDoc()
    s.openSheet(sheet)
    s.openNote(note)

    // the note is focused, so "close the spreadsheet section" closes nothing
    useStore.getState().closeSheet()
    expect(sessionTabs()).toEqual([`sheet:${sheet}`, `note:${note}`])
    expect(slots().note).toBe(note)
  })
})

describe('per project', () => {
  it('restores what a project had open when you come back to it', () => {
    const s = useStore.getState()
    const alpha = s.createProject({ name: 'Alpha' })
    s.setActiveProject(alpha)
    const note = useStore.getState().createNote()
    useStore.getState().openNote(note)

    const beta = useStore.getState().createProject({ name: 'Beta' })
    useStore.getState().setActiveProject(beta)
    expect(Object.values(slots()).filter(Boolean)).toEqual([]) // Beta opens clean

    useStore.getState().setActiveProject(alpha)
    expect(slots().note).toBe(note)
    expect(sessionTabs()).toEqual([`note:${note}`])
    // and the section follows the restored tab, so the URL, the slots and
    // what renders cannot disagree
    expect(useStore.getState().viewMode).toBe('doc')
  })

  it('keeps sessions apart', () => {
    const s = useStore.getState()
    const alpha = s.createProject({ name: 'Alpha' })
    const beta = s.createProject({ name: 'Beta' })
    s.setActiveProject(alpha)
    useStore.getState().openNote(useStore.getState().createNote())
    useStore.getState().setActiveProject(beta)
    useStore.getState().openDoc(useStore.getState().createDoc())

    const sessions = useStore.getState().tabSessions
    expect(sessions[alpha].tabs).toHaveLength(1)
    expect(sessions[beta].tabs).toHaveLength(1)
    expect(sessions[alpha].tabs[0].kind).toBe('note')
    expect(sessions[beta].tabs[0].kind).toBe('doc')
  })
})

describe('pruneTabSessions', () => {
  it('drops tabs whose entity this browser no longer holds', () => {
    const s = useStore.getState()
    const kept = s.createNote()
    const gone = useStore.getState().createNote()
    useStore.getState().openNote(kept)
    useStore.getState().openNote(gone)

    // deleted the way another browser would: the entity vanishes from the
    // maps without this tab's delete action ever running
    useStore.setState((prev) => ({
      notes: Object.fromEntries(Object.entries(prev.notes).filter(([id]) => id !== gone)),
    }))
    useStore.getState().pruneTabSessions()

    expect(sessionTabs()).toEqual([`note:${kept}`])
    // and the slots follow, so no section can render a ghost
    expect(slots().note).toBe(kept)
  })

  it('leaves an intact session untouched', () => {
    const s = useStore.getState()
    const id = s.createNote()
    s.openNote(id)
    const before = useStore.getState().tabSessions
    useStore.getState().pruneTabSessions()
    expect(useStore.getState().tabSessions).toBe(before)
  })
})

describe('applyNav', () => {
  it('decides which tab is active, not which tabs exist', () => {
    const s = useStore.getState()
    const projectId = s.activeProjectId
    const a = s.createNote()
    const b = s.createDoc()
    s.openNote(a)
    s.openDoc(b)

    // a link with no entity: nothing focused, the strip survives
    useStore.getState().applyNav({
      surface: 'project',
      projectId,
      mode: 'board',
    })
    expect(sessionTabs()).toEqual([`note:${a}`, `doc:${b}`])
    expect(Object.values(slots()).filter(Boolean)).toEqual([])

    useStore.getState().applyNav({
      surface: 'project',
      projectId,
      mode: 'doc',
      entity: { kind: 'note', id: a },
    })
    expect(slots().note).toBe(a)
    expect(sessionTabs()).toHaveLength(2)
  })
})
