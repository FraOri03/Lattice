import { useStore } from '@/store/useStore'
import { useI18n } from '@/lib/i18n'
import { announce } from '@/lib/a11y/announcer'
import { IcBoard, IcSection } from '@/components/Icons'

/**
 * Grid or list, for the project sections (13.2 §3).
 *
 * Two buttons carrying `aria-pressed` rather than one that toggles, per
 * 13.5 §4: a single control has to describe both its current state and what it
 * would do, and one of the two always ends up wrong.
 *
 * What it governs is deliberately narrow — the project sections and nothing
 * else. The resume rail is a horizontal shortcut rather than a collection, the
 * workspace chips are chips, the stat tiles are tiles. A toggle that silently
 * governs half a page is why the prototype's reads as broken.
 */
export function ViewToggle() {
  const t = useI18n()
  const view = useStore((s) => s.dashboardView)
  const setView = useStore((s) => s.setDashboardView)

  const pick = (next: 'grid' | 'list') => {
    if (next === view) return
    setView(next)
    announce(next === 'grid' ? t.announcements.gridView : t.announcements.listView)
  }

  return (
    <div className="flex flex-none items-center gap-0.5 rounded-lg border border-bord p-0.5">
      <button
        className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded ${
          view === 'grid' ? 'bg-panel2 text-ink' : 'text-muted hover:text-ink'
        }`}
        aria-pressed={view === 'grid'}
        aria-label={t.cards.gridView}
        onClick={() => pick('grid')}
      >
        <IcBoard size={12} />
      </button>
      <button
        className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded ${
          view === 'list' ? 'bg-panel2 text-ink' : 'text-muted hover:text-ink'
        }`}
        aria-pressed={view === 'list'}
        aria-label={t.cards.listView}
        onClick={() => pick('list')}
      >
        <IcSection size={12} />
      </button>
    </div>
  )
}
