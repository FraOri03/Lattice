import { beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import { useCollabStore } from '@/lib/collab/collabStore'
import { BoardCanvas } from './BoardCanvas'
import type { ProjectMember } from '@/types/collab'

/**
 * The board has to survive being read-only.
 *
 * It did not: `useViewportTier()` was called inside the right-hand side of
 * `!readOnly && …`, so a read-only board short-circuited past a hook, every
 * hook after it shifted, and React tore the canvas down — a blank screen with
 * "change in the order of Hooks" in the console.
 *
 * It stayed hidden because nothing reached it. `useMyRole` answered `owner`
 * for any project it did not recognise, so `readOnly` was effectively never
 * true here; the moment that default was corrected, opening somebody else's
 * project white-screened the app. Hence a case for the role, and a case for
 * the render.
 */

const PROJECT = 'proj_read_only'

function member(patch: Partial<ProjectMember> & { userId: string }): ProjectMember {
  return {
    name: '',
    email: '',
    avatarUrl: '',
    role: 'owner',
    joinedAt: 1,
    invitedBy: patch.userId,
    status: 'active',
    updatedAt: 1,
    ...patch,
  }
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(
    'lattice-account',
    JSON.stringify({ id: 'usr_me', name: 'Me', email: 'me@example.com', avatarUrl: '' }),
  )
  useStore.setState({ locale: 'en', activeProjectId: PROJECT })
  useCollabStore.setState({ members: {}, viewAsRole: null })
})

describe('a board somebody else owns', () => {
  it('renders instead of collapsing the canvas', () => {
    useCollabStore
      .getState()
      .setMembers(PROJECT, [member({ userId: 'usr_ada', email: 'ada@example.com' })])

    render(<BoardCanvas />)

    expect(screen.getByRole('application', { name: 'Board canvas' })).toBeInTheDocument()
  })

  /**
   * The one that actually caught it. A conditional hook is only a crash when
   * the branch CHANGES between two renders, and that is the real sequence:
   * the board mounts before the collaboration store has said anything, so
   * `readOnly` is false, and turns true the moment the member list arrives.
   */
  it('survives becoming read-only after it has already mounted', () => {
    useCollabStore
      .getState()
      .setMembers(PROJECT, [member({ userId: 'usr_me', email: 'me@example.com' })])

    render(<BoardCanvas />)
    expect(screen.getByRole('application', { name: 'Board canvas' })).toBeInTheDocument()

    act(() => {
      useCollabStore
        .getState()
        .setMembers(PROJECT, [member({ userId: 'usr_ada', email: 'ada@example.com' })])
    })

    expect(screen.getByRole('application', { name: 'Board canvas' })).toBeInTheDocument()
  })
})
