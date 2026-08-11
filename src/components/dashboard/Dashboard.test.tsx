import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import { Dashboard } from './Dashboard'

/**
 * The dashboard (11.2, rebuilt on a shell in 15.1).
 *
 * Home's three original rules still hold — a project appears once, opening one
 * is what leaves the dashboard, and the screen never shows projects from a
 * workspace you are not in — but they are now asserted **inside `main`**. The
 * lateral navigation added in 15.1 lists the same projects as a tree, so a
 * bare `getByRole` would count each project twice and the assertion would be
 * measuring the shell rather than the rule.
 *
 * On top of those: the destinations exist and are reachable, and switching
 * workspace opens no project and creates none (13.1).
 */

const home = () => within(screen.getByRole('main'))

beforeEach(() =>
  useStore.setState({ locale: 'en', navSurface: 'dashboard', dashboardDestination: 'home' }),
)
afterEach(() =>
  useStore.setState({ locale: 'en', navSurface: 'project', dashboardDestination: 'home' }),
)

describe('Dashboard', () => {
  it('shows a project once even when it is both starred and recent', () => {
    const s = useStore.getState()
    const id = s.createProject({ name: 'Solaris' })
    s.setActiveProject(id) // makes it the most recent project
    s.updateProject(id, { starred: true })
    useStore.setState({ navSurface: 'dashboard' })

    render(<Dashboard />)

    expect(home().getAllByRole('button', { name: 'Open project Solaris' })).toHaveLength(1)
  })

  it('opening a project is what leaves the dashboard', () => {
    const id = useStore.getState().createProject({ name: 'Kelvin' })
    useStore.setState({ navSurface: 'dashboard' })

    render(<Dashboard />)
    fireEvent.click(home().getByRole('button', { name: 'Open project Kelvin' }))

    expect(useStore.getState().activeProjectId).toBe(id)
    expect(useStore.getState().navSurface).toBe('project')
  })

  it('lists recent files from every project, each named with its own', () => {
    const s = useStore.getState()
    const alpha = s.createProject({ name: 'Alpha' })
    s.setActiveProject(alpha)
    const noteId = useStore.getState().createNote()
    useStore.getState().updateNote(noteId, { title: 'Field notes' })
    useStore.getState().openNote(noteId)
    // the rail starts at two entries (13.2 §6), so a second one has to exist
    const second = useStore.getState().createNote()
    useStore.getState().updateNote(second, { title: 'Second thought' })
    useStore.getState().openNote(second)

    const beta = useStore.getState().createProject({ name: 'Beta' })
    useStore.getState().setActiveProject(beta)
    useStore.setState({ navSurface: 'dashboard' })

    render(<Dashboard />)

    // the project name is what tells two identically titled files apart
    expect(home().getByRole('button', { name: 'Open Field notes in Alpha' })).toBeInTheDocument()
  })

  it('says what a project holds, not just its name', () => {
    const s = useStore.getState()
    const id = s.createProject({ name: 'Counted' }) // every project starts with one board
    s.setActiveProject(id)
    useStore.getState().createNote({ title: 'A thought' })
    useStore.setState({ navSurface: 'dashboard' })

    render(<Dashboard />)

    const card = home().getByRole('button', { name: 'Open project Counted' })
    expect(card).toHaveTextContent('1 board')
    expect(card).toHaveTextContent('1 file')
  })

  it('summarises the workspace above the projects', () => {
    const s = useStore.getState()
    s.createProject({ name: 'Summarised' })
    useStore.setState({ navSurface: 'dashboard' })

    render(<Dashboard />)

    const overview = screen.getByRole('region', { name: 'Workspace at a glance' })
    expect(overview).toBeInTheDocument()
    expect(screen.getByText('Local vault — nothing leaves this browser')).toBeInTheDocument()
  })

  it('scopes to the active workspace', () => {
    const s = useStore.getState()
    const inside = s.createProject({ name: 'Inside' })
    const otherWs = s.createWorkspace({ name: 'Other workspace' })
    const outside = s.createProject({ name: 'Outside' })
    s.moveProjectToWorkspace(outside, otherWs)
    useStore.setState({ navSurface: 'dashboard' })

    render(<Dashboard />)

    expect(home().getByRole('button', { name: 'Open project Inside' })).toBeInTheDocument()
    expect(home().queryByRole('button', { name: 'Open project Outside' })).toBeNull()
    expect(useStore.getState().projects[inside]).toBeTruthy()
  })
})

describe('the six destinations', () => {
  it('reaches every destination from the navigation', () => {
    useStore.getState().createProject({ name: 'Anything' })
    useStore.setState({ navSurface: 'dashboard' })

    render(<Dashboard />)
    const nav = within(screen.getByRole('navigation', { name: 'Dashboard' }))

    for (const name of ['Home', 'Recents', 'Starred', 'Shared with me', 'Invites', 'Trash']) {
      expect(nav.getByRole('button', { name })).toBeInTheDocument()
    }

    fireEvent.click(nav.getByRole('button', { name: 'Trash' }))
    expect(useStore.getState().dashboardDestination).toBe('trash')
    // the destination the URL would carry is the one showing, and Home is gone
    expect(screen.queryByRole('region', { name: 'Workspace at a glance' })).toBeNull()
  })

  it('marks the destination it is on, and only that one', () => {
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'starred' })

    render(<Dashboard />)
    const nav = within(screen.getByRole('navigation', { name: 'Dashboard' }))

    expect(nav.getByRole('button', { name: 'Starred' })).toHaveAttribute('aria-current', 'page')
    expect(nav.getByRole('button', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })

  it('never claims a section is empty when it cannot look (13.3)', () => {
    // the false negative the whole rule exists to prevent: "nothing shared with
    // you" over a surface with no index reads as nobody having shared anything
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'shared' })
    render(<Dashboard />)

    expect(screen.getByText(/A full index of everything shared with you/)).toBeInTheDocument()
  })
})

describe('switching workspace', () => {
  it('opens no project and creates none', () => {
    const s = useStore.getState()
    const before = Object.keys(s.projects).length
    const empty = s.createWorkspace({ name: 'Brand new' })
    const openProject = useStore.getState().activeProjectId

    useStore.getState().setActiveWorkspace(empty)

    const after = useStore.getState()
    expect(after.activeWorkspaceId).toBe(empty)
    // the old behaviour invented a project so there would be something to open
    expect(Object.keys(after.projects)).toHaveLength(before)
    expect(after.activeProjectId).toBe(openProject)
  })

  it('lands Home when the switch happens inside a project', () => {
    const s = useStore.getState()
    const other = s.createWorkspace({ name: 'Elsewhere' })
    useStore.setState({ navSurface: 'project', dashboardDestination: 'trash' })

    useStore.getState().setActiveWorkspace(other)

    expect(useStore.getState().navSurface).toBe('dashboard')
    expect(useStore.getState().dashboardDestination).toBe('home')
  })

  it('stays on the destination when the switch happens on the dashboard', () => {
    const s = useStore.getState()
    const other = s.createWorkspace({ name: 'Somewhere else' })
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'trash' })

    useStore.getState().setActiveWorkspace(other)

    expect(useStore.getState().dashboardDestination).toBe('trash')
  })
})
