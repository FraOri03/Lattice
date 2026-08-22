import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import { useWorkspaceLayoutStore } from '@/store/workspaceLayoutStore'
import { useUiStore } from '@/store/useUiStore'
import { SectionTabs } from './SectionTabs'

const tab = (name: RegExp) => screen.getByRole('button', { name })
const splitTab = () => tab(/split view/i)
const graphTab = () => tab(/graph view/i)

describe('SectionTabs', () => {
  beforeEach(() => {
    useStore.setState({ viewMode: 'board' })
    useUiStore.setState({ aiPanelOpen: false })
    useWorkspaceLayoutStore.setState({
      split: false,
      secondaryContent: 'board',
      direction: 'horizontal',
      ratio: 0.5,
      graphReturnMode: 'board',
    })
  })

  it('renders every live surface: Split, Board · Graph, the editors and Photo', () => {
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

  /**
   * The switcher's order is the product decision this branch made, so it is
   * asserted rather than left to whoever next edits the JSX: five clusters,
   * with Photo inside the creative one — between Forge and Folio — and not
   * beside the editors it was built next to.
   *
   * The AI cluster now leads with a live tab (21.3) where it used to hold two
   * placeholders. That is the placeholder model working as designed: the
   * surface that shipped moved into space the bar had already been measured
   * with, so nothing else in this list moved.
   */
  it('lays the five clusters out in order, with Photo inside the creative one', () => {
    render(<SectionTabs />)
    expect(
      screen
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      'Split view',
      'Board section',
      'Graph view',
      'Document section',
      'Sheet section',
      'Presentation section',
      'Code section',
      'AI panel',
      'ComfyUI — planned, not available yet',
      'Trace — planned, not available yet',
      'Forge — planned, not available yet',
      'Photo section',
      'Folio — planned, not available yet',
      'Flux — planned, not available yet',
    ])
  })

  /** The one tab in the AI cluster that does something. */
  it('opens the AI panel from the toolbar, and closes it again', () => {
    render(<SectionTabs />)
    const ai = tab(/^ai panel$/i)
    expect(ai).not.toBeDisabled()
    expect(ai).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(ai)
    expect(useUiStore.getState().aiPanelOpen).toBe(true)
    expect(tab(/^ai panel$/i)).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(tab(/^ai panel$/i))
    expect(useUiStore.getState().aiPanelOpen).toBe(false)
  })

  it('leaves the planned environments disabled, and says which phase builds each', () => {
    render(<SectionTabs />)
    for (const [name, phase] of [
      [/comfyui/i, 21],
      [/trace/i, 23],
      [/forge/i, 24],
      [/folio/i, 25],
      [/flux/i, 26],
    ] as const) {
      const planned = tab(name)
      expect(planned).toBeDisabled()
      // never "coming soon" — the tooltip names the phase that builds it
      expect(planned).toHaveAttribute('title', expect.stringContaining(`phase ${phase}`))
    }
  })

  it('does not pin a planned tab to a word it cannot afford', () => {
    render(<SectionTabs />)
    // the five placeholders are icon-only at every width, so the switcher can
    // still show the eight live labels when the bar is wide enough for them
    expect(tab(/trace/i)).toHaveTextContent('')
    expect(tab(/document section/i)).toHaveTextContent('Document')
  })

  /**
   * The AI tab is live and still icon-only: `topBarFit`'s budget was measured
   * with this cluster contributing two icons and no words, and a ninth label
   * in the switcher takes the bar past the box it was measured into.
   */
  it('keeps the AI tab icon-only, so the bar keeps the width it was measured with', () => {
    render(<SectionTabs />)
    expect(tab(/^ai panel$/i)).toHaveTextContent('')
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

  // The i18n slice localised the old eight-tab tablist; this branch replaced it,
  // so these guard that the translations survived the restructure.
  describe('localisation', () => {
    afterEach(() => useStore.setState({ locale: 'en' }))

    it('renders English labels by default', () => {
      useStore.setState({ locale: 'en' })
      render(<SectionTabs />)
      for (const label of ['Split', 'Board', 'Graph', 'Document', 'Sheet']) {
        expect(screen.getByText(label)).toBeInTheDocument()
      }
    })

    it('switches every tab — layout, view and sections — to Italian', () => {
      useStore.setState({ locale: 'it' })
      render(<SectionTabs />)
      for (const label of ['Diviso', 'Grafo', 'Documento', 'Foglio', 'Codice']) {
        expect(screen.getByText(label)).toBeInTheDocument()
      }
      // and the accessible names follow the locale too
      expect(
        screen.getByRole('button', { name: 'Sezione Documento' }),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Vista Diviso' })).toBeInTheDocument()
    })
  })
})
