import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { useStore } from '@/store/useStore'
import { useCollabStore } from '@/lib/collab/collabStore'
import { CanvasToolbar } from './CanvasToolbar'

/**
 * The Board is the pilot for the Phase 11.1 primitives: it is the only mode
 * with split controls, a permission-gated tool and labelled buttons, so it is
 * where the migration could quietly lose something.
 *
 * These lock what the hand-written bar did, plus the three things the audit
 * said it did wrong: one tab stop instead of eight, menu triggers named for
 * what they open, and localised labels.
 */

const bar = () => screen.getByRole('toolbar', { name: /board tools|strumenti board/i })
const renderBar = () =>
  render(
    <ReactFlowProvider>
      <CanvasToolbar />
    </ReactFlowProvider>,
  )

describe('CanvasToolbar', () => {
  beforeEach(() => {
    useStore.setState({ locale: 'en' })
    useCollabStore.setState({ commentMode: false })
  })

  it('keeps every tool the hand-written toolbar offered', () => {
    renderBar()
    // structure + the primary of each split family
    for (const name of [/^section$/i, /^note$/i, /^image$/i, /^web embed$/i]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('names each menu trigger for what it opens, never a bare "More"', () => {
    renderBar()
    for (const name of [
      /open card tools/i,
      /open media tools/i,
      /open import & embed tools/i,
    ]) {
      const trigger = screen.getByRole('button', { name })
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
    }
    expect(screen.queryByRole('button', { name: /^more/i })).toBeNull()
  })

  it('offers only card kinds the product can really create', () => {
    renderBar()
    fireEvent.click(screen.getByRole('button', { name: /open card tools/i }))
    const menu = screen.getByRole('menu', { name: /open card tools/i })
    const items = [...menu.querySelectorAll('[role="menuitem"]')].map((el) =>
      el.textContent?.trim(),
    )
    expect(items).toEqual(['Note', 'Document', 'Spreadsheet', 'Presentation', 'Code'])
    // no invented families: the board has no pen, shapes, frames or connectors
    expect(screen.queryByRole('menuitem', { name: /pen|shape|frame|connector/i })).toBeNull()
  })

  it('is one tab stop, not one per tool', () => {
    renderBar()
    const controls = [...document.querySelectorAll<HTMLElement>('[data-toolbar-control]')]
    expect(controls.length).toBeGreaterThan(5)
    expect(controls.filter((c) => c.tabIndex === 0)).toHaveLength(1)
  })

  it('walks the bar with the arrow keys', () => {
    renderBar()
    const controls = [...document.querySelectorAll<HTMLElement>('[data-toolbar-control]')]
    controls[0].focus()
    fireEvent.keyDown(bar(), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(controls[1])
    fireEvent.keyDown(bar(), { key: 'End' })
    expect(document.activeElement).toBe(controls.at(-1))
  })

  it('exposes comment mode through aria-pressed', () => {
    renderBar()
    const comment = screen.getByRole('button', { name: /^comment$/i })
    expect(comment).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(comment)
    expect(useCollabStore.getState().commentMode).toBe(true)
  })

  it('hides the comment tool when the role cannot comment', () => {
    // owners can preview the project as a lesser role (ShareDialog's "view as")
    useCollabStore.setState({ viewAsRole: 'viewer' })
    renderBar()
    expect(screen.queryByRole('button', { name: /^comment$/i })).toBeNull()
    // the rest of the bar is still there — a viewer is not shown an empty bar
    expect(screen.getByRole('button', { name: /^section$/i })).toBeInTheDocument()
    useCollabStore.setState({ viewAsRole: null })
  })

  describe('localisation', () => {
    it('switches the tools and the menu triggers to Italian', () => {
      useStore.setState({ locale: 'it' })
      renderBar()
      expect(screen.getByRole('toolbar', { name: 'Strumenti board' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sezione' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Nota' })).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Apri strumenti card' }),
      ).toBeInTheDocument()
    })
  })
})
