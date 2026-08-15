import { beforeEach, describe, expect, it } from 'vitest'
import { PERSONAL_WORKSPACE_ID, makePersonalWorkspace, useStore } from './useStore'
import { useCollabStore } from '@/lib/collab/collabStore'
import type { Project } from '@/types/model'
import type { ProjectInvite, ProjectMember } from '@/types/collab'

/**
 * "Delete forever" has to reach the collaboration store too.
 *
 * `purgeProject` dismantles the vault copy carefully — entities, bodies,
 * blobs, workspaces, tab sessions — and left every collaboration record
 * behind, because they live in a different persisted store keyed by project
 * id and nothing ever removed a key from it. So a purged project kept its
 * member list, its invitations (addresses included), its comments, its
 * activity trail and its version index in localStorage for good: unbounded
 * growth, and personal data outliving the deletion meant to take it.
 */

const project = (id: string, name: string): Project => ({
  id,
  name,
  description: '',
  icon: '🗂️',
  color: 'blue',
  createdAt: 1,
  updatedAt: 2,
  archived: false,
  starred: false,
  storageRoot: `projects/${id}`,
  settings: {},
})

const member = (email: string): ProjectMember =>
  ({
    userId: `usr_${email}`,
    name: 'Ada',
    email,
    avatarUrl: '',
    role: 'editor',
    joinedAt: 0,
    invitedBy: '',
    status: 'active',
    updatedAt: 0,
  }) as ProjectMember

const invite = (email: string): ProjectInvite =>
  ({
    id: `inv_${email}`,
    projectId: 'doomed',
    email,
    role: 'editor',
    tokenHash: 'h',
    createdAt: 0,
    invitedBy: '',
    invitedByName: 'Me',
    status: 'pending',
    expiresAt: Date.now() + 1000,
    updatedAt: 0,
  }) as ProjectInvite

beforeEach(() => {
  // purgeProject refuses to remove the last project, so there is a survivor
  useStore.setState({
    projects: { doomed: project('doomed', 'Doomed'), keep: project('keep', 'Keep') },
    workspaces: { [PERSONAL_WORKSPACE_ID]: makePersonalWorkspace(['doomed', 'keep']) },
    activeWorkspaceId: PERSONAL_WORKSPACE_ID,
    activeProjectId: 'keep',
  })
  useCollabStore.setState({
    members: { doomed: [member('ada@example.com')], keep: [member('bob@example.com')] },
    invites: { doomed: [invite('invited@example.com')], keep: [] },
    comments: { doomed: [], keep: [] },
    activity: { doomed: [], keep: [] },
    versions: { doomed: [], keep: [] },
  })
})

describe('purgeProject', () => {
  it('takes the project’s collaboration records with it', () => {
    useStore.getState().purgeProject('doomed')

    const s = useCollabStore.getState()
    expect(s.members).not.toHaveProperty('doomed')
    expect(s.invites).not.toHaveProperty('doomed')
    expect(s.comments).not.toHaveProperty('doomed')
    expect(s.activity).not.toHaveProperty('doomed')
    expect(s.versions).not.toHaveProperty('doomed')
  })

  it('leaves every other project’s records alone', () => {
    useStore.getState().purgeProject('doomed')

    const s = useCollabStore.getState()
    expect(s.members.keep).toHaveLength(1)
    expect(s.members.keep[0].email).toBe('bob@example.com')
    expect(s.invites).toHaveProperty('keep')
  })

  it('does not strand an invited address once the project is gone', () => {
    // the invitation names somebody who never joined; nothing else on this
    // device would ever have removed it
    const before = useCollabStore.getState().invites.doomed[0].email
    expect(before).toBe('invited@example.com')

    useStore.getState().purgeProject('doomed')

    const stillListed = Object.values(useCollabStore.getState().invites)
      .flat()
      .map((i) => i.email)
    expect(stillListed).not.toContain('invited@example.com')
  })
})

describe('forgetProject', () => {
  it('is a no-op for a project it holds nothing about', () => {
    const before = useCollabStore.getState().members
    useCollabStore.getState().forgetProject('never-seen')
    // same reference: an untouched map must not re-render every subscriber
    expect(useCollabStore.getState().members).toBe(before)
  })
})
