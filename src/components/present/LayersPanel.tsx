import type { PresentElement } from '@/lib/present/presentModel'
import { IcChevronRight, IcEye, IcLayers, IcLock, IcUnlock } from '@/components/Icons'

/**
 * The layers column (19E.1).
 *
 * Until now this list lived inside the inspector's "nothing selected" branch,
 * which meant it was unavailable in exactly the situation it is for: something
 * is selected and you need to know what is on top of what. It is its own
 * collapsible column now, beside the rail, and it stays put while you work.
 */

export function layerLabel(el: PresentElement): string {
  if (el.kind === 'text') return el.text.trim().split('\n')[0].slice(0, 28) || 'Text'
  if (el.kind === 'image') return el.alt?.trim() || 'Image'
  return el.shape[0].toUpperCase() + el.shape.slice(1)
}

export function LayersPanel({
  elements,
  inherited = [],
  selectedIds,
  collapsed,
  readOnly,
  onToggleCollapsed,
  onSelect,
  onToggleFlag,
}: {
  elements: PresentElement[]
  /** master furniture: listed, never editable from here (19E.2) */
  inherited?: PresentElement[]
  selectedIds: Set<string>
  collapsed: boolean
  readOnly: boolean
  onToggleCollapsed: () => void
  onSelect: (id: string, additive: boolean) => void
  onToggleFlag: (id: string, flag: 'locked' | 'hidden') => void
}) {
  if (collapsed) {
    return (
      <aside className="flex w-8 flex-none flex-col items-center border-r border-bord py-2">
        <button
          className="icon-btn"
          title="Show layers"
          aria-label="Show layers"
          aria-expanded={false}
          onClick={onToggleCollapsed}
        >
          <IcLayers size={14} />
        </button>
      </aside>
    )
  }

  // top of the stack first: the list reads the way the slide looks
  const stack = [...elements].sort((a, b) => b.z - a.z)

  return (
    <aside className="flex w-44 flex-none flex-col border-r border-bord" aria-label="Layers">
      <div className="flex flex-none items-center gap-1 border-b border-bord px-2 py-1">
        <IcLayers size={12} />
        <span className="flex-1 text-[11px] font-semibold">Layers</span>
        <span className="text-[9.5px] text-muted">{elements.length}</span>
        <button
          className="icon-btn h-5 w-5"
          title="Hide layers"
          aria-label="Hide layers"
          aria-expanded
          onClick={onToggleCollapsed}
        >
          <IcChevronRight size={11} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {stack.length === 0 ? (
          <p className="px-1 py-2 text-[11px] leading-relaxed text-muted">
            Empty slide. Add a text box, image or shape from the toolbar.
          </p>
        ) : (
          stack.map((el) => (
            <div
              key={el.id}
              className={`flex items-center gap-1 rounded px-1 py-0.5 ${
                selectedIds.has(el.id) ? 'bg-accent-soft' : 'hover:bg-panel2'
              }`}
            >
              <button
                className="min-w-0 flex-1 truncate text-left text-[11px] text-ink"
                title={el.locked ? `${layerLabel(el)} — locked` : layerLabel(el)}
                aria-pressed={selectedIds.has(el.id)}
                onClick={(e) => onSelect(el.id, e.shiftKey || e.metaKey || e.ctrlKey)}
              >
                {layerLabel(el)}
              </button>
              {!readOnly && (
                <>
                  <button
                    className="icon-btn h-5 w-5"
                    title={el.hidden ? 'Show' : 'Hide'}
                    aria-label={el.hidden ? `Show ${layerLabel(el)}` : `Hide ${layerLabel(el)}`}
                    aria-pressed={!el.hidden}
                    onClick={() => onToggleFlag(el.id, 'hidden')}
                  >
                    <IcEye size={12} style={{ opacity: el.hidden ? 0.4 : 1 }} />
                  </button>
                  <button
                    className="icon-btn h-5 w-5"
                    title={el.locked ? 'Unlock' : 'Lock'}
                    aria-label={el.locked ? `Unlock ${layerLabel(el)}` : `Lock ${layerLabel(el)}`}
                    aria-pressed={el.locked === true}
                    onClick={() => onToggleFlag(el.id, 'locked')}
                  >
                    {el.locked ? <IcLock size={12} /> : <IcUnlock size={12} style={{ opacity: 0.55 }} />}
                  </button>
                </>
              )}
            </div>
          ))
        )}

        {/* 19E.2: furniture belongs to the master, so it is listed for
            orientation and offered no controls — it cannot be selected,
            hidden or locked from a slide. */}
        {inherited.length > 0 && (
          <>
            <div className="mt-2 border-t border-bord px-1 pt-1.5 text-[9.5px] tracking-wide text-muted uppercase">
              From master
            </div>
            {inherited.map((el) => (
              <div
                key={el.id}
                className="flex items-center gap-1 rounded px-1 py-0.5 opacity-70"
                title="Inherited from this slide’s master — edit it in the Deck panel"
              >
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
                  {layerLabel(el)}
                </span>
                <IcLock size={11} className="flex-none text-muted" />
              </div>
            ))}
          </>
        )}
      </div>
    </aside>
  )
}
