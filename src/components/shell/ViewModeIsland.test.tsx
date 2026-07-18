import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import { useWorkspaceLayoutStore } from '@/store/workspaceLayoutStore'
import { ViewModeIsland } from './ViewModeIsland'

const split = () => screen.getByRole('button', { name: /split view mode/i })
const graph = () => screen.getByRole('button', { name: /graph view mode/i })

describe('ViewModeIsland', () => {
  beforeEach(() => {
    useStore.setState({ viewMode: 'board' })
    useWorkspaceLayoutStore.setState({
      split: false,
      secondaryContent: 'board',
      direction: 'horizontal',
      ratio: 0.5,
    })
  })

  it('exposes both toggles with aria-pressed reflecting state', () => {
    render(<ViewModeIsland />)
    expect(split()).toHaveAttribute('aria-pressed', 'false')
    expect(graph()).toHaveAttribute('aria-pressed', 'false')
  })

  it('Split toggles the split layout', () => {
    render(<ViewModeIsland />)
    fireEvent.click(split())
    expect(useWorkspaceLayoutStore.getState().split).toBe(true)
    expect(split()).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(split())
    expect(useWorkspaceLayoutStore.getState().split).toBe(false)
  })

  it('Graph swaps the single pane to the graph and back to the section', () => {
    useStore.setState({ viewMode: 'doc' })
    render(<ViewModeIsland />)
    fireEvent.click(graph())
    expect(useStore.getState().viewMode).toBe('graph')
    expect(graph()).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(graph())
    expect(useStore.getState().viewMode).toBe('doc') // returns to the section
  })

  it('while split, Graph shows in the second pane (editor left, graph right)', () => {
    useStore.setState({ viewMode: 'doc' })
    render(<ViewModeIsland />)
    fireEvent.click(split()) // editor + board
    fireEvent.click(graph()) // editor + graph
    expect(useWorkspaceLayoutStore.getState().split).toBe(true)
    expect(useWorkspaceLayoutStore.getState().secondaryContent).toBe('graph')
    expect(useStore.getState().viewMode).toBe('doc') // primary stays the editor
  })

  it('disables Split for full-page sections (presentation, photo)', () => {
    useStore.setState({ viewMode: 'presentation' })
    render(<ViewModeIsland />)
    expect(split()).toBeDisabled()
  })
})
