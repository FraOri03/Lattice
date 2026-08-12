import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { CommandPalette } from './CommandPalette'

/**
 * The palette, against 13.4 — the two bugs that only appear once a surface with
 * no project open exists, and the create path that used to inherit a target
 * silently.
 *
 * The ranking itself is asserted in `lib/palette/rank.test.ts`; these are about
 * what reaches the list and what happens when something is picked.
 */

const pristine = useStore.getState()

beforeEach(() => {
  useStore.setState(pristine, true)
  useStore.setState({ locale: 'en' })
  useUiStore.setState({ paletteOpen: true })
})
afterEach(() => useUiStore.setState({ paletteOpen: false }))

const list = () => within(screen.getByRole('listbox'))
const type = (value: string) =>
  fireEvent.change(screen.getByRole('textbox'), { target: { value } })

/** Two projects, one file each, so "global" has something to be global about. */
function seedTwoProjects() {
  const s = useStore.getState()
  const alpha = s.createProject({ name: 'Alpha' })
  s.setActiveProject(alpha)
  const here = useStore.getState().createNote({ title: 'Budget here' })
  const beta = useStore.getState().createProject({ name: 'Beta' })
  useStore.getState().setActiveProject(beta)
  const there = useStore.getState().createNote({ title: 'Budget there' })
  return { alpha, beta, here, there }
}

describe('search is global', () => {
  it('finds files in every project, not only the one that happens to be open', () => {
    const { alpha } = seedTwoProjects()
    useStore.getState().setActiveProject(alpha) // Beta is now the "other" project

    render(<CommandPalette />)
    type('budget')

    expect(list().getByText('Budget here')).toBeInTheDocument()
    // this is the row the old project-scoped filter hid
    expect(list().getByText('Budget there')).toBeInTheDocument()
  })

  it('searches every project from the dashboard, where no project is open', () => {
    seedTwoProjects()
    useStore.setState({ navSurface: 'dashboard' })

    render(<CommandPalette />)
    type('budget')

    expect(list().getByText('Budget here')).toBeInTheDocument()
    expect(list().getByText('Budget there')).toBeInTheDocument()
  })

  it('names the project each result lives in', () => {
    const { alpha } = seedTwoProjects()
    useStore.getState().setActiveProject(alpha)

    render(<CommandPalette />)
    type('budget there')

    const row = list().getByText('Budget there').closest('button')!
    expect(row).toHaveTextContent('Beta')
  })

  it('opens a result from another project by moving there first', () => {
    const { alpha, there } = seedTwoProjects()
    useStore.getState().setActiveProject(alpha)

    render(<CommandPalette />)
    type('budget there')
    fireEvent.click(list().getByText('Budget there'))

    expect(useStore.getState().activeProjectId).not.toBe(alpha)
    expect(useStore.getState().notes[there]).toBeTruthy()
  })
})

describe('the zero-query state', () => {
  it('offers the six destinations as Go to', () => {
    render(<CommandPalette />)

    const goto = list().getByText('Go to').parentElement!
    for (const name of ['Home', 'Recents', 'Starred', 'Shared with me', 'Invites', 'Trash']) {
      expect(within(goto).getByText(name)).toBeInTheDocument()
    }
  })

  it('reaches a destination, which is what makes the palette their keyboard route', () => {
    render(<CommandPalette />)
    fireEvent.click(list().getByText('Trash'))

    expect(useStore.getState().dashboardDestination).toBe('trash')
    expect(useStore.getState().navSurface).toBe('dashboard')
  })
})

describe('creation names its destination', () => {
  it('says where a file would land before it happens', () => {
    const { alpha } = seedTwoProjects()
    useStore.getState().setActiveProject(alpha)

    render(<CommandPalette />)

    const row = list().getByText('New Markdown note').closest('button')!
    expect(row).toHaveTextContent('in Alpha')
  })

  it('asks for a target from the dashboard instead of inheriting the last project', () => {
    seedTwoProjects()
    useStore.setState({ navSurface: 'dashboard' })

    render(<CommandPalette />)
    fireEvent.click(list().getByText('New Markdown note'))

    // the palette becomes the target question rather than creating anything
    expect(screen.getByText('Where should the Markdown note go?')).toBeInTheDocument()
    expect(list().getByText(/Alpha/)).toBeInTheDocument()
    expect(list().getByText(/Beta/)).toBeInTheDocument()
  })

  it('creates in the project the target question resolved to', () => {
    const { alpha } = seedTwoProjects()
    useStore.setState({ navSurface: 'dashboard' })

    render(<CommandPalette />)
    fireEvent.click(list().getByText('New Markdown note'))
    fireEvent.click(list().getByText(/Alpha/))

    const s = useStore.getState()
    expect(s.activeProjectId).toBe(alpha)
    const created = Object.values(s.notes).filter((n) => n.projectId === alpha)
    expect(created.length).toBeGreaterThan(1)
  })

  it('does not ask when there is only one project to ask about', () => {
    const s = useStore.getState()
    const only = Object.values(s.projects)[0]
    useStore.setState({ navSurface: 'dashboard' })

    render(<CommandPalette />)
    const row = list().getByText('New Markdown note').closest('button')!
    expect(row).toHaveTextContent(`in ${only.name}`)
  })
})

describe('a failed search is a place to act', () => {
  it('offers to create what was typed, named', () => {
    seedTwoProjects()

    render(<CommandPalette />)
    type('quarterly review')

    expect(list().getByText('Create Markdown note “quarterly review”')).toBeInTheDocument()
    expect(list().getByText('Create document “quarterly review”')).toBeInTheDocument()
  })

  it('creates it with that name', () => {
    seedTwoProjects()

    render(<CommandPalette />)
    type('quarterly review')
    fireEvent.click(list().getByText('Create Markdown note “quarterly review”'))

    const titles = Object.values(useStore.getState().notes).map((n) => n.title)
    expect(titles).toContain('quarterly review')
  })
})

describe('keyboard and roles', () => {
  it('is a dialog holding a listbox, with the cursor as the active option', () => {
    render(<CommandPalette />)

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    const input = screen.getByRole('textbox')
    const active = input.getAttribute('aria-activedescendant')
    expect(active).toBeTruthy()
    expect(document.getElementById(active!)).toHaveAttribute('aria-selected', 'true')
  })

  it('moves the active option with the arrow keys', () => {
    render(<CommandPalette />)
    const input = screen.getByRole('textbox')
    const first = input.getAttribute('aria-activedescendant')

    fireEvent.keyDown(input, { key: 'ArrowDown' })

    expect(input.getAttribute('aria-activedescendant')).not.toBe(first)
  })

  it('Escape backs out of the target question before closing the palette', () => {
    seedTwoProjects()
    useStore.setState({ navSurface: 'dashboard' })

    render(<CommandPalette />)
    fireEvent.click(list().getByText('New Markdown note'))
    const input = screen.getByRole('textbox')

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByText('Where should the Markdown note go?')).toBeNull()
    expect(useUiStore.getState().paletteOpen).toBe(true)

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(useUiStore.getState().paletteOpen).toBe(false)
  })
})

describe('the dead end says so', () => {
  it('quotes the query above the create offers, and announces no results', async () => {
    seedTwoProjects()

    render(<CommandPalette />)
    type('quarterly review')

    // the offers are a way out, not three results — the message stays
    expect(screen.getByText('Nothing matches “quarterly review”')).toBeInTheDocument()
  })
})
