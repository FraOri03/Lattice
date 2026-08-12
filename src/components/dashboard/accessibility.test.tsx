import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import { useAnnouncer } from '@/lib/a11y/announcer'
import { DESTINATIONS } from '@/lib/dashboard/destinations'
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
 * The parts of 13.5 a DOM can prove (§9's "rendered checks").
 *
 * Deliberately not here: no horizontal overflow at 390px and the ≥24px target
 * audit. jsdom has no layout engine — every box measures 0 — so an assertion
 * about either would pass whatever the CSS said, which is worse than no
 * assertion at all. Both are measured in a real browser instead, and the
 * numbers go in the PR.
 */

const pristine = useStore.getState()

beforeEach(() => {
  useStore.setState(pristine, true)
  useStore.setState({ locale: 'en', navSurface: 'dashboard', dashboardDestination: 'home' })
})
afterEach(() =>
  useStore.setState({ locale: 'en', navSurface: 'project', dashboardDestination: 'home' }),
)

const main = () => within(screen.getByRole('main'))

describe('keyboard reach (13.5 §2.9)', () => {
  it('reaches every destination without a pointer', () => {
    renderDashboard()
    const nav = within(screen.getByRole('navigation', { name: 'Dashboard' }))

    // every destination is a real button, so Tab reaches it and Enter runs it —
    // exactly six, so none is a div nobody can focus and none is missing
    const buttons = nav.getAllByRole('button')
    expect(buttons).toHaveLength(DESTINATIONS.length)
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Home',
      'Recents',
      'Starred',
      'Shared with me',
      'Invites',
      'Trash',
    ])
  })

  it('gives every card action its own stop rather than hiding it in a menu', () => {
    const s = useStore.getState()
    const pid = s.createProject({ name: 'Alpha' })
    s.setActiveProject(pid)
    const id = useStore.getState().createNote({ title: 'Reachable' })
    useStore.getState().openNote(id)
    useStore.getState().toggleStarred('note', id)
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'starred' })

    renderDashboard()

    // the row, its checkbox and its star are three separate stops — 13.5 §4
    // accepts the verbosity precisely so none of them needs a pointer
    expect(main().getByRole('button', { name: 'Open Reachable' })).toBeTruthy()
    expect(main().getByRole('checkbox', { name: 'Select Reachable' })).toBeTruthy()
    expect(main().getByRole('button', { name: 'Unstar Reachable' })).toBeTruthy()
  })

  it('marks the destination it is on with aria-current, and only that one', () => {
    useStore.setState({ dashboardDestination: 'recents' })
    renderDashboard()
    const nav = within(screen.getByRole('navigation', { name: 'Dashboard' }))

    const current = nav.getAllByRole('button').filter((b) => b.getAttribute('aria-current'))
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('Recents')
  })
})

describe('structure (13.5 §4)', () => {
  it('makes every project section a list, so its length is announced', () => {
    const s = useStore.getState()
    s.createProject({ name: 'One' })
    s.createProject({ name: 'Two' })
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'home' })

    renderDashboard()

    const lists = main().getAllByRole('list')
    expect(lists.length).toBeGreaterThan(0)
    for (const list of lists) {
      expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(0)
    }
  })

  it('keeps one main and one banner on the surface', () => {
    renderDashboard()
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getAllByRole('banner')).toHaveLength(1)
  })
})

describe('announcements (13.5 §5)', () => {
  it('says the destination on arrival', () => {
    renderDashboard()
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Dashboard' })).getByRole('button', {
        name: 'Trash',
      }),
    )
    expect(useAnnouncer.getState().message).toBe('Trash')
  })

  it('names the workspace and its size when it is switched', () => {
    const s = useStore.getState()
    const other = s.createWorkspace({ name: 'Studio Nord' })
    renderDashboard()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: other } })

    expect(useAnnouncer.getState().message).toBe('Studio Nord — 0 projects')
  })

  it('says how much came back when a filter is cleared', () => {
    const s = useStore.getState()
    const pid = s.createProject({ name: 'Alpha' })
    s.setActiveProject(pid)
    const id = useStore.getState().createNote({ title: 'Pinned' })
    useStore.getState().toggleStarred('note', id)
    const other = useStore.getState().createWorkspace({ name: 'Elsewhere' })
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'starred' })

    renderDashboard()
    fireEvent.change(main().getByRole('combobox'), { target: { value: other } })
    fireEvent.click(main().getByRole('button', { name: 'Clear filters' }))

    expect(useAnnouncer.getState().message).toMatch(/^Filters cleared — \d+ items?$/)
  })
})

describe('both locales render every destination (13.5 §8)', () => {
  for (const locale of ['en', 'it'] as const) {
    it(`renders all six in ${locale}`, () => {
      const s = useStore.getState()
      const pid = s.createProject({ name: 'Alpha' })
      s.setActiveProject(pid)
      const id = useStore.getState().createNote({ title: 'Something' })
      useStore.getState().openNote(id)
      useStore.getState().toggleStarred('note', id)

      for (const destination of DESTINATIONS) {
        useStore.setState({ locale, navSurface: 'dashboard', dashboardDestination: destination })
        const { unmount } = renderDashboard()
        // a missing key would render "undefined" rather than throw, so the
        // catalogue is checked by looking for it
        expect(screen.getByRole('main').textContent).not.toMatch(/undefined/)
        expect(screen.getByRole('main').textContent?.trim().length).toBeGreaterThan(0)
        unmount()
      }
    })
  }
})
