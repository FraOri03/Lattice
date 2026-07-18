import { useUiStore } from '@/store/useUiStore'
import { IcKeyboard, IcX } from '@/components/Icons'

/** Keyboard shortcuts reference (Phase 7) — opened with Ctrl+/ or from the palette. */

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Global',
    rows: [
      ['Ctrl K', 'Command palette'],
      ['Ctrl /', 'This shortcuts overview'],
      ['G G', 'Open Graph view'],
      ['Esc', 'Close dialogs and panels'],
    ],
  },
  {
    title: 'Graph',
    rows: [
      ['↑ / ↓', 'Move between nodes'],
      ['← / →', 'Traverse connected nodes'],
      ['Enter', 'Open node in its workspace'],
      ['Ctrl + Enter', 'Open beside graph (split)'],
      ['Space', 'Select / inspect node'],
      ['F', 'Fit graph to view'],
      ['+ / −', 'Zoom in / out'],
      ['Drag node', 'Reposition (pins the node)'],
    ],
  },
  {
    title: 'Board',
    rows: [
      ['Drag header', 'Move card'],
      ['Shift + drag', 'Box-select cards'],
      ['Delete / Backspace', 'Delete selection'],
      ['Ctrl/⌘ + D', 'Duplicate selection (reuses the same file)'],
      ['Double-click card', 'Open note/asset in editor'],
      ['Mouse wheel / pinch', 'Zoom canvas'],
      ['Paste URL', 'Create web embed card'],
    ],
  },
  {
    title: 'Editors',
    rows: [
      ['Ctrl F', 'Find in code (Monaco)'],
      ['Ctrl H', 'Replace in code'],
      ['/', 'Slash menu in documents'],
      ['[[', 'Wikilink to a note/doc'],
      ['@name', 'Mention a member in comments'],
    ],
  },
]

export function ShortcutsDialog() {
  const open = useUiStore((s) => s.shortcutsOpen)
  const setOpen = useUiStore((s) => s.setShortcutsOpen)
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div className="w-full max-w-md rounded-xl border border-bord bg-panel p-4 shadow-xl">
        <div className="mb-3 flex items-center gap-2">
          <IcKeyboard size={16} className="text-muted" />
          <span className="flex-1 text-[14px] font-bold">Keyboard shortcuts</span>
          <button className="icon-btn" aria-label="Close shortcuts" onClick={() => setOpen(false)}>
            <IcX size={14} />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {GROUPS.map((g) => (
            <div key={g.title} className="mb-3">
              <div className="insp-h !mt-0">{g.title}</div>
              {g.rows.map(([keys, what]) => (
                <div key={keys} className="flex items-center justify-between py-1 text-[12px]">
                  <span className="text-muted">{what}</span>
                  <kbd className="rounded-md border border-bord bg-panel2 px-1.5 py-0.5 font-mono text-[10.5px]">
                    {keys}
                  </kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
