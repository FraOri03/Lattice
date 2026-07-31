import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import { usePhotoStore } from '@/store/photoStore'
import { PhotoToolbar } from './PhotoWorkspace'

/**
 * Photo is the reference fixture for the Phase 11.1 primitives: it already
 * had the select/pan model, toggles, undo/redo and import/export, so if the
 * shared components cannot express it without loss, they are wrong.
 *
 * These tests lock the migration against exactly that: every action survives,
 * the keyboard model arrives, and the labels are localised.
 */

const bar = () => screen.getByRole('toolbar', { name: /photo tools|strumenti foto/i })

describe('PhotoToolbar', () => {
  beforeEach(() => {
    useStore.setState({ locale: 'en' })
    usePhotoStore.setState({ tool: 'select', aiPanelOpen: false, historyIndex: 0 })
  })

  it('keeps every action the hand-written toolbar had', () => {
    render(<PhotoToolbar />)
    for (const name of [
      /select/i,
      /pan/i,
      /add camera/i,
      /add light source/i,
      /add person/i,
      /add generic prop/i,
      /^undo$/i,
      /^redo$/i,
      /import scene json/i,
      /export scene as json/i,
      /ai assistant/i,
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('is a named toolbar and a single tab stop', () => {
    render(<PhotoToolbar />)
    expect(bar()).toHaveAttribute('aria-orientation', 'horizontal')
    const controls = [...document.querySelectorAll<HTMLElement>('[data-toolbar-control]')]
    expect(controls.filter((c) => c.tabIndex === 0)).toHaveLength(1)
  })

  it('groups the controls semantically', () => {
    render(<PhotoToolbar />)
    for (const name of [
      /selection tools/i,
      /creation tools/i,
      /history/i,
      /import and export/i,
    ]) {
      expect(screen.getByRole('group', { name })).toBeInTheDocument()
    }
  })

  it('exposes the active tool through aria-pressed', () => {
    render(<PhotoToolbar />)
    expect(screen.getByRole('button', { name: /select/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: /pan/i }))
    expect(usePhotoStore.getState().tool).toBe('pan')
    expect(screen.getByRole('button', { name: /pan/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('disables undo at the start of history and says why in the tooltip', () => {
    render(<PhotoToolbar />)
    const undo = screen.getByRole('button', { name: /^undo$/i })
    expect(undo).toBeDisabled()
    expect(undo).toHaveAttribute('title', 'Undo (Ctrl+Z)')
  })

  it('never lands on the disabled undo while arrowing through the bar', () => {
    render(<PhotoToolbar />)
    const undo = screen.getByRole('button', { name: /^undo$/i })
    expect(undo).toBeDisabled()
    const controls = [...document.querySelectorAll<HTMLElement>('[data-toolbar-control]')]
    controls[0].focus()
    const visited: Element[] = []
    for (let i = 0; i < controls.length + 1; i++) {
      fireEvent.keyDown(bar(), { key: 'ArrowRight' })
      visited.push(document.activeElement as Element)
    }
    expect(visited).not.toContain(undo)
    // and the walk really did move around the bar
    expect(new Set(visited).size).toBeGreaterThan(2)
  })

  it('toggles the AI panel', () => {
    render(<PhotoToolbar />)
    fireEvent.click(screen.getByRole('button', { name: /ai assistant/i }))
    expect(usePhotoStore.getState().aiPanelOpen).toBe(true)
  })

  describe('localisation', () => {
    it('switches every label to Italian', () => {
      useStore.setState({ locale: 'it' })
      render(<PhotoToolbar />)
      expect(
        screen.getByRole('toolbar', { name: 'Strumenti foto' }),
      ).toBeInTheDocument()
      for (const name of [
        'Seleziona',
        'Sposta',
        'Aggiungi camera',
        'Aggiungi fonte di luce',
        'Aggiungi persona',
        'Aggiungi oggetto di scena',
        'Annulla',
        'Ripristina',
        'Importa scena JSON',
        'Esporta scena come JSON',
        'Assistente AI',
      ]) {
        expect(screen.getByRole('button', { name })).toBeInTheDocument()
      }
      expect(screen.getByRole('group', { name: 'Cronologia' })).toBeInTheDocument()
    })
  })
})
