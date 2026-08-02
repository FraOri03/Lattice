import { describe, expect, it, vi } from 'vitest'
import { useStore } from './useStore'

/**
 * Saving a body announces it to the collab layer, which lazily pulls in
 * Yjs and y-indexeddb — a module graph that finishes resolving after this
 * file's environment is torn down, and fails the run as an unhandled
 * rejection. Promotion has nothing to do with realtime, so it is stubbed.
 */
vi.mock('@/lib/collab/ActivityLogService', () => ({ activityLog: { log: () => {} } }))
vi.mock('@/lib/collab/RealtimeDocumentSync', () => ({
  realtimeDocumentSync: { announceSave: () => {} },
}))
vi.mock('@/lib/collab/AutoSnapshot', () => ({ autoSnapshot: { markDirty: () => {} } }))

/**
 * Promotion is the only bridge between the two text entities, and it is
 * destructive on one side: the note is consumed so the same text never
 * lives in two places. These lock what must survive the crossing and what
 * must not be left behind.
 */

describe('promoteNoteToDoc', () => {
  it('carries the title, the tags and the text into a document', async () => {
    const s = useStore.getState()
    const noteId = s.createNote({
      title: 'Kickoff',
      content: '# Kickoff\n\nTies back to [[Roadmap]].',
      tags: ['planning'],
    })

    const docId = await useStore.getState().promoteNoteToDoc(noteId)
    expect(docId).toBeTruthy()

    const doc = useStore.getState().docs[docId!]
    expect(doc.title).toBe('Kickoff')
    expect(doc.tags).toEqual(['planning'])
    expect(doc.snippet).toContain('Kickoff')
    // the wikilink is digested as a real outgoing link, not lost as text
    expect(doc.outgoingLinks).toContain('Roadmap')
  })

  it('consumes the note, so the text exists once', async () => {
    const noteId = useStore.getState().createNote({ title: 'Temp', content: 'x' })
    await useStore.getState().promoteNoteToDoc(noteId)
    expect(useStore.getState().notes[noteId]).toBeUndefined()
  })

  it('keeps the note in its own project', async () => {
    const noteId = useStore
      .getState()
      .createNote({ title: 'Elsewhere', content: 'x', projectId: 'proj_other' })
    const docId = await useStore.getState().promoteNoteToDoc(noteId)
    expect(useStore.getState().docs[docId!].projectId).toBe('proj_other')
  })

  it('returns null for a note that is already gone', async () => {
    expect(await useStore.getState().promoteNoteToDoc('note_missing')).toBeNull()
  })
})
