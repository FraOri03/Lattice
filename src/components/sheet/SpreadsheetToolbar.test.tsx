import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

vi.mock('@/components/ui/Toaster', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const calls = {
  applyStyle: vi.fn(),
  insertRowAt: vi.fn(),
  deleteRowAt: vi.fn(),
  insertColAt: vi.fn(),
  deleteColAt: vi.fn(),
  copySelection: vi.fn(),
  cutSelection: vi.fn(),
  pasteMatrix: vi.fn(),
  pasteOriginFor: vi.fn(() => undefined),
  sortSelection: vi.fn(),
  removeDuplicates: vi.fn(() => 0),
  findReplace: vi.fn(() => 0),
  applyBorders: vi.fn(),
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
    // an exact count on purpose: a merge already removed two thirds of this bar
    // once, and nothing in the suite noticed
    expect(controls.length).toBe(33)
    for (const c of controls) {
      expect(c.getAttribute('aria-label')?.trim()).toBeTruthy()
    }
  })

  it('keeps every action the old bar had', () => {
    render(<SpreadsheetToolbar />)
    for (const name of [
      'Paste',
      'Cut',
      'Copy',
      'Bold',
      'Italic',
      'Underline',
      'Text colour',
      'Clear text colour',
      'Fill colour',
      'Clear fill colour',
      'Align top',
      'Align middle',
      'Align bottom',
      'Align left',
      'Align centre',
      'Align right',
      'Wrap text',
      'Thousands separator',
      'Increase decimals',
      'Decrease decimals',
      'Insert row',
      'Delete row',
      'Insert column',
      'Delete column',
      'Sort ascending',
      'Sort descending',
      'Remove duplicate rows',
      'Find & replace',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    for (const name of ['Font', 'Font size', 'Borders', 'Number format', 'Cell style']) {
      expect(screen.getByRole('combobox', { name })).toBeInTheDocument()
    }
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

/**
 * The 11.1.6a migration was merged into a main that had meanwhile grown the
 * Clipboard, Borders and Data groups, and the merge kept the migrated JSX while
 * taking main's session destructuring — silently dropping two thirds of the
 * bar. Only the unused bindings gave it away, as TS6133 in the Vercel build.
 * These tests exist so the same merge cannot pass twice.
 */
describe('SpreadsheetToolbar — commands the merge dropped', () => {
  it('cuts and copies the selection', () => {
    render(<SpreadsheetToolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(calls.copySelection).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cut' }))
    expect(calls.cutSelection).toHaveBeenCalled()
  })

  it('applies a border kind and returns to the placeholder', () => {
    render(<SpreadsheetToolbar />)
    const borders = screen.getByRole('combobox', { name: 'Borders' })
    fireEvent.change(borders, { target: { value: 'outline' } })
    expect(calls.applyBorders).toHaveBeenCalledWith('outline')
    expect((borders as HTMLSelectElement).value).toBe('')
  })

  it('sorts by the active column in both directions', () => {
    render(<SpreadsheetToolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Sort ascending' }))
    expect(calls.sortSelection).toHaveBeenCalledWith('asc')
    fireEvent.click(screen.getByRole('button', { name: 'Sort descending' }))
    expect(calls.sortSelection).toHaveBeenCalledWith('desc')
  })

  it('de-duplicates the range', () => {
    render(<SpreadsheetToolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove duplicate rows' }))
    expect(calls.removeDuplicates).toHaveBeenCalled()
  })

  it('steps the decimals of the active cell, and says where it is', () => {
    session = makeSession({ style: { dec: 3 } })
    render(<SpreadsheetToolbar />)
    const up = screen.getByRole('button', { name: 'Increase decimals' })
    expect(up).toHaveAttribute('title', 'Increase decimals — 3 decimal places now')
    fireEvent.click(up)
    expect(calls.applyStyle).toHaveBeenCalledWith({ dec: 4 })
    fireEvent.click(screen.getByRole('button', { name: 'Decrease decimals' }))
    expect(calls.applyStyle).toHaveBeenCalledWith({ dec: 2 })
  })

  it('applies a cell-style preset', () => {
    render(<SpreadsheetToolbar />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Cell style' }), {
      target: { value: 'good' },
    })
    expect(calls.applyStyle).toHaveBeenCalledWith({ color: '#0f6d31', bg: '#c6efce' })
  })

  it('offers every number format, date and time included', () => {
    render(<SpreadsheetToolbar />)
    for (const name of ['General', 'Currency €', 'Date', 'Time', 'Date-time']) {
      expect(screen.getByRole('option', { name })).toBeInTheDocument()
    }
  })

  it('opens find & replace as a disclosure and replaces through the session', () => {
    render(<SpreadsheetToolbar />)
    const trigger = screen.getByRole('button', { name: 'Find & replace' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: 'Find & replace' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Find'), { target: { value: 'a' } })
    fireEvent.change(screen.getByLabelText('Replace with'), { target: { value: 'b' } })
    fireEvent.click(screen.getByRole('button', { name: 'Replace all' }))
    expect(calls.findReplace).toHaveBeenCalledWith('a', 'b', { matchCase: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes find & replace on Escape and hands focus back', async () => {
    render(<SpreadsheetToolbar />)
    const trigger = screen.getByRole('button', { name: 'Find & replace' })
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
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
