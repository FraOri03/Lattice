import { beforeEach, describe, expect, it } from 'vitest'
import { PERSONAL_WORKSPACE_ID, makePersonalWorkspace, useStore } from './useStore'
import { groupProjects } from '@/lib/projects/ProjectRegistry'
import type { Project } from '@/types/model'

/**
 * Orphan projects — the ones a Drive pull puts in the vault (15.x).
 *
 * `createProject` is the only local path into `projects`, and it also adds
 * the id to a workspace. The Drive pull is the other path, and it doesn't:
 * a project snapshot carries no workspace, because workspaces are local
 * organization while the project is the synced unit. The result was a
 * project present, synced and correct in `projects` — and invisible in
 * Home, the dashboard nav and the switcher, all three of which list a
 * workspace's `projectIds`.
 */

const remoteProject = (id: string, name: string): Project => ({
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

/** Exactly what the project lists render: the active workspace's members. */
const visibleProjects = () => {
  const s = useStore.getState()
  const ws = s.workspaces[s.activeWorkspaceId]
  const scoped = ws
    ? Object.values(s.projects).filter((p) => ws.projectIds.includes(p.id))
    : Object.values(s.projects)
  const groups = groupProjects(scoped)
  return [...groups.starred, ...groups.active, ...groups.archived].map((p) => p.name)
}

beforeEach(() => {
  useStore.setState({
    projects: {},
    workspaces: { [PERSONAL_WORKSPACE_ID]: makePersonalWorkspace([]) },
    activeWorkspaceId: PERSONAL_WORKSPACE_ID,
  })
})

describe('adoptOrphanProjects', () => {
  it('makes a pulled project visible instead of leaving it out of every list', () => {
    useStore.setState({
      projects: {
        p1: remoteProject('p1', 'Video Tesi'),
        p2: remoteProject('p2', 'Norvya'),
      },
    })
    // the state the bug produced: in the vault, in no workspace
    expect(visibleProjects()).toEqual([])

    useStore.getState().adoptOrphanProjects()

    expect(visibleProjects()).toEqual(['Video Tesi', 'Norvya'])
    expect(useStore.getState().workspaces[PERSONAL_WORKSPACE_ID].projectIds).toEqual([
      'p1',
      'p2',
    ])
  })

  it('leaves a project that already has a workspace where it is', () => {
    const other = useStore.getState().createWorkspace({ name: 'Studio' })
    useStore.setState((s) => ({
      projects: { p1: remoteProject('p1', 'Norvya') },
      workspaces: {
        ...s.workspaces,
        [other]: { ...s.workspaces[other], projectIds: ['p1'] },
      },
    }))

    useStore.getState().adoptOrphanProjects()

    expect(useStore.getState().workspaces[PERSONAL_WORKSPACE_ID].projectIds).toEqual([])
    expect(useStore.getState().workspaces[other].projectIds).toEqual(['p1'])
  })

  it('does not touch the workspaces when every project already has one', () => {
    const before = useStore.getState().workspaces
    useStore.getState().createProject({ name: 'Local' })
    const afterCreate = useStore.getState().workspaces

    useStore.getState().adoptOrphanProjects()

    expect(useStore.getState().workspaces).toBe(afterCreate)
    expect(afterCreate).not.toBe(before)
  })

  it('is a no-op without a personal workspace, where the lists show everything', () => {
    useStore.setState({
      projects: { p1: remoteProject('p1', 'Norvya') },
      workspaces: {},
    })

    useStore.getState().adoptOrphanProjects()

    expect(useStore.getState().workspaces).toEqual({})
    expect(visibleProjects()).toEqual(['Norvya'])
  })
})
