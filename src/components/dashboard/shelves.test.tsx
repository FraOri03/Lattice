import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import { useAnnouncer } from '@/lib/a11y/announcer'
import { AccountProvider } from '@/lib/auth/AccountProvider'
import { Dashboard } from './Dashboard'

/**
 * The dashboard mounts the shell's TopBar (15.7), whose ProfileMenu requires
 * the account context. The app always provides it; a bare render would be
 * testing an arrangement that never ships.
 */
const renderDashboard = () =>
  render(
    <AccountProvider>
      <Dashboard />
    </AccountProvider>,
  )

/**
 * Recents and Starred, against the criteria 13.5 §3 sets for each.
 *
 * Both are rendered through the shell rather than in isolation, because the
 * navigation is part of what they promise — reaching them is the destination
 * contract 15.1 built, and asserting the page without it would test a component
 * the app never mounts on its own.
 */

const main = () => within(screen.getByRole('main'))

/**
 * The store has no global reset, and both shelves are assertions about what is
 * NOT on them — an accumulated star from an earlier case would make "nothing
 * pinned" unprovable. So the whole state is captured before any case runs and
 * replaced wholesale between them.
 */
const pristine = useStore.getState()

beforeEach(() => {
  useStore.setState(pristine, true)
  useStore.setState({ locale: 'en', navSurface: 'dashboard' })
})
afterEach(() =>
  useStore.setState({ locale: 'en', navSurface: 'project', dashboardDestination: 'home' }),
)

/** A project holding one note, opened — the smallest thing both shelves show. */
function seedNote(title: string, projectName = 'Alpha') {
  const s = useStore.getState()
  const pid = s.createProject({ name: projectName })
  s.setActiveProject(pid)
  const id = useStore.getState().createNote()
  useStore.getState().updateNote(id, { title })
  useStore.getState().openNote(id)
  return { pid, id }
}

describe('Recents', () => {
  it('says the log is device-local and capped, with the real number', () => {
    seedNote('Field notes')
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'recents' })

    renderDashboard()

    expect(main().getByText(/kept on this device only/i)).toBeInTheDocument()
    expect(main().getByText(/last 200 entries/i)).toBeInTheDocument()
  })

  it('names the project and the workspace on every row', () => {
    seedNote('Field notes', 'Alpha')
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'recents' })

    renderDashboard()

    const row = main().getByRole('button', { name: 'Open Field notes' })
    expect(row).toHaveTextContent('Alpha')
    expect(row).toHaveTextContent('Personal')
  })

  it('groups by day, newest first', () => {
    seedNote('Today thing')
    // an entry from three days ago, written straight into the log
    const older = useStore.getState().recents[0]
    useStore.setState({
      recents: [older, { ...older, at: Date.now() - 3 * 86_400_000 }],
      navSurface: 'dashboard',
      dashboardDestination: 'recents',
    })

    renderDashboard()

    const headings = main()
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
    expect(headings[0]).toBe('Today')
    expect(headings).toHaveLength(2)
  })

  it('drops a row whose entity is gone instead of rendering it dead', () => {
    const { id } = seedNote('Doomed')
    useStore.getState().deleteNote(id)
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'recents' })

    renderDashboard()

    expect(main().queryByText('Doomed')).toBeNull()
  })

  it('stars an entity from the row it is on', () => {
    const { id } = seedNote('Worth keeping')
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'recents' })

    renderDashboard()
    fireEvent.click(main().getByRole('button', { name: 'Star Worth keeping' }))

    expect(useStore.getState().notes[id].starred).toBe(true)
    expect(useAnnouncer.getState().message).toBe('“Worth keeping” starred')
  })
})

describe('Starred', () => {
  it('spans workspaces, labelling each row with its own', () => {
    const { id } = seedNote('Pinned', 'Alpha')
    useStore.getState().toggleStarred('note', id)

    const other = useStore.getState().createWorkspace({ name: 'Studio Nord' })
    const pid = useStore.getState().createProject({ name: 'Beta' })
    useStore.getState().moveProjectToWorkspace(pid, other)
    useStore.getState().setActiveProject(pid)
    const second = useStore.getState().createNote()
    useStore.getState().updateNote(second, { title: 'Also pinned' })
    useStore.getState().toggleStarred('note', second)

    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'starred' })
    renderDashboard()

    // both are visible even though only one workspace is active
    expect(main().getByRole('button', { name: 'Open Pinned' })).toHaveTextContent('Personal')
    expect(main().getByRole('button', { name: 'Open Also pinned' })).toHaveTextContent(
      'Studio Nord',
    )
  })

  it('narrows to one workspace through the filter, and says so when empty', () => {
    const { id } = seedNote('Pinned', 'Alpha')
    useStore.getState().toggleStarred('note', id)
    const other = useStore.getState().createWorkspace({ name: 'Studio Nord' })

    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'starred' })
    renderDashboard()

    fireEvent.change(main().getByRole('combobox'), { target: { value: other } })

    expect(main().queryByRole('button', { name: 'Open Pinned' })).toBeNull()
    // not "nothing starred" — the shelf has content, this filter excludes it.
    // 15.4 made that title shared across every section; the body stays specific.
    expect(main().getByText('Nothing matches these filters')).toBeInTheDocument()
    expect(main().getByText('Choose “All workspaces” to see everything again.')).toBeInTheDocument()
  })

  it('unstars from the row it is on', () => {
    const { id } = seedNote('Pinned')
    useStore.getState().toggleStarred('note', id)
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'starred' })

    renderDashboard()
    fireEvent.click(main().getByRole('button', { name: 'Unstar Pinned' }))

    expect(useStore.getState().notes[id].starred).toBe(false)
    expect(useAnnouncer.getState().message).toBe('“Pinned” unstarred')
  })

  it('announces the count on a bulk unstar', () => {
    const a = seedNote('First')
    useStore.getState().toggleStarred('note', a.id)
    const b = useStore.getState().createNote()
    useStore.getState().updateNote(b, { title: 'Second' })
    useStore.getState().toggleStarred('note', b)

    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'starred' })
    renderDashboard()

    fireEvent.click(main().getByRole('checkbox', { name: 'Select First' }))
    fireEvent.click(main().getByRole('checkbox', { name: 'Select Second' }))
    fireEvent.click(main().getByRole('button', { name: 'Unstar selected' }))

    expect(useAnnouncer.getState().message).toBe('2 items unstarred')
    expect(useStore.getState().notes[a.id].starred).toBe(false)
    expect(useStore.getState().notes[b].starred).toBe(false)
  })

  it('offers starring, not an empty page, when nothing is pinned', () => {
    // a fresh vault ships one starred project (src/store/seed.ts), so the shelf
    // is only genuinely empty once that one is taken off it
    const s = useStore.getState()
    for (const p of Object.values(s.projects)) {
      if (p.starred) s.toggleStarred('project', p.id)
    }
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'starred' })

    renderDashboard()

    expect(main().getByText('Nothing starred yet')).toBeInTheDocument()
  })
})
