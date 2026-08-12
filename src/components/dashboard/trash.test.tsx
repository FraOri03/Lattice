import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import { useAnnouncer } from '@/lib/a11y/announcer'
import { AccountProvider } from '@/lib/auth/AccountProvider'
import { RETENTION_DAYS } from '@/lib/dashboard/trash'
import { Dashboard } from './Dashboard'

/**
 * Soft delete end to end (15.6): deleting stops being terminal, and what it
 * leaves behind stays out of every list except this one.
 */

const renderDashboard = () =>
  render(
    <AccountProvider>
      <Dashboard />
    </AccountProvider>,
  )

const pristine = useStore.getState()

beforeEach(() => {
  useStore.setState(pristine, true)
  useStore.setState({ locale: 'en', navSurface: 'dashboard', dashboardDestination: 'trash' })
})
afterEach(() =>
  useStore.setState({ locale: 'en', navSurface: 'project', dashboardDestination: 'home' }),
)

const main = () => within(screen.getByRole('main'))

/** A project holding one note, both live. */
function seed(title = 'Doomed') {
  const s = useStore.getState()
  const pid = s.createProject({ name: 'Alpha' })
  s.setActiveProject(pid)
  const id = useStore.getState().createNote({ title })
  return { pid, id }
}

describe('deleting stops being terminal', () => {
  it('keeps the record and stamps it instead of destroying it', () => {
    const { id } = seed()
    useStore.getState().deleteNote(id)

    const note = useStore.getState().notes[id]
    expect(note).toBeTruthy()
    expect(note.deletedAt).toBeTypeOf('number')
  })

  it('shows it in the trash, with where it was and how long it has', () => {
    const { id } = seed('Field notes')
    useStore.getState().deleteNote(id)

    renderDashboard()

    expect(main().getByText('Field notes')).toBeInTheDocument()
    expect(main().getByText(new RegExp(`was in Alpha`))).toBeInTheDocument()
    expect(main().getByText(`in ${RETENTION_DAYS} days`)).toBeInTheDocument()
  })

  it('takes it back out on restore, and says where it went', () => {
    const { id } = seed('Recoverable')
    useStore.getState().deleteNote(id)

    renderDashboard()
    fireEvent.click(main().getByRole('button', { name: /Restore/ }))

    expect(useStore.getState().notes[id].deletedAt).toBeUndefined()
    expect(useAnnouncer.getState().message).toBe('“Recoverable” restored to Alpha')
  })

  it('destroys it only on purge', () => {
    const { id } = seed('Gone for good')
    useStore.getState().deleteNote(id)

    renderDashboard()
    fireEvent.click(main().getByRole('button', { name: 'Delete Gone for good forever' }))

    expect(useStore.getState().notes[id]).toBeUndefined()
    expect(useAnnouncer.getState().message).toBe('“Gone for good” permanently deleted')
  })
})

describe('what is in the trash is nowhere else', () => {
  it('leaves the Starred shelf when it is deleted', () => {
    const { id } = seed('Pinned')
    useStore.getState().toggleStarred('note', id)
    useStore.getState().deleteNote(id)

    useStore.setState({ dashboardDestination: 'starred' })
    renderDashboard()

    expect(main().queryByText('Pinned')).toBeNull()
  })

  it('leaves Home, and stops counting towards its project', () => {
    const { pid, id } = seed('Counted')
    useStore.getState().deleteNote(id)

    useStore.setState({ dashboardDestination: 'home' })
    renderDashboard()

    const card = main()
      .getByRole('button', { name: 'Open project Alpha' })
      .closest('li')!
    expect(card).toHaveTextContent('0 files')
    expect(useStore.getState().notes[id].projectId).toBe(pid)
  })

  it('takes a trashed project off Home entirely', () => {
    const { pid } = seed()
    useStore.getState().deleteProject(pid)

    useStore.setState({ dashboardDestination: 'home' })
    renderDashboard()

    expect(main().queryByRole('button', { name: 'Open project Alpha' })).toBeNull()
  })
})

describe('the rules the model had to settle', () => {
  it('lets the last project go, because it is recoverable now', () => {
    // the old guard refused rather than leave the app with nothing to open;
    // Home's empty state is that answer, and this is undoable for 30 days
    const s = useStore.getState()
    for (const p of Object.values(s.projects)) s.deleteProject(p.id)

    const live = Object.values(useStore.getState().projects).filter((p) => !p.deletedAt)
    expect(live).toHaveLength(0)
  })

  it('moves the surface Home when you trash the project you are in', () => {
    const { pid } = seed()
    useStore.setState({ navSurface: 'project' })
    useStore.getState().setActiveProject(pid)

    useStore.getState().deleteProject(pid)

    expect(useStore.getState().navSurface).toBe('dashboard')
    expect(useStore.getState().dashboardDestination).toBe('home')
  })

  it('marks an entity orphaned when its project went too, and says so', () => {
    const { pid, id } = seed('Orphan')
    useStore.getState().deleteNote(id)
    useStore.getState().deleteProject(pid)

    useStore.setState({ dashboardDestination: 'trash' })
    renderDashboard()

    expect(main().getByText('parent deleted')).toBeInTheDocument()
  })

  it('sweeps what passed its retention, and reports how many', () => {
    const { id } = seed('Expired')
    useStore.getState().deleteNote(id)
    // backdate it past the window
    const notes = useStore.getState().notes
    useStore.setState({
      notes: {
        ...notes,
        [id]: { ...notes[id], deletedAt: Date.now() - (RETENTION_DAYS + 1) * 86_400_000 },
      },
    })

    const removed = useStore.getState().purgeExpired()

    expect(removed).toBe(1)
    expect(useStore.getState().notes[id]).toBeUndefined()
  })

  it('keeps what is still inside its window', () => {
    const { id } = seed('Safe')
    useStore.getState().deleteNote(id)

    expect(useStore.getState().purgeExpired()).toBe(0)
    expect(useStore.getState().notes[id]).toBeTruthy()
  })

  it('empties everything behind a confirmation, not on the first press', () => {
    const { id } = seed('Bulk')
    useStore.getState().deleteNote(id)

    renderDashboard()
    fireEvent.click(main().getByRole('button', { name: 'Empty trash' }))

    // still there: the first press asks
    expect(useStore.getState().notes[id]).toBeTruthy()
    expect(main().getByText(/cannot be undone/)).toBeInTheDocument()

    fireEvent.click(main().getByRole('button', { name: 'Delete permanently' }))
    expect(useStore.getState().notes[id]).toBeUndefined()
  })
})
