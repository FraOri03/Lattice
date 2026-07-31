import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import {
  ToolbarAction,
  ToolbarGroup,
  ToolbarOverflow,
  ToolbarRoot,
  ToolbarSeparator,
  ToolbarSplitButton,
  ToolbarToggle,
} from './Toolbar'

/**
 * The behaviour every mode's toolbar inherits (Phase 11.1.2a/b). These lock
 * the four things the audit found each family doing differently: the toolbar
 * role and name, the keyboard model, how pressed state is exposed, and the
 * split button's two targets.
 */

const icon = <svg data-testid="icon" />

function Sample({ commentDisabled = false }: { commentDisabled?: boolean }) {
  return (
    <ToolbarRoot label="Board tools" size="md">
      <ToolbarGroup label="Create">
        <ToolbarAction icon={icon} label="Section" onRun={() => {}} />
        <ToolbarSplitButton
          menuLabel="Open card tools"
          items={[
            { id: 'note', label: 'Note', icon, run: () => {} },
            { id: 'doc', label: 'Document', icon, run: () => {} },
          ]}
        />
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarGroup label="Annotate">
        <ToolbarToggle
          icon={icon}
          label="Comment"
          pressed={false}
          disabled={commentDisabled}
          disabledReason="Your role cannot comment"
          onRun={() => {}}
        />
      </ToolbarGroup>
    </ToolbarRoot>
  )
}

const controls = () =>
  [...document.querySelectorAll<HTMLElement>('[data-toolbar-control]')]

describe('ToolbarRoot', () => {
  it('is a named toolbar with a declared orientation', () => {
    render(<Sample />)
    const bar = screen.getByRole('toolbar', { name: 'Board tools' })
    expect(bar).toHaveAttribute('aria-orientation', 'horizontal')
  })

  it('is ONE tab stop: exactly one control is tabbable', () => {
    render(<Sample />)
    const tabbable = controls().filter((c) => c.tabIndex === 0)
    expect(controls().length).toBeGreaterThan(1)
    expect(tabbable).toHaveLength(1)
  })

  it('moves focus with the arrows and wraps at both ends', () => {
    render(<Sample />)
    const bar = screen.getByRole('toolbar')
    const [first, second] = controls()
    first.focus()
    fireEvent.keyDown(bar, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(second)
    // wrap backwards from the first control to the last
    first.focus()
    fireEvent.keyDown(bar, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(controls().at(-1))
  })

  it('jumps to the ends with Home and End', () => {
    render(<Sample />)
    const bar = screen.getByRole('toolbar')
    controls()[1].focus()
    fireEvent.keyDown(bar, { key: 'End' })
    expect(document.activeElement).toBe(controls().at(-1))
    fireEvent.keyDown(bar, { key: 'Home' })
    expect(document.activeElement).toBe(controls()[0])
  })

  it('skips disabled controls', () => {
    render(<Sample commentDisabled />)
    const bar = screen.getByRole('toolbar')
    const disabled = screen.getByRole('button', { name: 'Comment' })
    expect(disabled).toBeDisabled()
    controls()[0].focus()
    fireEvent.keyDown(bar, { key: 'End' })
    expect(document.activeElement).not.toBe(disabled)
  })

  it('keeps the focused control as the tab stop', () => {
    render(<Sample />)
    const second = controls()[1]
    fireEvent.focus(second)
    expect(second.tabIndex).toBe(0)
    expect(controls()[0].tabIndex).toBe(-1)
  })
})

describe('ToolbarAction', () => {
  it('names an icon-only control with aria-label', () => {
    render(
      <ToolbarRoot label="t">
        <ToolbarAction icon={icon} label="Add section" shortcut="S" onRun={() => {}} />
      </ToolbarRoot>,
    )
    const btn = screen.getByRole('button', { name: 'Add section' })
    expect(btn).toHaveAttribute('title', 'Add section (S)')
  })

  it('lets visible text be the accessible name when labelled', () => {
    render(
      <ToolbarRoot label="t" content="icon-label">
        <ToolbarAction icon={icon} label="Section" onRun={() => {}} />
      </ToolbarRoot>,
    )
    const btn = screen.getByRole('button', { name: 'Section' })
    expect(btn).not.toHaveAttribute('aria-label')
    expect(btn).toHaveTextContent('Section')
  })

  it('explains itself when disabled instead of going silent', () => {
    render(
      <ToolbarRoot label="t">
        <ToolbarAction
          icon={icon}
          label="Comment"
          disabled
          disabledReason="Your role cannot comment"
          onRun={() => {}}
        />
      </ToolbarRoot>,
    )
    expect(screen.getByRole('button', { name: 'Comment' })).toHaveAttribute(
      'title',
      'Your role cannot comment',
    )
  })

  it('runs on click', () => {
    const run = vi.fn()
    render(
      <ToolbarRoot label="t">
        <ToolbarAction icon={icon} label="Go" onRun={run} />
      </ToolbarRoot>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(run).toHaveBeenCalledOnce()
  })
})

describe('ToolbarToggle', () => {
  it('exposes state through aria-pressed, not colour alone', () => {
    const { rerender } = render(
      <ToolbarRoot label="t">
        <ToolbarToggle icon={icon} label="Comment" pressed={false} onRun={() => {}} />
      </ToolbarRoot>,
    )
    expect(screen.getByRole('button', { name: 'Comment' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    rerender(
      <ToolbarRoot label="t">
        <ToolbarToggle icon={icon} label="Comment" pressed onRun={() => {}} />
      </ToolbarRoot>,
    )
    expect(screen.getByRole('button', { name: 'Comment' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

describe('ToolbarSplitButton', () => {
  it('keeps two distinct targets, both in the roving order', () => {
    render(<Sample />)
    expect(screen.getByRole('button', { name: 'Note' })).toBeInTheDocument()
    const chevron = screen.getByRole('button', { name: 'Open card tools' })
    expect(chevron).toHaveAttribute('aria-haspopup', 'menu')
    expect(chevron).toHaveAttribute('aria-expanded', 'false')
    expect(chevron).toHaveAttribute('data-toolbar-control')
  })

  it('names the menu specifically, never just "More"', () => {
    render(<Sample />)
    expect(screen.queryByRole('button', { name: /^more$/i })).toBeNull()
  })

  it('opens the menu and runs an alternative, which becomes the primary', () => {
    const runDoc = vi.fn()
    render(
      <ToolbarRoot label="t">
        <ToolbarSplitButton
          menuLabel="Open card tools"
          items={[
            { id: 'note', label: 'Note', icon, run: () => {} },
            { id: 'doc', label: 'Document', icon, run: runDoc },
          ]}
        />
      </ToolbarRoot>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open card tools' }))
    const menu = screen.getByRole('menu', { name: 'Open card tools' })
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Document' }))
    expect(runDoc).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Document' })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('runs the default tool straight from the primary half', () => {
    const runNote = vi.fn()
    render(
      <ToolbarRoot label="t">
        <ToolbarSplitButton
          menuLabel="Open card tools"
          items={[
            { id: 'note', label: 'Note', description: 'Add note', icon, run: runNote },
            { id: 'doc', label: 'Document', icon, run: () => {} },
          ]}
          defaultItemId="note"
        />
      </ToolbarRoot>,
    )
    const primary = screen.getByRole('button', { name: 'Note' })
    expect(primary).toHaveAttribute('title', 'Add note')
    fireEvent.click(primary)
    expect(runNote).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('advertises a shortcut without making it the only way in', () => {
    const run = vi.fn()
    render(
      <ToolbarRoot label="t">
        <ToolbarSplitButton
          menuLabel="Open card tools"
          items={[
            { id: 'note', label: 'Note', icon, run: () => {} },
            { id: 'doc', label: 'Document', icon, shortcut: 'D', run },
          ]}
        />
      </ToolbarRoot>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open card tools' }))
    expect(screen.getByText('D')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /Document/ }))
    expect(run).toHaveBeenCalledOnce()
  })

  it('returns focus to the trigger after Escape', async () => {
    render(<Sample />)
    const chevron = screen.getByRole('button', { name: 'Open card tools' })
    fireEvent.click(chevron)
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Note' }), { key: 'Escape' })
    await new Promise(requestAnimationFrame)
    expect(document.activeElement).toBe(chevron)
  })

  it('closes on Escape without running anything', () => {
    const run = vi.fn()
    render(
      <ToolbarRoot label="t">
        <ToolbarSplitButton
          menuLabel="Open card tools"
          items={[{ id: 'note', label: 'Note', icon, run }]}
        />
      </ToolbarRoot>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open card tools' }))
    const item = screen.getByRole('menuitem', { name: 'Note' })
    fireEvent.keyDown(item, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(run).not.toHaveBeenCalled()
  })

  it('moves between menu items with the arrows', () => {
    render(
      <ToolbarRoot label="t">
        <ToolbarSplitButton
          menuLabel="Open card tools"
          items={[
            { id: 'a', label: 'Alpha', icon, run: () => {} },
            { id: 'b', label: 'Beta', icon, run: () => {} },
          ]}
        />
      </ToolbarRoot>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open card tools' }))
    const alpha = screen.getByRole('menuitem', { name: 'Alpha' })
    alpha.focus()
    fireEvent.keyDown(alpha, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Beta' }))
  })
})

describe('ToolbarOverflow', () => {
  it('renders nothing while everything fits', () => {
    const { container } = render(
      <ToolbarRoot label="t">
        <ToolbarOverflow label="More board tools" items={[]} />
      </ToolbarRoot>,
    )
    expect(container.querySelector('[aria-haspopup="menu"]')).toBeNull()
  })

  it('folds the tail into a named menu', () => {
    const run = vi.fn()
    render(
      <ToolbarRoot label="t">
        <ToolbarOverflow
          label="More board tools"
          items={[{ id: 'import', label: 'Import', run }]}
        />
      </ToolbarRoot>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'More board tools' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Import' }))
    expect(run).toHaveBeenCalledOnce()
  })
})
