import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import CodeWorkspacePane from './CodeWorkspacePane'

/**
 * Code's surface.
 *
 * Code has **no toolbar**, and Phase 11.1.6c did not invent one: a file
 * header and Monaco, plus the way out of the workspace. The file TABS left
 * this pane in 11.3.3 — they listed the project's tab session filtered to
 * code, which the shell strip now shows in full, so their guarantees are
 * asserted in `EntityTabStrip.test.tsx` instead of here.
 */

vi.mock('./CodeEditor', () => ({ default: () => <div data-testid="monaco" /> }))

function openTwoFiles() {
  const s = useStore.getState()
  const a = s.createCode({ title: 'alpha', language: 'typescript' })
  const b = s.createCode({ title: 'beta', language: 'typescript' })
  s.openCode(a)
  s.openCode(b)
  return { a, b }
}

beforeEach(() => useStore.setState({ locale: 'en', tabSessions: {} }))
afterEach(() => useStore.setState({ locale: 'en' }))

describe('Code workspace', () => {
  it('names the file field and the language select', () => {
    openTwoFiles()
    render(<CodeWorkspacePane />)
    expect(screen.getByLabelText('File name')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeInTheDocument()
  })

  it('keeps the editor a named region and adds no toolbar', () => {
    openTwoFiles()
    render(<CodeWorkspacePane />)
    expect(screen.getByRole('region', { name: 'Code editor' })).toBeInTheDocument()
    expect(screen.queryByRole('toolbar')).toBeNull()
    // the tabs moved to the shell: this pane must not grow a second strip
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('switches to Italian', () => {
    openTwoFiles()
    useStore.setState({ locale: 'it' })
    render(<CodeWorkspacePane />)
    expect(screen.getByLabelText('Nome file')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Linguaggio' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Chiudi il workspace codice' }),
    ).toBeInTheDocument()
  })
})
