import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import { EntityTabStrip } from './EntityTabStrip'
import { openIdOf } from '@/lib/tabs/openEntity'

/**
 * The shell tab strip (Phase 11.3.3).
 *
 * It inherits the accessibility the code-only strip earned in 11.1.6c — a
 * real tablist, one tab stop with arrow navigation, close targets that clear
 * the 24 px floor of WCAG 2.2 SC 2.5.8 — and adds the thing that strip could
 * not do: show a project's open entities whatever section they belong to.
 */

beforeEach(() => useStore.setState({ locale: 'en', tabSessions: {}, navSurface: 'project' }))
afterEach(() => useStore.setState({ locale: 'en' }))

function openAMix() {
  const s = useStore.getState()
  const note = s.createNote()
  s.updateNote(note, { title: 'Field notes' })
  const code = useStore.getState().createCode({ title: 'main', language: 'typescript' })
  useStore.getState().openNote(note)
  useStore.getState().openCode(code)
  return { note, code }
}

describe('EntityTabStrip', () => {
  it('still draws the bar when the project has nothing open', () => {
    render(<EntityTabStrip />)
    expect(screen.getByText('Nothing open yet')).toBeInTheDocument()
    // an empty tab list is a control a screen reader cannot enter, so the
    // empty state is text in the same box, not a `tablist` with no tabs
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
  })

  it('is the same box empty as it is full, so nothing shifts under it', () => {
    const { container, unmount } = render(<EntityTabStrip />)
    const empty = container.firstElementChild!.className
    unmount()
    openAMix()
    const full = render(<EntityTabStrip />).container.firstElementChild!.className
    expect(full).toBe(empty)
  })

  it('lists open entities of every kind, not just one section', () => {
    openAMix()
    render(<EntityTabStrip />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Field notes', 'main.ts'])
  })

  it('marks the active tab as selected', () => {
    openAMix()
    render(<EntityTabStrip />)
    const selected = screen.getAllByRole('tab').filter(
      (t) => t.getAttribute('aria-selected') === 'true',
    )
    expect(selected).toHaveLength(1)
    expect(selected[0]).toHaveTextContent('main.ts')
  })

  it('takes you to the section the entity lives in', () => {
    openAMix()
    render(<EntityTabStrip />)
    fireEvent.click(screen.getByRole('tab', { name: /Field notes/ }))
    const s = useStore.getState()
    expect(openIdOf(s, 'note')).toBeTruthy()
    expect(openIdOf(s, 'code')).toBeNull()
    expect(s.viewMode).toBe('doc')
  })

  it('is one tab stop, with the arrows moving between tabs', () => {
    openAMix()
    render(<EntityTabStrip />)
    const strip = screen.getByRole('tablist', { name: 'Open in this project' })
    const controls = [...strip.querySelectorAll<HTMLElement>('[data-toolbar-control]')]
    expect(controls.filter((c) => c.tabIndex === 0)).toHaveLength(1)
    controls[0].focus()
    fireEvent.keyDown(strip, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(controls[1])
  })

  it('names each close button after its entity and clears the 24px floor', () => {
    openAMix()
    render(<EntityTabStrip />)
    const close = screen.getByRole('button', { name: 'Close Field notes' })
    expect(close.className).toContain('h-6')
    expect(close.className).toContain('w-6')

    fireEvent.click(close)
    const s = useStore.getState()
    expect(s.tabSessions[s.activeProjectId].tabs).toHaveLength(1)
    // closing an inactive tab must not steal the focus from the active one
    expect(openIdOf(s, 'code')).toBeTruthy()
  })

  it('drops a tab whose entity is gone instead of showing a blank chip', () => {
    const { note } = openAMix()
    useStore.setState((s) => ({ notes: Object.fromEntries(
      Object.entries(s.notes).filter(([id]) => id !== note),
    ) }))
    render(<EntityTabStrip />)
    expect(screen.getAllByRole('tab')).toHaveLength(1)
  })

  it('switches to Italian', () => {
    openAMix()
    useStore.setState({ locale: 'it' })
    render(<EntityTabStrip />)
    expect(
      screen.getByRole('tablist', { name: 'Aperti in questo progetto' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chiudi main.ts' })).toBeInTheDocument()
  })
})
