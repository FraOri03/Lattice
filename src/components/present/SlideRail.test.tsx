import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SlideRail, type SlideRailHandlers } from './SlideRail'
import type { PresentSlide, PresentationBody } from '@/lib/present/presentModel'

/**
 * The rail is where the deck's structure is visible (19E.1): sections, which
 * slides are actually part of the presentation, and where each one stands in
 * review. These assert what a person can see and reach, not how it is built.
 */

const slide = (id: string, extra: Partial<PresentSlide> = {}): PresentSlide => ({
  id,
  background: null,
  notes: '',
  elements: [],
  ...extra,
})

const handlers = (): SlideRailHandlers => ({
  onGoTo: vi.fn(),
  onMove: vi.fn(),
  onDuplicate: vi.fn(),
  onDelete: vi.fn(),
  onAdd: vi.fn(),
  onStartSection: vi.fn(),
  onRenameSection: vi.fn(),
  onToggleCollapsed: vi.fn(),
  onMoveSection: vi.fn(),
  onRemoveSection: vi.fn(),
})

const body = (
  slides: PresentSlide[],
  sections?: PresentationBody['sections'],
): PresentationBody => ({
  app: 'lattice-present',
  version: 3,
  theme: 'plain',
  slides,
  ...(sections ? { sections } : {}),
})

const renderRail = (
  deck: PresentationBody,
  h: SlideRailHandlers = handlers(),
  readOnly = false,
) => {
  render(<SlideRail body={deck} currentIndex={0} readOnly={readOnly} handlers={h} />)
  return h
}

describe('SlideRail — sections', () => {
  const sectioned = body(
    [slide('a'), slide('b', { sectionId: 's1' }), slide('c', { sectionId: 's1' })],
    [{ id: 's1', title: 'Where we are' }],
  )

  it('shows the section heading with how many slides it holds', () => {
    renderRail(sectioned)
    const heading = screen.getByRole('button', { name: 'Where we are' })
    expect(heading).toBeInTheDocument()
    // the count sits beside the heading; "2" also appears as a slide number,
    // so scope the assertion to the header row
    expect(heading.parentElement).toHaveTextContent(/Where we are\s*2/)
  })

  it('keeps unsectioned slides visible instead of hiding them under a heading', () => {
    renderRail(sectioned)
    expect(screen.getByRole('button', { name: 'Slide 1' })).toBeInTheDocument()
  })

  it('hides a collapsed section’s slides but keeps the heading reachable', () => {
    const collapsed = body(
      [slide('a', { sectionId: 's1' }), slide('b', { sectionId: 's1' })],
      [{ id: 's1', title: 'Opening', collapsed: true }],
    )
    renderRail(collapsed)
    expect(screen.getByText('Opening')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Slide 1' })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Expand section Opening' }),
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('asks to collapse the section it was clicked on', () => {
    const h = renderRail(sectioned)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse section Where we are' }))
    expect(h.onToggleCollapsed).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's1' }),
    )
  })

  it('keeps the old title when the rename field is emptied', () => {
    const h = renderRail(sectioned)
    fireEvent.click(screen.getByRole('button', { name: 'Where we are' }))
    const field = screen.getByRole('textbox', { name: 'Rename section Where we are' })
    fireEvent.change(field, { target: { value: '   ' } })
    fireEvent.blur(field)
    expect(h.onRenameSection).toHaveBeenCalledWith('s1', 'Where we are')
  })

  it('says that removing the heading keeps the slides', () => {
    renderRail(sectioned)
    expect(
      screen.getByRole('button', { name: 'Remove section Where we are' }),
    ).toHaveAttribute('title', expect.stringContaining('slides stay'))
  })
})

describe('SlideRail — hidden slides', () => {
  const withHidden = body([slide('a'), slide('b', { hidden: true })])

  it('marks a hidden slide in the rail and in its accessible name', () => {
    renderRail(withHidden)
    expect(screen.getByText('Hidden')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Slide 2 (hidden)' })).toBeInTheDocument()
  })

  it('still lists it — hidden is not deleted', () => {
    renderRail(withHidden)
    expect(screen.getByRole('button', { name: /Slide 1$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Slide 2 (hidden)' })).toBeInTheDocument()
  })
})

describe('SlideRail — review status', () => {
  it('shows the status as a labelled mark, not colour alone', () => {
    renderRail(body([slide('a', { reviewStatus: 'approved' })]))
    expect(screen.getByRole('img', { name: 'Approved' })).toBeInTheDocument()
  })

  it('shows nothing when nobody has said', () => {
    renderRail(body([slide('a')]))
    expect(screen.queryByRole('img', { name: 'Approved' })).toBeNull()
  })
})

describe('SlideRail — read-only', () => {
  it('offers no structural controls to a viewer', () => {
    renderRail(body([slide('a'), slide('b')]), handlers(), true)
    expect(screen.queryByRole('button', { name: 'Add slide' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete slide 1' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Start a section at slide 1' })).toBeNull()
  })
})

describe('SlideRail — slide actions', () => {
  it('starts a section at the slide it was asked about', () => {
    const h = renderRail(body([slide('a'), slide('b')]))
    fireEvent.click(screen.getByRole('button', { name: 'Start a section at slide 2' }))
    expect(h.onStartSection).toHaveBeenCalledWith(1)
  })

  it('cannot move the first slide up or the last one down', () => {
    renderRail(body([slide('a'), slide('b')]))
    expect(screen.getByRole('button', { name: 'Move slide 1 up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move slide 2 down' })).toBeDisabled()
  })

  it('selects a slide without also triggering its row actions', () => {
    const h = renderRail(body([slide('a'), slide('b')]))
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate slide 2' }))
    expect(h.onDuplicate).toHaveBeenCalledWith(1)
    expect(h.onGoTo).not.toHaveBeenCalled()
  })
})
