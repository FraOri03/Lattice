import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useStore } from '@/store/useStore'
import { useWorkspaceLayoutStore } from '@/store/workspaceLayoutStore'
import { SectionSwitcher } from './SectionSwitcher'

describe('SectionSwitcher', () => {
  beforeEach(() => {
    useStore.setState({ viewMode: 'board' })
    useWorkspaceLayoutStore.setState({ split: false })
  })

  it('shows the current section and opens a menu of the real sections', () => {
    render(<SectionSwitcher />)
    const trigger = screen.getByRole('button', { name: /change section/i })
    expect(trigger).toHaveTextContent('Board')

    fireEvent.click(trigger)
    // all six real sections are offered…
    expect(screen.getByRole('menuitemradio', { name: /Board/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: /Document/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: /Spreadsheet/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: /Presentation/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: /Code/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: /Photo/ })).toBeInTheDocument()
    // …but never Split (a layout) or Graph (a view)
    expect(screen.queryByRole('menuitemradio', { name: /Split/ })).toBeNull()
    expect(screen.queryByRole('menuitemradio', { name: /Graph/ })).toBeNull()
  })

  it('switches the section and exits the split layout', () => {
    useWorkspaceLayoutStore.setState({ split: true })
    render(<SectionSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: /change section/i }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Spreadsheet/ }))

    expect(useStore.getState().viewMode).toBe('sheet')
    expect(useWorkspaceLayoutStore.getState().split).toBe(false)
  })

  it('marks the active section as checked', () => {
    useStore.setState({ viewMode: 'code' })
    render(<SectionSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: /change section/i }))
    expect(screen.getByRole('menuitemradio', { name: /Code/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('menuitemradio', { name: /Board/ })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })
})
