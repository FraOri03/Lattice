import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import { SlideToolbar } from './SlideToolbar'

/**
 * The slide editor's toolbar (Phase 11.1.6b). Extracted from the workspace so
 * it can be tested at all — before this it was inline in a 900-line component.
 *
 * Shapes live here and nowhere else in Lattice, which is exactly why this bar
 * may show them: it advertises what this editor can really do.
 */

const handlers = {
  onAddText: vi.fn(),
  onAddImage: vi.fn(),
  onAddShape: vi.fn(),
  onBackground: vi.fn(),
  onResetBackground: vi.fn(),
  onToggleSnap: vi.fn(),
  onAlign: vi.fn(),
  onDistribute: vi.fn(),
}

const renderBar = (
  props: Partial<{
    background: string | null
    slideIndex: number
    slideCount: number
    selectedCount: number
    snapEnabled: boolean
  }> = {},
) =>
  render(
    <SlideToolbar
      slideIndex={props.slideIndex ?? 0}
      slideCount={props.slideCount ?? 3}
      background={props.background ?? null}
      themeBackground="#ffffff"
      selectedCount={props.selectedCount ?? 0}
      snapEnabled={props.snapEnabled ?? true}
      {...handlers}
    />,
  )

beforeEach(() => {
  useStore.setState({ locale: 'en' })
  for (const fn of Object.values(handlers)) fn.mockClear()
})
afterEach(() => useStore.setState({ locale: 'en' }))

describe('SlideToolbar — structure', () => {
  it('is a named toolbar with one tab stop, colour input included', () => {
    renderBar()
    expect(screen.getByRole('toolbar', { name: 'Slide tools' })).toBeInTheDocument()
    const controls = [...document.querySelectorAll<HTMLElement>('[data-toolbar-control]')]
    expect(controls.filter((c) => c.tabIndex === 0)).toHaveLength(1)
    expect(controls.some((c) => c.getAttribute('type') === 'color')).toBe(true)
  })

  it('keeps every control the inline bar had', () => {
    renderBar()
    for (const name of ['Text', 'Image', 'Add rectangle', 'Add ellipse', 'Add line']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.getByLabelText('Slide background colour')).toBeInTheDocument()
  })

  it('keeps the visible word as the name and the verb in the tooltip', () => {
    renderBar()
    expect(screen.getByRole('button', { name: 'Text' })).toHaveAttribute(
      'title',
      'Add text box',
    )
    expect(screen.getByRole('button', { name: 'Image' })).toHaveAttribute(
      'title',
      'Add image',
    )
  })

  it('reports the slide position without claiming to be a control', () => {
    renderBar({ slideIndex: 1, slideCount: 4 })
    const status = screen.getByText(/Slide 2\/4/)
    expect(status).not.toHaveAttribute('data-toolbar-control')
  })
})

describe('SlideToolbar — background', () => {
  it('offers the reset only when the slide overrides the theme', () => {
    const { unmount } = renderBar({ background: null })
    expect(screen.queryByRole('button', { name: 'Reset to the theme background' })).toBeNull()
    unmount()
    renderBar({ background: '#ff0000' })
    expect(
      screen.getByRole('button', { name: 'Reset to the theme background' }),
    ).toBeInTheDocument()
  })

  it('falls back to the theme colour when the slide has none', () => {
    renderBar({ background: null })
    expect(screen.getByLabelText('Slide background colour')).toHaveValue('#ffffff')
  })

  it('resets to the theme', () => {
    renderBar({ background: '#ff0000' })
    fireEvent.click(screen.getByRole('button', { name: 'Reset to the theme background' }))
    expect(handlers.onResetBackground).toHaveBeenCalledOnce()
  })
})

describe('SlideToolbar — commands', () => {
  it('adds text and images', () => {
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: 'Text' }))
    fireEvent.click(screen.getByRole('button', { name: 'Image' }))
    expect(handlers.onAddText).toHaveBeenCalledOnce()
    expect(handlers.onAddImage).toHaveBeenCalledOnce()
  })

  it('adds each shape by name', () => {
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: 'Add rectangle' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add ellipse' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add line' }))
    expect(handlers.onAddShape.mock.calls.map(([s]) => s)).toEqual([
      'rect',
      'ellipse',
      'line',
    ])
  })
})

describe('SlideToolbar — precision (19E.0)', () => {
  it('states the snapping state through aria-pressed, not colour alone', () => {
    const { unmount } = renderBar({ snapEnabled: true })
    expect(screen.getByRole('button', { name: 'Snapping' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    unmount()
    renderBar({ snapEnabled: false })
    expect(screen.getByRole('button', { name: 'Snapping' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('toggles snapping', () => {
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: 'Snapping' }))
    expect(handlers.onToggleSnap).toHaveBeenCalledOnce()
  })
})

describe('SlideToolbar — align and distribute (19E.0)', () => {
  it('stays hidden until there is something to align against', () => {
    const { unmount } = renderBar({ selectedCount: 1 })
    expect(screen.queryByRole('button', { name: 'Align left' })).toBeNull()
    unmount()
    renderBar({ selectedCount: 2 })
    expect(screen.getByRole('button', { name: 'Align left' })).toBeInTheDocument()
  })

  it('reports each edge it was asked for', () => {
    renderBar({ selectedCount: 2 })
    for (const name of [
      'Align left',
      'Align horizontal centres',
      'Align right',
      'Align top',
      'Align vertical centres',
      'Align bottom',
    ]) {
      fireEvent.click(screen.getByRole('button', { name }))
    }
    expect(handlers.onAlign.mock.calls.map(([e]) => e)).toEqual([
      'left',
      'hcenter',
      'right',
      'top',
      'vcenter',
      'bottom',
    ])
  })

  it('disables distribution below three elements, and says why', () => {
    const { unmount } = renderBar({ selectedCount: 2 })
    const two = screen.getByRole('button', { name: 'Distribute horizontally' })
    expect(two).toBeDisabled()
    expect(two.getAttribute('title')).toContain('at least three')
    unmount()
    renderBar({ selectedCount: 3 })
    fireEvent.click(screen.getByRole('button', { name: 'Distribute horizontally' }))
    fireEvent.click(screen.getByRole('button', { name: 'Distribute vertically' }))
    expect(handlers.onDistribute.mock.calls.map(([a]) => a)).toEqual(['h', 'v'])
  })
})

describe('SlideToolbar — status', () => {
  it('reports the selection instead of the slide once something is selected', () => {
    renderBar({ selectedCount: 3, slideIndex: 1, slideCount: 4 })
    expect(screen.getByText(/3 selected/)).toBeInTheDocument()
    expect(screen.queryByText(/Slide 2\/4/)).toBeNull()
  })
})

describe('SlideToolbar — localisation', () => {
  it('switches to Italian, status line included', () => {
    useStore.setState({ locale: 'it' })
    renderBar({ slideIndex: 0, slideCount: 2, background: '#ff0000' })
    expect(screen.getByRole('toolbar', { name: 'Strumenti diapositiva' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aggiungi rettangolo' })).toBeInTheDocument()
    expect(screen.getByLabelText('Colore di sfondo della diapositiva')).toBeInTheDocument()
    expect(screen.getByText(/Diapositiva 1\/2/)).toBeInTheDocument()
  })

  it('translates the precision controls too', () => {
    useStore.setState({ locale: 'it' })
    renderBar({ selectedCount: 2 })
    expect(screen.getByRole('button', { name: 'Aggancio' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Allinea a sinistra' })).toBeInTheDocument()
  })
})
