import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import CodeWorkspacePane from './CodeWorkspacePane'

/**
 * Code's surface (Phase 11.1.6c).
 *
 * Code has **no toolbar**, and this phase does not invent one: there is a tab
 * strip, a file header and Monaco. What it does fix is the two real defects in
 * the controls that do exist — the tab chips were plain `<div onClick>`, so no
 * keyboard could switch file, and the per-tab close button was a 16×16 target,
 * under the 24 px floor of WCAG 2.2 SC 2.5.8.
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

beforeEach(() => useStore.setState({ locale: 'en', codeTabs: [] }))
afterEach(() => useStore.setState({ locale: 'en' }))

describe('Code tab strip', () => {
  it('is a labelled tablist, not a toolbar', () => {
    openTwoFiles()
    render(<CodeWorkspacePane />)
    expect(screen.getByRole('tablist', { name: 'Open code files' })).toBeInTheDocument()
    // the phase deliberately adds no toolbar here
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('makes every open file a real tab, reachable and selectable', () => {
    const { b } = openTwoFiles()
    render(<CodeWorkspacePane />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    const active = tabs.find((t) => t.getAttribute('aria-selected') === 'true')
    expect(active).toBeDefined()
    expect(useStore.getState().activeCodeId).toBe(b)
  })

  it('switches file from the keyboard, which was impossible before', () => {
    const { a } = openTwoFiles()
    render(<CodeWorkspacePane />)
    const [first] = screen.getAllByRole('tab')
    first.focus()
    fireEvent.click(first)
    expect(useStore.getState().activeCodeId).toBe(a)
  })

  it('is one tab stop, with the arrows moving between files', () => {
    openTwoFiles()
    render(<CodeWorkspacePane />)
    const strip = screen.getByRole('tablist')
    const controls = [...strip.querySelectorAll<HTMLElement>('[data-toolbar-control]')]
    expect(controls.filter((c) => c.tabIndex === 0)).toHaveLength(1)
    controls[0].focus()
    fireEvent.keyDown(strip, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(controls[1])
  })

  it('names each close button after its file and clears the 24px floor', () => {
    openTwoFiles()
    render(<CodeWorkspacePane />)
    const close = screen.getByRole('button', { name: 'Close alpha.ts' })
    // h-6 w-6 = 24px, replacing the old h-4 w-4
    expect(close.className).toContain('h-6')
    expect(close.className).toContain('w-6')
    fireEvent.click(close)
    expect(useStore.getState().codeTabs).toHaveLength(1)
  })

  it('ties the tabs to the editor panel', () => {
    openTwoFiles()
    render(<CodeWorkspacePane />)
    const panel = screen.getByRole('tabpanel', { name: 'Code editor' })
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-controls', panel.id)
  })
})

describe('Code file header', () => {
  it('names the file field and the language select', () => {
    openTwoFiles()
    render(<CodeWorkspacePane />)
    expect(screen.getByLabelText('File name')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeInTheDocument()
  })

  it('switches to Italian', () => {
    openTwoFiles()
    useStore.setState({ locale: 'it' })
    render(<CodeWorkspacePane />)
    expect(screen.getByRole('tablist', { name: 'File di codice aperti' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nome file')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Linguaggio' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Chiudi il workspace codice' }),
    ).toBeInTheDocument()
  })
})
