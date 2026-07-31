import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Editor } from '@tiptap/core'
import { useStore } from '@/store/useStore'
import { DocumentToolbar } from './DocumentToolbar'

/**
 * The Document toolbar on the shared primitives (Phase 11.1.5a). These lock
 * what the migration had to preserve — every action, its state and its name —
 * plus the two things the audit found missing here: a named toolbar with one
 * tab stop, and localisation.
 *
 * Tiptap is stubbed: mounting a real editor needs ProseMirror's DOM
 * measurement, and none of it is what this file is testing.
 */

interface Stub {
  editor: Editor
  calls: string[]
}

function stubEditor({
  active = [] as string[],
  canUndo = true,
  canRedo = true,
}: { active?: string[]; canUndo?: boolean; canRedo?: boolean } = {}): Stub {
  const calls: string[] = []
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get:
        (_target, prop: string) =>
        (...args: unknown[]) => {
          calls.push(args.length ? `${prop}(${JSON.stringify(args[0])})` : prop)
          return prop === 'run' ? true : chain
        },
    },
  )
  const editor = {
    on: () => {},
    off: () => {},
    isActive: (name: string) => active.includes(name),
    getAttributes: () => ({}),
    can: () => ({ undo: () => canUndo, redo: () => canRedo }),
    chain: () => chain,
  }
  return { editor: editor as unknown as Editor, calls }
}

const renderToolbar = (stub: Stub, props: Partial<{ onImage: () => void; onAsset: () => void }> = {}) =>
  render(
    <DocumentToolbar
      editor={stub.editor}
      onImage={props.onImage ?? (() => {})}
      onAsset={props.onAsset ?? (() => {})}
    />,
  )

beforeEach(() => useStore.setState({ locale: 'en' }))
afterEach(() => useStore.setState({ locale: 'en' }))

describe('DocumentToolbar — structure', () => {
  it('is a named toolbar, not an anonymous strip', () => {
    renderToolbar(stubEditor())
    expect(screen.getByRole('toolbar', { name: 'Document formatting' })).toBeInTheDocument()
  })

  it('is ONE tab stop, the select included', () => {
    renderToolbar(stubEditor())
    const controls = [...document.querySelectorAll<HTMLElement>('[data-toolbar-control]')]
    expect(controls.filter((c) => c.tabIndex === 0)).toHaveLength(1)
    // the block-type select joins the roving order rather than sitting outside it
    expect(controls.some((c) => c.tagName === 'SELECT')).toBe(true)
  })

  it('names every control (the sheet-style "B with no label" gap)', () => {
    renderToolbar(stubEditor())
    const controls = [...document.querySelectorAll('[data-toolbar-control]')]
    expect(controls.length).toBeGreaterThan(10)
    for (const c of controls) {
      expect(c.getAttribute('aria-label')?.trim()).toBeTruthy()
    }
  })

  it('keeps every action the old toolbar had', () => {
    renderToolbar(stubEditor())
    for (const name of [
      'Undo',
      'Redo',
      'Block type',
      'Bold',
      'Italic',
      'Underline',
      'Strikethrough',
      'Inline code',
      'Link',
      'Bullet list',
      'Numbered list',
      'Checklist',
      'Quote',
      'Code block',
      'Callout',
      'Divider',
      'Insert table',
      'Insert image',
      'Embed asset',
    ]) {
      expect(screen.getByRole(name === 'Block type' ? 'combobox' : 'button', { name })).toBeInTheDocument()
    }
  })
})

describe('DocumentToolbar — state', () => {
  it('reflects the editor marks through aria-pressed', () => {
    renderToolbar(stubEditor({ active: ['bold', 'bulletList'] }))
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Italic' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: 'Bullet list' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('does not pretend inserting is a toggle', () => {
    renderToolbar(stubEditor({ active: ['table'] }))
    expect(screen.getByRole('button', { name: 'Insert table' })).not.toHaveAttribute(
      'aria-pressed',
    )
    expect(screen.getByRole('button', { name: 'Insert image' })).not.toHaveAttribute(
      'aria-pressed',
    )
  })

  it('disables undo/redo when the editor cannot, and still names them', () => {
    renderToolbar(stubEditor({ canUndo: false, canRedo: false }))
    const undo = screen.getByRole('button', { name: 'Undo' })
    expect(undo).toBeDisabled()
    expect(undo).toHaveAttribute('title', 'Undo (Ctrl+Z)')
  })

  it('shows the table controls only inside a table', () => {
    const { unmount } = renderToolbar(stubEditor())
    expect(screen.queryByRole('group', { name: 'Table' })).toBeNull()
    unmount()
    renderToolbar(stubEditor({ active: ['table'] }))
    expect(screen.getByRole('group', { name: 'Table' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add row below' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete table' })).toBeInTheDocument()
  })
})

describe('DocumentToolbar — commands', () => {
  it('runs the matching editor command', () => {
    const stub = stubEditor()
    renderToolbar(stub)
    fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
    expect(stub.calls).toContain('toggleBold')
    fireEvent.click(screen.getByRole('button', { name: 'Quote' }))
    expect(stub.calls).toContain('toggleBlockquote')
    fireEvent.click(screen.getByRole('button', { name: 'Divider' }))
    expect(stub.calls).toContain('setHorizontalRule')
  })

  it('switches block type through the select', () => {
    const stub = stubEditor()
    renderToolbar(stub)
    fireEvent.change(screen.getByRole('combobox', { name: 'Block type' }), {
      target: { value: 'h2' },
    })
    expect(stub.calls).toContain('setHeading({"level":2})')
  })

  it('hands image and asset insertion back to the editor pane', () => {
    const onImage = vi.fn()
    const onAsset = vi.fn()
    renderToolbar(stubEditor(), { onImage, onAsset })
    fireEvent.click(screen.getByRole('button', { name: 'Insert image' }))
    fireEvent.click(screen.getByRole('button', { name: 'Embed asset' }))
    expect(onImage).toHaveBeenCalledOnce()
    expect(onAsset).toHaveBeenCalledOnce()
  })
})

describe('DocumentToolbar — localisation', () => {
  it('switches every control to Italian', () => {
    useStore.setState({ locale: 'it' })
    renderToolbar(stubEditor({ active: ['table'] }))
    expect(screen.getByRole('toolbar', { name: 'Formattazione documento' })).toBeInTheDocument()
    for (const name of [
      'Annulla',
      'Grassetto',
      'Corsivo',
      'Elenco puntato',
      'Citazione',
      'Separatore',
      'Inserisci tabella',
      'Elimina tabella',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('combobox', { name: 'Tipo di blocco' })).toBeInTheDocument()
  })
})
