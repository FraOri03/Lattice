import {
  SYNC_LABEL,
  linkedItems,
  planUpdates,
  summarizeLinks,
  type LinkedItem,
  type SourceState,
} from '@/lib/present/linked'
import type { PresentationBody } from '@/lib/present/presentModel'
import { IcExternal, IcLink } from '@/components/Icons'

/**
 * Deck-wide linked content (19E.4).
 *
 * The panel exists to answer one question honestly: what does this deck hold
 * that lives somewhere else, and is any of it stale? "Update all" names the
 * slides it would rewrite **before** it rewrites them, because a button that
 * silently edits several slides is the one thing a deck cannot afford.
 */

const STATE_COLOR: Record<LinkedItem['state'], string> = {
  copy: 'var(--muted)',
  'in-sync': '#14ae5c',
  'update-available': '#ffa629',
  missing: '#f24822',
}

export function LinkedContentPanel({
  body,
  sources,
  readOnly,
  onGoTo,
  onUpdateOne,
  onUpdateAll,
  onDetach,
  onOpenSource,
}: {
  body: PresentationBody
  sources: ReadonlyMap<string, SourceState>
  readOnly: boolean
  onGoTo: (slideIndex: number, elementId: string) => void
  onUpdateOne: (item: LinkedItem) => void
  onUpdateAll: () => void
  onDetach: (item: LinkedItem) => void
  onOpenSource: (item: LinkedItem) => void
}) {
  const items = linkedItems(body, sources)
  const counts = summarizeLinks(items)
  const plan = planUpdates(body, sources)

  if (items.length === 0) {
    return (
      <>
        <div className="insp-h">Linked content</div>
        <p className="text-[10.5px] leading-relaxed text-muted">
          Nothing in this deck comes from elsewhere. Insert a chart from a sheet
          and it will be listed here, with whether it is still current.
        </p>
      </>
    )
  }

  return (
    <>
      <div className="insp-h">
        Linked content · {items.length} {items.length === 1 ? 'object' : 'objects'}
      </div>

      {plan.items.length > 0 ? (
        <>
          <p className="text-[10.5px] leading-relaxed text-muted">
            {plan.items.length} {plan.items.length === 1 ? 'object has' : 'objects have'} newer
            sources. Updating rewrites {plan.slideNumbers.length === 1 ? 'slide' : 'slides'}{' '}
            {plan.slideNumbers.join(', ')}.
          </p>
          {!readOnly && (
            <button className="btn mt-1 w-full !border-accent !text-accent" onClick={onUpdateAll}>
              Update all
            </button>
          )}
        </>
      ) : (
        <p className="text-[10.5px] text-muted">
          {counts['in-sync'] > 0 && `${counts['in-sync']} in sync. `}
          {counts.copy > 0 && `${counts.copy} held as a copy. `}
          {counts.missing > 0 && `${counts.missing} with a missing source.`}
        </p>
      )}

      <div className="mt-1.5 flex flex-col gap-1">
        {items.map((item) => (
          <div key={item.elementId} className="rounded-lg border border-bord p-1.5">
            <div className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 flex-none rounded-full"
                style={{ background: STATE_COLOR[item.state] }}
                aria-hidden
              />
              <button
                className="min-w-0 flex-1 truncate text-left text-[11px] text-ink"
                title={`Go to slide ${item.slideIndex + 1}`}
                onClick={() => onGoTo(item.slideIndex, item.elementId)}
              >
                {item.label}
              </button>
              <span className="flex-none text-[9.5px] text-muted">
                slide {item.slideIndex + 1}
              </span>
            </div>

            <div className="mt-0.5 pl-3 text-[10px] text-muted">
              {item.link.kind}
              {item.link.ref ? ` · ${item.link.ref}` : ''} — {SYNC_LABEL[item.state]}
              {item.state === 'update-available' && item.sourceRev !== undefined && (
                <> · rev {item.link.rev} → {item.sourceRev}</>
              )}
            </div>

            {!readOnly && (
              <div className="mt-1 flex flex-wrap gap-1 pl-3">
                {item.state === 'update-available' && (
                  <button
                    className="toolbar-control toolbar-control--sm text-[10px]"
                    onClick={() => onUpdateOne(item)}
                    aria-label={`Update ${item.label}`}
                  >
                    <span aria-hidden>Update</span>
                  </button>
                )}
                {item.state !== 'copy' && (
                  <button
                    className="toolbar-control toolbar-control--sm text-[10px]"
                    title="Keep the content, drop the tie"
                    onClick={() => onDetach(item)}
                    aria-label={`Detach ${item.label}`}
                  >
                    <span aria-hidden>Detach</span>
                  </button>
                )}
                {item.state !== 'missing' && (
                  <button
                    className="toolbar-control toolbar-control--sm text-[10px]"
                    onClick={() => onOpenSource(item)}
                    aria-label={`Open source of ${item.label}`}
                  >
                    <IcExternal size={10} />
                  </button>
                )}
              </div>
            )}

            {item.state === 'missing' && (
              <p className="mt-1 pl-3 text-[10px] leading-relaxed text-muted">
                The source is gone. Detaching keeps what is on the slide — nothing
                is deleted because a link broke.
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="mt-2 flex items-start gap-1 text-[10.5px] leading-relaxed text-muted">
        <IcLink size={11} className="mt-0.5 flex-none" />
        Nothing updates on its own. Presenting never changes a slide underneath
        you — refreshing is always something you do here.
      </p>
    </>
  )
}
