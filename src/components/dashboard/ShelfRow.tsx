import { useStore } from '@/store/useStore'
import { useI18n } from '@/lib/i18n'
import { announce } from '@/lib/a11y/announcer'
import { openRecent } from '@/lib/recents/resolveRecents'
import type { ShelfItem } from '@/lib/dashboard/shelves'
import type { StarKind } from '@/types/model'
import {
  IcBoard,
  IcCode,
  IcDoc,
  IcFile,
  IcFolder,
  IcNote,
  IcPresentation,
  IcStar,
  IcTable,
} from '@/components/Icons'

/**
 * One row on a shelf — the shape Recents and Starred share (13.2 §4).
 *
 * List-first rather than cards: both shelves are collections you scan for one
 * thing, and a row names its project and its workspace in the space a card
 * spends on a preview. The star and the row are two separate stops, because
 * hiding the unstar behind a menu would put it out of reach of the keyboard —
 * 13.5 §4 accepts the extra tab stop per row for exactly that reason.
 */

export const KIND_ICON = {
  project: IcFolder,
  note: IcNote,
  doc: IcDoc,
  sheet: IcTable,
  present: IcPresentation,
  code: IcCode,
  asset: IcFile,
  board: IcBoard,
} as const satisfies Record<StarKind, unknown>

/** Open anything a shelf can list. Projects move the surface; entities open. */
export function openShelfItem(item: ShelfItem): void {
  if (item.kind === 'project') {
    useStore.getState().setActiveProject(item.id)
    return
  }
  openRecent({
    kind: item.kind,
    id: item.id,
    at: 0,
    title: item.title,
    projectId: item.projectId,
    projectName: item.projectName,
  })
}

export function ShelfRow({
  item,
  starred,
  meta,
  selected,
  onSelectedChange,
}: {
  item: ShelfItem
  /** Whether the star is filled — Recents shows it too, so it can be set there. */
  starred: boolean
  /** The line under the title. Built by the caller: Recents adds a time. */
  meta: string
  /** Omit to render no checkbox — Recents has no bulk action. */
  selected?: boolean
  onSelectedChange?: (selected: boolean) => void
}) {
  const t = useI18n()
  const toggleStarred = useStore((s) => s.toggleStarred)
  const Icon = KIND_ICON[item.kind]

  const star = () => {
    toggleStarred(item.kind, item.id)
    // the shelf is the one surface where the result of starring is the row
    // leaving it, so the announcement is what confirms the action happened
    announce(
      starred
        ? t.announcements.unstarred(item.title)
        : t.announcements.starred(item.title),
    )
  }

  return (
    <li className="flex items-center gap-2 rounded-xl border border-bord bg-panel px-3 py-2">
      {onSelectedChange && (
        <label className="flex flex-none cursor-pointer items-center justify-center">
          <span className="sr-only">{t.cards.select(item.title)}</span>
          {/* 24px on the INPUT, not on the label: the target size WCAG 2.2
              SC 2.5.8 measures is the focusable element, so a 16px checkbox
              inside a 24px wrapper still fails. 13.5 §6 named this exact case
              as a known offender to fix rather than inherit. */}
          <input
            type="checkbox"
            className="h-6 w-6 cursor-pointer"
            checked={!!selected}
            onChange={(e) => onSelectedChange(e.target.checked)}
          />
        </label>
      )}

      <button
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
        onClick={() => openShelfItem(item)}
        aria-label={t.cards.openItem(item.title)}
      >
        <Icon size={14} className="flex-none text-muted" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium">{item.title}</span>
          <span className="block truncate text-[10.5px] text-muted">{meta}</span>
        </span>
      </button>

      <button
        className="icon-btn h-6 w-6 flex-none"
        onClick={star}
        aria-pressed={starred}
        aria-label={
          starred ? t.cards.unstarLabel(item.title) : t.cards.starLabel(item.title)
        }
      >
        <IcStar size={13} className={starred ? 'text-[#ffcd29]' : 'text-muted'} />
      </button>
    </li>
  )
}
