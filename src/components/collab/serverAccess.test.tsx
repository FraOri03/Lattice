import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { useCollabStore } from '@/lib/collab/collabStore'
import { serverAcl } from '@/lib/collab/ServerAclService'
import { AccountProvider } from '@/lib/auth/AccountProvider'
import type { CollabRole, ProjectMember } from '@/types/collab'
import { ShareDialog } from './ShareDialog'

/**
 * The Share dialog now shows both lists: the one this device keeps, and the
 * one the endpoints enforce.
 *
 * The failure it exists for is silent by construction — a member the local
 * list is certain about, whom the server has never heard of, gets the full
 * editing UI and a refused realtime token, with no screen able to say why.
 * These cases assert that the drift is now on screen in both directions.
 */

let PROJECT = ''

function member(email: string, role: CollabRole): ProjectMember {
  return {
    userId: `usr_${email}`,
    name: '',
    email,
    avatarUrl: '',
    role,
    joinedAt: 1,
    invitedBy: 'usr_me',
    status: 'active',
    updatedAt: 1,
  }
}

const acl = (patch: Record<string, unknown> = {}) => ({
  ownerEmail: 'me@example.com',
  admins: [],
  editors: [],
  commenters: [],
  viewers: [],
  bindings: {},
  ...patch,
})

const open = () =>
  render(
    <AccountProvider>
      <ShareDialog />
    </AccountProvider>,
  )

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(
    'lattice-account',
    JSON.stringify({
      id: 'usr_me@example.com',
      name: 'Me',
      email: 'me@example.com',
      avatarUrl: '',
      providers: ['mock'],
      createdAt: 1,
      updatedAt: 1,
    }),
  )
  useStore.setState({ locale: 'en' })
  PROJECT = useStore.getState().createProject({ name: 'Acme' })
  useStore.setState({ activeProjectId: PROJECT })
  useCollabStore.setState({ members: {}, invites: {} })
  useUiStore.getState().setShareDialogOpen(true)
  vi.spyOn(serverAcl, 'setRole').mockResolvedValue({ ok: true })
})

afterEach(() => {
  useUiStore.getState().setShareDialogOpen(false)
})

describe('what the server enforces', () => {
  it('names the member the server does not have — the one who is refused', async () => {
    useCollabStore
      .getState()
      .setMembers(PROJECT, [member('me@example.com', 'owner'), member('bob@example.com', 'editor')])
    vi.spyOn(serverAcl, 'members').mockResolvedValue({ state: 'ok', acl: acl() })

    open()

    await screen.findByText('In your list, not on the server')
    expect(screen.getAllByText('bob@example.com').length).toBeGreaterThan(0)
  })

  it('marks a slot the server holds that this device knows nothing about', async () => {
    useCollabStore.getState().setMembers(PROJECT, [member('me@example.com', 'owner')])
    vi.spyOn(serverAcl, 'members').mockResolvedValue({
      state: 'ok',
      acl: acl({ editors: ['ghost@example.com'] }),
    })

    open()

    await screen.findByText('ghost@example.com')
    expect(screen.getByText('not in your list')).toBeInTheDocument()
  })

  it('separates a claimed slot from one merely reserved for an address', async () => {
    useCollabStore.getState().setMembers(PROJECT, [member('me@example.com', 'owner')])
    vi.spyOn(serverAcl, 'members').mockResolvedValue({
      state: 'ok',
      acl: acl({
        editors: ['arrived@example.com', 'invited@example.com'],
        bindings: { 'me@example.com': 'usr_me', 'arrived@example.com': 'usr_arrived' },
      }),
    })

    open()

    // the owner and the person who signed in; the third slot is an address
    // nobody has turned up for yet
    expect(await screen.findAllByText('claimed')).toHaveLength(2)
    expect(screen.getByText('reserved')).toBeInTheDocument()
  })

  /**
   * The two refusals are not the same problem: one is fixed by the owner
   * opening the project, the other needs somebody else to grant access.
   */
  it('says a project with no rooms has none, rather than that you were refused', async () => {
    vi.spyOn(serverAcl, 'members').mockResolvedValue({ state: 'no-rooms' })

    open()

    await screen.findByText(/no realtime rooms yet/)
    expect(screen.queryByText('The server does not recognise you here')).toBeNull()
  })

  it('stays out of the way entirely when the build has no realtime backend', async () => {
    vi.spyOn(serverAcl, 'members').mockResolvedValue({ state: 'unconfigured' })

    open()

    await waitFor(() => expect(screen.queryByText('What the server enforces')).toBeNull())
  })
})
