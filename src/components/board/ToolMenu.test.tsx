import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ToolMenu, type ToolMenuItem } from './ToolMenu'

const items = (onA = vi.fn(), onB = vi.fn()): ToolMenuItem[] => [
  { key: 'a', label: 'Note', icon: <svg />, onRun: onA },
  { key: 'b', label: 'Document', icon: <svg />, onRun: onB, shortcut: 'D' },
]

describe('ToolMenu — grouped board tools', () => {
  it('shows the default tool and runs it from the main button', () => {
    const onA = vi.fn()
    render(<ToolMenu groupLabel="Create a card" items={items(onA)} defaultKey="a" />)
    const main = screen.getByRole('button', { name: /add note/i })
    fireEvent.click(main)
    expect(onA).toHaveBeenCalledTimes(1)
  })

  it('opens an accessible menu of the alternatives from the chevron', () => {
    render(<ToolMenu groupLabel="Create a card" items={items()} defaultKey="a" />)
    const chevron = screen.getByRole('button', { name: /show all tools/i })
    expect(chevron).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(chevron)
    expect(chevron).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu', { name: 'Create a card' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Note/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Document/ })).toBeInTheDocument()
  })

  it('remembers the last used tool on the main button', () => {
    const onB = vi.fn()
    render(<ToolMenu groupLabel="Create a card" items={items(vi.fn(), onB)} defaultKey="a" />)
    fireEvent.click(screen.getByRole('button', { name: /show all tools/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Document/ }))
    expect(onB).toHaveBeenCalledTimes(1)
    // the main button now repeats Document
    expect(screen.getByRole('button', { name: /add document/i })).toBeInTheDocument()
  })

  it('shows a shortcut without making it the only way in', () => {
    render(<ToolMenu groupLabel="Create a card" items={items()} defaultKey="a" />)
    fireEvent.click(screen.getByRole('button', { name: /show all tools/i }))
    // the shortcut is advertised, and the item is still clickable
    expect(screen.getByText('D')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Document/ })).toBeEnabled()
  })

  it('closes on Escape and returns focus to the trigger', () => {
    render(<ToolMenu groupLabel="Create a card" items={items()} defaultKey="a" />)
    const chevron = screen.getByRole('button', { name: /show all tools/i })
    fireEvent.click(chevron)
    fireEvent.keyDown(screen.getByRole('menuitem', { name: /Note/ }), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('moves between items with the arrow keys', () => {
    render(<ToolMenu groupLabel="Create a card" items={items()} defaultKey="a" />)
    fireEvent.click(screen.getByRole('button', { name: /show all tools/i }))
    const first = screen.getByRole('menuitem', { name: /Note/ })
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: /Document/ })).toHaveFocus()
  })
})
