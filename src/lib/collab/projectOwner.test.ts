import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '@/store/useStore'
import { useCollabStore } from './collabStore'
import { membersService } from './MembersService'
import { inviteService } from './InviteService'

/**
 * The owner is the account that created the project.
 *
 * Before this, ownership was decided by whoever opened the project first —
 * on each device. A project synced across a browser profile, a second
 * profile and a Drive folder came back with four owners, two of them
 * nameless guests, because every device had appointed itself and the lists
 * were merged.
 */

function signedInAs(id: string, name: string, email: string): void {
  localStorage.setItem(
    'lattice-account',
    JSON.stringify({ id, name, email, avatarUrl: '' }),
  )
}

const ownersOf = (projectId: string) =>
  (useCollabStore.getState().members[projectId] ?? []).filter(
    (m) => m.status === 'active' && m.role === 'owner',
  )

beforeEach(() => {
  localStorage.clear()
  useCollabStore.setState({ members: {}, invites: {} })
})

describe('createProject', () => {
  it('records the creating account on the project', () => {
    signedInAs('usr_ada', 'Ada', 'ada@example.com')
    const id = useStore.getState().createProject({ name: 'Acme' })

    expect(useStore.getState().projects[id].createdBy).toMatchObject({
      userId: 'usr_ada',
      email: 'ada@example.com',
      name: 'Ada',
    })
  })

  it('lowercases the address, because the ACL is keyed on it', () => {
    signedInAs('usr_ada', 'Ada', 'Ada@Example.COM')
    const id = useStore.getState().createProject({ name: 'Acme' })
    expect(useStore.getState().projects[id].createdBy?.email).toBe('ada@example.com')
  })
})

describe('ensureOwner', () => {
  it('makes the creator the owner, not whoever opened it', () => {
    signedInAs('usr_ada', 'Ada', 'ada@example.com')
    const id = useStore.getState().createProject({ name: 'Acme' })

    // a different account opens the same project on another device
    signedInAs('usr_bob', 'Bob', 'bob@example.com')
    membersService.ensureOwner(id)

    const owners = ownersOf(id)
    expect(owners).toHaveLength(1)
    expect(owners[0].email).toBe('ada@example.com')
  })

  it('is the same answer on every device, so a merge cannot stack owners', () => {
    signedInAs('usr_ada', 'Ada', 'ada@example.com')
    const id = useStore.getState().createProject({ name: 'Acme' })

    // three devices, three identities, each bootstrapping the same project
    for (const [uid, name, mail] of [
      ['usr_bob', 'Bob', 'bob@example.com'],
      ['guest_1', 'Guest', ''],
      ['guest_2', 'Guest', ''],
    ] as const) {
      useCollabStore.setState({ members: {} })
      signedInAs(uid, name, mail)
      membersService.ensureOwner(id)
      expect(ownersOf(id)[0].userId).toBe('usr_ada')
    }
  })

  it('falls back to the current identity only for a project with no creator', () => {
    // a project made before the creator was recorded
    const id = useStore.getState().createProject({ name: 'Legacy' })
    useStore.setState((s) => ({
      projects: {
        ...s.projects,
        [id]: { ...s.projects[id], createdBy: undefined },
      },
    }))
    useCollabStore.setState({ members: {} })

    signedInAs('usr_bob', 'Bob', 'bob@example.com')
    membersService.ensureOwner(id)

    expect(ownersOf(id)[0].userId).toBe('usr_bob')
  })

  it('leaves an existing owner alone', () => {
    signedInAs('usr_ada', 'Ada', 'ada@example.com')
    const id = useStore.getState().createProject({ name: 'Acme' })
    membersService.ensureOwner(id)
    membersService.ensureOwner(id)
    membersService.ensureOwner(id)

    expect(ownersOf(id)).toHaveLength(1)
  })
})

describe('inviting somebody who is already a member', () => {
  it('is refused on the local tier too, not only by the server', async () => {
    signedInAs('usr_ada', 'Ada', 'ada@example.com')
    const id = useStore.getState().createProject({ name: 'Acme' })
    membersService.ensureOwner(id)

    // the exact shape seen in the wild: an active owner, invited again
    const result = await inviteService.create(id, 'ada@example.com', 'admin')

    expect(result.ok).toBe(false)
    expect(result.error).toContain('already a member')
    expect(inviteService.invitesOf(id)).toEqual([])
  })

  it('ignores case when deciding that', async () => {
    signedInAs('usr_ada', 'Ada', 'ada@example.com')
    const id = useStore.getState().createProject({ name: 'Acme' })
    membersService.ensureOwner(id)

    expect((await inviteService.create(id, 'ADA@Example.com', 'editor')).ok).toBe(false)
  })

  it('still invites somebody who is not one', async () => {
    signedInAs('usr_ada', 'Ada', 'ada@example.com')
    const id = useStore.getState().createProject({ name: 'Acme' })
    membersService.ensureOwner(id)

    const result = await inviteService.create(id, 'grace@example.com', 'editor')
    expect(result.ok).toBe(true)
    expect(result.invite?.email).toBe('grace@example.com')
  })
})
