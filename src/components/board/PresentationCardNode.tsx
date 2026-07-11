import { useEffect, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { BoardNode } from '@/types/model'
import { useStore } from '@/store/useStore'
import { storage } from '@/lib/storage/StorageProvider'
import {
  normalizePresentBody,
  type PresentationBody,
} from '@/lib/present/presentModel'
import { SlideView } from '@/components/present/SlideView'
import { IcChevronLeft, IcChevronRight, IcPresentation } from '@/components/Icons'
import { CardChrome } from './CardChrome'

/**
 * Presentation board card (Phase 8 board integration).
 *  - compact:  title + snippet + slide count (double-click → workspace)
 *  - expanded: read-only slide thumbnail with a slide navigator
 * Full mode is the presentation workspace itself (openPresent).
 *
 * The deck body is lazy-loaded from storage only when the card is
 * expanded, mirroring how the spreadsheet card defers its grid — a
 * compact deck card costs nothing beyond its digested metadata.
 */
export function PresentationCardNode({ data, selected }: NodeProps<BoardNode>) {
  const meta = useStore((s) => (data.presentId ? s.presentDocs[data.presentId] : undefined))
  const openPresent = useStore((s) => s.openPresent)
  const mode = data.mode ?? 'compact'

  if (!meta) {
    return (
      <CardChrome
        data={data}
        selected={selected}
        icon={<IcPresentation size={13} />}
        title="Missing presentation"
        minWidth={200}
        minHeight={110}
      >
        <div className="placeholder">This presentation was deleted</div>
      </CardChrome>
    )
  }

  return (
    <CardChrome
      data={data}
      selected={selected}
      icon={<IcPresentation size={13} />}
      title={meta.title}
      minWidth={240}
      minHeight={150}
    >
      {mode === 'compact' ? (
        <div
          className="flex h-full cursor-default flex-col px-3 py-2"
          onDoubleClick={() => openPresent(meta.id)}
          title="Double-click to open in the presentation workspace"
        >
          <p className="min-h-0 flex-1 overflow-hidden text-[12px] leading-relaxed text-muted">
            {meta.snippet || 'Empty deck — double-click to edit slides'}
          </p>
          <div className="flex flex-none items-center gap-2 pt-1.5 text-[10.5px] text-muted">
            <span>
              {meta.slideCount} slide{meta.slideCount === 1 ? '' : 's'}
            </span>
            <span>·</span>
            <span>edited {new Date(meta.updatedAt).toLocaleDateString()}</span>
            {meta.sourceAssetId && (
              <>
                <span>·</span>
                <span>imported</span>
              </>
            )}
          </div>
        </div>
      ) : (
        <ExpandedDeck presentId={meta.id} onOpen={() => openPresent(meta.id)} />
      )}
    </CardChrome>
  )
}

/**
 * Expanded card body: a live, read-only slide thumbnail plus a compact
 * slide navigator. Re-reads the body when the deck's updatedAt changes so
 * edits made in the workspace (or by a collaborator) reflect on the card.
 */
function ExpandedDeck({ presentId, onOpen }: { presentId: string; onOpen: () => void }) {
  const updatedAt = useStore((s) => s.presentDocs[presentId]?.updatedAt)
  const [body, setBody] = useState<PresentationBody | null>(null)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    let alive = true
    void storage
      .getDocument(presentId)
      .then((raw) => alive && setBody(normalizePresentBody(raw)))
      .catch(() => alive && setBody(normalizePresentBody(undefined)))
    return () => {
      alive = false
    }
  }, [presentId, updatedAt])

  if (!body) {
    return (
      <div className="nodrag flex h-full items-center justify-center" onDoubleClick={onOpen}>
        <span className="placeholder">Loading slides…</span>
      </div>
    )
  }

  const count = body.slides.length
  const safeIndex = Math.min(index, count - 1)
  const slide = body.slides[safeIndex]

  return (
    <div
      className="nodrag flex h-full flex-col"
      onDoubleClick={onOpen}
      title="Read-only preview — double-click to open the workspace"
    >
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-panel2 p-2">
        <div className="max-h-full overflow-hidden rounded shadow-sm ring-1 ring-bord">
          <SlideView slide={slide} theme={body.theme} width={248} />
        </div>
      </div>
      <div className="flex flex-none items-center justify-between border-t border-bord px-2 py-1">
        <button
          className="icon-btn h-5 w-5"
          title="Previous slide"
          aria-label="Previous slide"
          disabled={safeIndex === 0}
          onClick={(e) => {
            e.stopPropagation()
            setIndex((i) => Math.max(0, Math.min(i, count - 1) - 1))
          }}
        >
          <IcChevronLeft size={13} />
        </button>
        <span className="text-[10.5px] text-muted">
          Slide {safeIndex + 1} / {count}
        </span>
        <button
          className="icon-btn h-5 w-5"
          title="Next slide"
          aria-label="Next slide"
          disabled={safeIndex >= count - 1}
          onClick={(e) => {
            e.stopPropagation()
            setIndex((i) => Math.min(count - 1, i + 1))
          }}
        >
          <IcChevronRight size={13} />
        </button>
      </div>
    </div>
  )
}
