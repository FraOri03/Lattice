import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import { useCollabStore } from '@/lib/collab/collabStore'
import { currentIdentity } from '@/lib/collab/CollaborationProvider'
import type { ProjectInvite, ProjectMember } from '@/types/collab'
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
 * The three sections that cannot be complete before the server (13.5 §3).
 *
 * What every case here is really asserting is the same sentence: the page says
 * what it *cannot* see, and never lets an absence of index read as an absence
 * of content.
 */

const pristine = useStore.getState()
const pristineCollab = useCollabStore.getState()

beforeEach(() => {
  useStore.setState(pristine, true)
  useCollabStore.setState(pristineCollab, true)
  useStore.setState({ locale: 'en', navSurface: 'dashboard' })
})
afterEach(() =>
  useStore.setState({ locale: 'en', navSurface: 'project', dashboardDestination: 'home' }),
)

const main = () => within(screen.getByRole('main'))

const member = (userId: string, role: ProjectMember['role'], name: string): ProjectMember =>
  ({
    userId,
    name,
    email: `${userId}@example.com`,
    avatarUrl: '',
    role,
    joinedAt: 0,
    invitedBy: '',
    status: 'active',
    updatedAt: 0,
  }) as ProjectMember

describe('Shared with me', () => {
  it('lists a project someone else owns, with the role and what it grants', () => {
    const s = useStore.getState()
    const pid = s.createProject({ name: 'Acme Rebrand' })
    useCollabStore.setState({
      members: {
        [pid]: [
          member('giulia', 'owner', 'Giulia Rossi'),
          member(currentIdentity().userId, 'commenter', 'Me'),
        ],
      },
    })
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'shared' })

    renderDashboard()

    // grouped by owner
    expect(main().getByRole('heading', { name: /Giulia Rossi/ })).toBeInTheDocument()
    const row = main().getByRole('button', { name: 'Open project Acme Rebrand' })
    // the role AND what it grants — a role name alone is not consent
    expect(row).toHaveTextContent('Commenter')
    expect(row).toHaveTextContent('Reads everything and leaves comments')
  })

  it('states the scope each row is read from', () => {
    const s = useStore.getState()
    const pid = s.createProject({ name: 'Acme' })
    useCollabStore.setState({
      members: {
        [pid]: [member('g', 'owner', 'G'), member(currentIdentity().userId, 'viewer', 'Me')],
      },
    })
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'shared' })

    renderDashboard()

    // no Drive configured in a test vault, so the honest scope is this browser
    expect(main().getByText('This browser')).toBeInTheDocument()
  })

  it('never lists a project you own', () => {
    const s = useStore.getState()
    const pid = s.createProject({ name: 'Mine' })
    useCollabStore.setState({
      members: { [pid]: [member(currentIdentity().userId, 'owner', 'Me')] },
    })
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'shared' })

    renderDashboard()

    expect(main().queryByRole('button', { name: 'Open project Mine' })).toBeNull()
  })

  it('says what it cannot list, whether or not it found anything', () => {
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'shared' })
    renderDashboard()

    expect(main().getByText(/needs the server planned for phase 18/)).toBeInTheDocument()
    // and it does NOT say nobody shared anything
    expect(main().queryByText(/Nothing shared/i)).toBeNull()
  })
})

describe('Invites', () => {
  it('opens on Sent, the tab that can answer', () => {
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'invites' })
    renderDashboard()

    expect(screen.getByRole('tab', { name: 'Sent' })).toHaveAttribute('aria-selected', 'true')
  })

  it('presents Received as unavailable, naming the constraint', () => {
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'invites' })
    renderDashboard()

    fireEvent.click(screen.getByRole('tab', { name: 'Received' }))

    expect(main().getByText(/lives on the sender’s device/)).toBeInTheDocument()
  })

  it('lists sent invitations, and claims no delivery or expiry', () => {
    const s = useStore.getState()
    const pid = s.createProject({ name: 'Acme' })
    const invite = {
      id: 'inv1',
      projectId: pid,
      email: 'giulia@example.com',
      role: 'editor',
      token: 't',
      createdAt: Date.now(),
      invitedBy: 'me',
      invitedByName: 'Me',
      status: 'pending',
      updatedAt: 0,
    } as ProjectInvite
    useCollabStore.setState({ invites: { [pid]: [invite] } })
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'invites' })

    renderDashboard()

    expect(main().getByText('giulia@example.com · Acme')).toBeInTheDocument()
    expect(main().getByText('Pending')).toBeInTheDocument()
    expect(main().getByText(/nothing here says delivered, failed or expired/)).toBeInTheDocument()
  })

  it('never shows a status nothing computes', () => {
    const s = useStore.getState()
    const pid = s.createProject({ name: 'Acme' })
    const expired = {
      id: 'inv2',
      projectId: pid,
      email: 'old@example.com',
      role: 'viewer',
      token: 't',
      createdAt: 1,
      invitedBy: 'me',
      invitedByName: 'Me',
      status: 'expired',
      updatedAt: 0,
    } as ProjectInvite
    useCollabStore.setState({ invites: { [pid]: [expired] } })
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'invites' })

    renderDashboard()

    // there is no `expiresAt` anywhere, so a row wearing that badge would be
    // claiming a check that never happened
    expect(main().queryByText('old@example.com · Acme')).toBeNull()
  })

  it('shows no count on the navigation, because it cannot compute one', () => {
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'invites' })
    renderDashboard()

    const invites = within(screen.getByRole('navigation', { name: 'Dashboard' })).getByRole(
      'button',
      { name: 'Invites' },
    )
    expect(invites.textContent).toBe('Invites')
  })
})

describe('Trash', () => {
  it('may now say it is empty, because it can finally look', () => {
    // before 15.6 this said "unavailable": deleting was terminal, so there was
    // no list to be empty. With the model behind it, empty is a real answer.
    useStore.setState({ navSurface: 'dashboard', dashboardDestination: 'trash' })
    renderDashboard()

    expect(main().getByText('Trash is empty')).toBeInTheDocument()
    expect(main().queryByText(/issue #115/)).toBeNull()
  })
})
