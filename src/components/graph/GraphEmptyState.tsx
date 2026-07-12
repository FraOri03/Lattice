import { useStore } from '@/store/useStore'
import { IcBoard, IcGraph, IcNote, IcPlus, IcRefresh } from '@/components/Icons'

export type EmptyReason = 'no-entities' | 'all-filtered' | 'single-entity'

const COPY: Record<EmptyReason, { headline: string; hint: string }> = {
  'no-entities': {
    headline: 'Nothing to graph yet',
    hint: 'The graph draws itself from your project. Create notes and documents, link them with [[wikilinks]], or arrange cards on a board — relationships appear here automatically.',
  },
  'all-filtered': {
    headline: 'Everything is filtered out',
    hint: 'The current filters hide every node. Reset the filters or re-enable some entity and relationship types to see the graph.',
  },
  'single-entity': {
    headline: 'Only one entity, no links',
    hint: 'This project has a single entity and no relationships yet. Link it to another note or document with a [[wikilink]] to grow the graph.',
  },
}

/** Explains WHY the canvas is empty and offers a way forward — never a blank
 * dark canvas. */
export function GraphEmptyState({
  reason,
  onResetFilters,
}: {
  reason: EmptyReason
  onResetFilters: () => void
}) {
  const openNote = useStore((s) => s.openNote)
  const createNote = useStore((s) => s.createNote)
  const setViewMode = useStore((s) => s.setViewMode)
  const copy = COPY[reason]

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg px-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-bord bg-panel text-muted">
        <IcGraph size={26} />
      </span>
      <p className="text-[14px] font-semibold">{copy.headline}</p>
      <p className="max-w-md text-[12px] leading-relaxed text-muted">{copy.hint}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {reason === 'all-filtered' ? (
          <button className="btn" onClick={onResetFilters}>
            <IcRefresh size={13} /> Reset filters
          </button>
        ) : (
          <>
            <button className="btn" onClick={() => openNote(createNote())}>
              <IcNote size={13} /> New note
            </button>
            <button className="btn" onClick={() => setViewMode('board')}>
              <IcBoard size={13} /> Open Board
            </button>
          </>
        )}
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-[10.5px] text-muted">
        <IcPlus size={11} /> Tip: the Graph shows real relationships — it never invents links.
      </p>
    </div>
  )
}
