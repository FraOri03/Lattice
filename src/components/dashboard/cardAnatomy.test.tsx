import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import { useAnnouncer } from '@/lib/a11y/announcer'
import { AccountProvider } from '@/lib/auth/AccountProvider'
import { Dashboard } from './Dashboard'

/**
 * Card anatomy, the view toggle and the dashboard's top bar (13.2 §3–4, 15.7).
 *
 * The card being a container rather than one big button is the whole point:
 * every action on it is a separate stop, which is what 13.5 §4 asks for and
 * what makes starring a project from the dashboard possible at all.
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
  useStore.setState({
    locale: 'en',
    navSurface: 'dashboard',
    dashboardDestination: 'home',
    dashboardView: 'grid',
  })
})
afterEach(() =>
  useStore.setState({ locale: 'en', navSurface: 'project', dashboardDestination: 'home' }),
)

const main = () => within(screen.getByRole('main'))

describe('the card carries its own actions', () => {
  it('stars a project from the dashboard — which nothing could do before', () => {
    const id = useStore.getState().createProject({ name: 'Pinnable' })
    useStore.setState({ navSurface: 'dashboard' })

    renderDashboard()
    fireEvent.click(main().getByRole('button', { name: 'Star Pinnable' }))

    expect(useStore.getState().projects[id].starred).toBe(true)
    expect(useAnnouncer.getState().message).toBe('“Pinnable” starred')
  })

  it('keeps opening and starring as two separate stops', () => {
    useStore.getState().createProject({ name: 'Two Stops' })
    useStore.setState({ navSurface: 'dashboard' })

    renderDashboard()

    const openIt = main().getByRole('button', { name: 'Open project Two Stops' })
    const starIt = main().getByRole('button', { name: 'Star Two Stops' })
    expect(openIt).not.toBe(starIt)
    // and the star says what it is, not only what it looks like
    expect(starIt).toHaveAttribute('aria-pressed', 'false')
  })

  it('says whether the vault leaves this browser, in words', () => {
    useStore.getState().createProject({ name: 'Scoped' })
    useStore.setState({ navSurface: 'dashboard' })

    renderDashboard()

    // never colour alone (13.5 §2.7)
    expect(main().getAllByText('Local').length).toBeGreaterThan(0)
  })
})

describe('the view toggle', () => {
  it('offers two pressed-state buttons rather than one that flips', () => {
    renderDashboard()

    expect(main().getByRole('button', { name: 'Grid view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(main().getByRole('button', { name: 'List view' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('switches the projects sections and announces it', () => {
    useStore.getState().createProject({ name: 'Switchable' })
    useStore.setState({ navSurface: 'dashboard' })

    renderDashboard()
    fireEvent.click(main().getByRole('button', { name: 'List view' }))

    expect(useStore.getState().dashboardView).toBe('list')
    expect(useAnnouncer.getState().message).toBe('List view')
    // the project is still there, in the other shape
    expect(main().getByRole('button', { name: 'Open project Switchable' })).toBeTruthy()
  })

  it('is one preference shared by every destination, not per-page state', () => {
    const { unmount } = renderDashboard()
    fireEvent.click(main().getByRole('button', { name: 'List view' }))
    unmount()

    // a different destination, then back: the choice is still the user's
    useStore.setState({ dashboardDestination: 'recents' })
    const second = renderDashboard()
    second.unmount()
    useStore.setState({ dashboardDestination: 'home' })
    renderDashboard()

    expect(main().getByRole('button', { name: 'List view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('is written to the persisted slice, like theme and locale', () => {
    renderDashboard()
    fireEvent.click(main().getByRole('button', { name: 'List view' }))

    const stored = Object.keys(localStorage)
      .map((k) => localStorage.getItem(k) ?? '')
      .find((v) => v.includes('dashboardView'))
    expect(stored).toContain('"dashboardView":"list"')
  })
})

describe('the dashboard top bar', () => {
  it('drops everything that names a project which is not open', () => {
    useStore.setState({ navSurface: 'dashboard' })
    renderDashboard()
    const bar = within(screen.getByRole('banner'))

    // Share acts on `activeProjectId`, which survives the trip Home — a Share
    // button here would silently share whatever was open last
    expect(bar.queryByRole('button', { name: /Share/i })).toBeNull()
  })

  it('keeps what is true with no project open', () => {
    useStore.setState({ navSurface: 'dashboard' })
    renderDashboard()
    const bar = within(screen.getByRole('banner'))

    expect(bar.getByRole('button', { name: /command palette/i })).toBeTruthy()
    expect(bar.getByRole('button', { name: 'New project' })).toBeTruthy()
  })

  it('names the destination it is showing', () => {
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'trash' })
    renderDashboard()

    expect(within(screen.getByRole('banner')).getByText('Trash')).toBeTruthy()
  })
})
