import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import { Dashboard } from './Dashboard'

/**
 * Home (Phase 11.2).
 *
 * Three rules worth locking down: a project appears once, opening one is what
 * leaves the dashboard, and the screen never shows projects from a workspace
 * you are not in — the switcher scopes the same way, and a Home that ignored
 * it would be the one place where the workspace boundary silently stops
 * applying.
 */

beforeEach(() => useStore.setState({ locale: 'en', navSurface: 'dashboard' }))
afterEach(() => useStore.setState({ locale: 'en', navSurface: 'project' }))

describe('Dashboard', () => {
  it('shows a project once even when it is both starred and recent', () => {
    const s = useStore.getState()
    const id = s.createProject({ name: 'Solaris' })
    s.setActiveProject(id) // makes it the most recent project
    s.updateProject(id, { starred: true })
    useStore.setState({ navSurface: 'dashboard' })

    render(<Dashboard />)

    expect(screen.getAllByRole('button', { name: 'Open project Solaris' })).toHaveLength(1)
  })

  it('opening a project is what leaves the dashboard', () => {
    const id = useStore.getState().createProject({ name: 'Kelvin' })
    useStore.setState({ navSurface: 'dashboard' })

    render(<Dashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'Open project Kelvin' }))

    expect(useStore.getState().activeProjectId).toBe(id)
    expect(useStore.getState().navSurface).toBe('project')
  })

  it('scopes to the active workspace', () => {
    const s = useStore.getState()
    const inside = s.createProject({ name: 'Inside' })
    const otherWs = s.createWorkspace({ name: 'Other workspace' })
    const outside = s.createProject({ name: 'Outside' })
    s.moveProjectToWorkspace(outside, otherWs)
    useStore.setState({ navSurface: 'dashboard' })

    render(<Dashboard />)

    expect(screen.getByRole('button', { name: 'Open project Inside' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open project Outside' })).toBeNull()
    expect(useStore.getState().projects[inside]).toBeTruthy()
  })
})
