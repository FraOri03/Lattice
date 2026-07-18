import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import { useWorkspaceLayoutStore } from '@/store/workspaceLayoutStore'
import { SectionTabs } from './SectionTabs'

const tab = (name: RegExp) => screen.getByRole('button', { name })
const splitTab = () => tab(/split view/i)
const graphTab = () => tab(/graph view/i)

describe('SectionTabs', () => {
  beforeEach(() => {
    useStore.setState({ viewMode: 'board' })
    useWorkspaceLayoutStore.setState({
      split: false,
      secondaryContent: 'board',
      direction: 'horizontal',
      ratio: 0.5,
      graphReturnMode: 'board',
    })
  })

  it('renders the two clusters: [Board · Graph] and [Split · sections]', () => {
    render(<SectionTabs />)
    for (const name of [
      /board section/i,
      /graph view/i,
      /split view/i,
      /document section/i,
      /sheet section/i,
      /presentation section/i,
      /code section/i,
      /photo section/i,
    ]) {
      expect(tab(name)).toBeInTheDocument()
    }
  })

  it('marks the active section with aria-pressed', () => {
    render(<SectionTabs />)
    expect(tab(/board section/i)).toHaveAttribute('aria-pressed', 'true')
    expect(tab(/code section/i)).toHaveAttribute('aria-pressed', 'false')
  })

  it('switches section and leaves the split layout', () => {
    useWorkspaceLayoutStore.setState({ split: true })
    render(<SectionTabs />)
    fireEvent.click(tab(/sheet section/i))
    expect(useStore.getState().viewMode).toBe('sheet')
    expect(useWorkspaceLayoutStore.getState().split).toBe(false)
  })

  it('Split is a toggle, independent of the active section', () => {
    useStore.setState({ viewMode: 'doc' })
    render(<SectionTabs />)
    fireEvent.click(splitTab())
    expect(useWorkspaceLayoutStore.getState().split).toBe(true)
    expect(splitTab()).toHaveAttribute('aria-pressed', 'true')
    // the section stays active at the same time — split is a layout, not a mode
    expect(tab(/document section/i)).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(splitTab())
    expect(useWorkspaceLayoutStore.getState().split).toBe(false)
  })

  it('Graph swaps the single pane and returns to the section', () => {
    useStore.setState({ viewMode: 'doc' })
    render(<SectionTabs />)
    fireEvent.click(graphTab())
    expect(useStore.getState().viewMode).toBe('graph')
    expect(graphTab()).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(graphTab())
    expect(useStore.getState().viewMode).toBe('doc')
  })

  it('while split, Graph occupies the second pane (editor left, graph right)', () => {
    useStore.setState({ viewMode: 'doc' })
    render(<SectionTabs />)
    fireEvent.click(splitTab())
    fireEvent.click(graphTab())
    expect(useWorkspaceLayoutStore.getState().split).toBe(true)
    expect(useWorkspaceLayoutStore.getState().secondaryContent).toBe('graph')
    expect(useStore.getState().viewMode).toBe('doc') // primary stays the editor
  })

  it('disables Split for full-page sections (presentation, photo)', () => {
    useStore.setState({ viewMode: 'presentation' })
    render(<SectionTabs />)
    expect(splitTab()).toBeDisabled()
  })
})
