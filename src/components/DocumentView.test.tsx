import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import { DocumentView } from './DocumentView'

/**
 * The note pane's action cluster on the shared primitives (Phase 11.1.5b).
 *
 * A note is markdown, so this bar stays tiny on purpose: switch view, export,
 * close. What the audit found missing here was the semantics, not controls —
 * the write/preview pair conveyed its state through a background colour alone,
 * with no role, no name and no `aria-pressed`.
 */

function openNote(content = 'hello') {
  const s = useStore.getState()
  const id = s.createNote()
  s.updateNote(id, { title: 'Test note', content })
  // opening the note IS clearing the rest since 11.3.5: one entity is open
  // at a time, so this no longer has to null four fields by hand
  s.openNote(id)
  return id
}

beforeEach(() => useStore.setState({ locale: 'en', viewMode: 'doc' }))
afterEach(() => useStore.setState({ locale: 'en', viewMode: 'board' }))

describe('Note actions', () => {
  it('is a named toolbar with one tab stop', () => {
    openNote()
    render(<DocumentView />)
    expect(screen.getByRole('toolbar', { name: 'Note actions' })).toBeInTheDocument()
    const controls = [...document.querySelectorAll<HTMLElement>('[data-toolbar-control]')]
    expect(controls.filter((c) => c.tabIndex === 0)).toHaveLength(1)
  })

  it('exposes the view switch as a pressed pair, not a coloured background', () => {
    openNote()
    render(<DocumentView />)
    expect(screen.getByRole('button', { name: 'Write' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('switches to the rendered preview and back', () => {
    openNote('# Heading')
    render(<DocumentView />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // the write textarea is gone while previewing
    expect(screen.queryByPlaceholderText(/write markdown/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Write' }))
    expect(screen.getByPlaceholderText(/write markdown/i)).toBeInTheDocument()
  })

  it('names export and close, which had only a title before', () => {
    openNote()
    render(<DocumentView />)
    expect(screen.getByRole('button', { name: 'Export as Markdown' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close editor' })).toBeInTheDocument()
  })

  it('hides Close on the board, where there is nothing to close to', () => {
    openNote()
    useStore.setState({ viewMode: 'board' })
    render(<DocumentView />)
    expect(screen.queryByRole('button', { name: 'Close editor' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Write' })).toBeInTheDocument()
  })

  it('inherits none of the Document toolbar', () => {
    openNote()
    render(<DocumentView />)
    for (const absent of ['Bold', 'Italic', 'Insert table', 'Block type', 'Undo']) {
      expect(screen.queryByRole('button', { name: absent })).toBeNull()
    }
  })

  it('switches to Italian', () => {
    openNote()
    useStore.setState({ locale: 'it' })
    render(<DocumentView />)
    expect(screen.getByRole('toolbar', { name: 'Azioni nota' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scrivi' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anteprima' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chiudi editor' })).toBeInTheDocument()
  })
})
