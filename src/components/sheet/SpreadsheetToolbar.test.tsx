import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import type { SheetSessionValue } from './SheetSession'
import { SpreadsheetToolbar } from './SpreadsheetToolbar'

/**
 * The spreadsheet formatting bar on the shared primitives (Phase 11.1.6a).
 *
 * This was the worst surface in the audit: no toolbar role, no name on the bar
 * OR on any button — a screen reader announced "B", "I", "A", "✕", "+ Row" —
 * and bold/italic/alignment state lived in a background colour with no
 * `aria-pressed`. These tests lock the repair.
 *
 * The session is mocked: mounting the real one loads a workbook from storage,
 * which is not what this file is about.
 */

let session: SheetSessionValue

vi.mock('./SheetSession', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./SheetSession')>()
  return { ...actual, useSheetSession: () => session }
})

vi.mock('@/components/collab/EntityPresence', () => ({
  SheetPeerChips: () => null,
}))

const calls = {
  applyStyle: vi.fn(),
  insertRowAt: vi.fn(),
  deleteRowAt: vi.fn(),
  insertColAt: vi.fn(),
  deleteColAt: vi.fn(),
}

function makeSession({
  style = {},
  readOnly = false,
  selection = { anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } },
}: {
  style?: Record<string, unknown>
  readOnly?: boolean
  selection?: { anchor: { r: number; c: number }; focus: { r: number; c: number } }
} = {}) {
  return {
    sheetId: 'sheet_1',
    sheet: { cells: { '0:0': { s: style } } },
    selection,
    active: selection.anchor,
    readOnly,
    ...calls,
  } as unknown as SheetSessionValue
}

beforeEach(() => {
  useStore.setState({ locale: 'en' })
  session = makeSession()
  for (const fn of Object.values(calls)) fn.mockClear()
})
afterEach(() => useStore.setState({ locale: 'en' }))

describe('SpreadsheetToolbar — naming', () => {
  it('is a named toolbar with one tab stop', () => {
    render(<SpreadsheetToolbar />)
    expect(screen.getByRole('toolbar', { name: 'Cell formatting' })).toBeInTheDocument()
    const controls = [...document.querySelectorAll<HTMLElement>('[data-toolbar-control]')]
    expect(controls.filter((c) => c.tabIndex === 0)).toHaveLength(1)
  })

  it('names every control — the headline gap of this surface', () => {
    render(<SpreadsheetToolbar />)
    const controls = [...document.querySelectorAll('[data-toolbar-control]')]
    expect(controls.length).toBeGreaterThan(10)
    for (const c of controls) {
      expect(c.getAttribute('aria-label')?.trim()).toBeTruthy()
    }
  })

  it('keeps every action the old bar had', () => {
    render(<SpreadsheetToolbar />)
    for (const name of [
      'Bold',
      'Italic',
      'Text colour',
      'Clear text colour',
      'Fill colour',
      'Clear fill colour',
      'Align left',
      'Align centre',
      'Align right',
      'Insert row',
      'Delete row',
      'Insert column',
      'Delete column',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('combobox', { name: 'Number format' })).toBeInTheDocument()
  })
})

describe('SpreadsheetToolbar — state', () => {
  it('exposes bold/italic through aria-pressed, not colour alone', () => {
    session = makeSession({ style: { b: true } })
    render(<SpreadsheetToolbar />)
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('exposes the active alignment', () => {
    session = makeSession({ style: { align: 'center' } })
    render(<SpreadsheetToolbar />)
    expect(screen.getByRole('button', { name: 'Align centre' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Align left' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('renders nothing for a viewer, exactly as before', () => {
    session = makeSession({ readOnly: true })
    const { container } = render(<SpreadsheetToolbar />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('SpreadsheetToolbar — commands', () => {
  it('toggles a mark on the selection', () => {
    render(<SpreadsheetToolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
    expect(calls.applyStyle).toHaveBeenCalledWith({ b: true })
  })

  it('clears a colour', () => {
    render(<SpreadsheetToolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear fill colour' }))
    expect(calls.applyStyle).toHaveBeenCalledWith({ bg: undefined })
  })

  it('applies a number format, and maps General back to none', () => {
    render(<SpreadsheetToolbar />)
    const select = screen.getByRole('combobox', { name: 'Number format' })
    fireEvent.change(select, { target: { value: 'percent' } })
    expect(calls.applyStyle).toHaveBeenCalledWith({ fmt: 'percent' })
    fireEvent.change(select, { target: { value: 'general' } })
    expect(calls.applyStyle).toHaveBeenCalledWith({ fmt: undefined })
  })

  it('inserts one row per selected row, and says so in the tooltip', () => {
    session = makeSession({
      selection: { anchor: { r: 1, c: 0 }, focus: { r: 3, c: 0 } },
    })
    render(<SpreadsheetToolbar />)
    const insert = screen.getByRole('button', { name: 'Insert row' })
    expect(insert).toHaveAttribute('title', 'Insert 3 rows above')
    fireEvent.click(insert)
    expect(calls.insertRowAt).toHaveBeenCalledTimes(3)
  })

  it('names the row range it would delete', () => {
    session = makeSession({
      selection: { anchor: { r: 1, c: 0 }, focus: { r: 3, c: 0 } },
    })
    render(<SpreadsheetToolbar />)
    expect(screen.getByRole('button', { name: 'Delete row' })).toHaveAttribute(
      'title',
      'Delete rows 2–4',
    )
  })

  it('deletes columns across the selection', () => {
    session = makeSession({
      selection: { anchor: { r: 0, c: 0 }, focus: { r: 0, c: 1 } },
    })
    render(<SpreadsheetToolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete column' }))
    expect(calls.deleteColAt).toHaveBeenCalledTimes(2)
  })
})

describe('SpreadsheetToolbar — localisation', () => {
  it('switches to Italian, number formats included', () => {
    useStore.setState({ locale: 'it' })
    render(<SpreadsheetToolbar />)
    expect(screen.getByRole('toolbar', { name: 'Formattazione celle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Grassetto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Colore sfondo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Allinea al centro' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Valuta €' })).toBeInTheDocument()
  })
})
