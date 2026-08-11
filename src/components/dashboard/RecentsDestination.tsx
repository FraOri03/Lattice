import { useMemo, useState } from 'react'
import { useStore, RECENTS_CAP } from '@/store/useStore'
import { useI18n, useTimeAgo, useLocale } from '@/lib/i18n'
import { resolveRecents } from '@/lib/recents/resolveRecents'
import { groupByDay, workspaceOfProject, type ShelfItem } from '@/lib/dashboard/shelves'
import { sectionState } from '@/lib/dashboard/sectionState'
import { announce } from '@/lib/a11y/announcer'
import { ShelfRow } from './ShelfRow'
import { SectionStateBlock } from './SectionStateBlock'
import { ALL_WORKSPACES, WorkspaceFilter, useWorkspaceFilter } from './WorkspaceFilter'

/**
 * Recents (13.1 · 13.5 §3) — the log, grouped by day.
 *
 * A shelf, so it spans every workspace and labels each row with the one it came
 * from; the filter narrows to one workspace rather than the surface doing it
 * silently.
 *
 * It says what it is. The log is written by the machine, kept on this device
 * and capped, and a page that hid that would invite people to treat it as a
 * library — which is the distinction 13.1 draws between this and Starred, and
 * the reason Starred is the one with the curation controls.
 *
 * Rows whose entity is gone are dropped rather than rendered dead:
 * `resolveRecents` already applies that rule, and this reuses it rather than
 * writing a second one.
 */
export function RecentsDestination() {
  const t = useI18n()
  const timeAgo = useTimeAgo()
  const locale = useLocale()
  const [now] = useState(() => Date.now())
  const filter = useWorkspaceFilter()

  const recents = useStore((s) => s.recents)
  const projects = useStore((s) => s.projects)
  const workspaces = useStore((s) => s.workspaces)
  const notes = useStore((s) => s.notes)
  const docs = useStore((s) => s.docs)
  const sheetDocs = useStore((s) => s.sheetDocs)
  const presentDocs = useStore((s) => s.presentDocs)
  const codeDocs = useStore((s) => s.codeDocs)
  const assets = useStore((s) => s.assets)
  const boards = useStore((s) => s.boards)

  const rows = useMemo(() => {
    const src = { notes, docs, sheetDocs, presentDocs, codeDocs, assets, boards, projects }
    return resolveRecents(recents, src).map((r) => {
      const ws = workspaceOfProject(r.projectId, workspaces)
      const item: ShelfItem = {
        kind: r.kind,
        id: r.id,
        title: r.title,
        projectId: r.projectId,
        projectName: r.projectName,
        workspaceId: ws?.id ?? null,
        workspaceName: ws?.name ?? null,
      }
      return { item, at: r.at }
    })
  }, [recents, notes, docs, sheetDocs, presentDocs, codeDocs, assets, boards, projects, workspaces])

  const visible = rows.filter((r) => filter.accepts(r.item.workspaceId))
  const days = useMemo(() => groupByDay(visible, now), [visible, now])
  // read synchronously from the local store, so never loading and never offline
  const state = sectionState({ total: rows.length, filtered: visible.length })

  const clearFilters = () => {
    filter.set(ALL_WORKSPACES)
    announce(t.announcements.filtersCleared(rows.length))
  }

  // the star lives on the entity, so a Recents row can show and set it too
  const starredOf = (item: ShelfItem): boolean => {
    if (item.kind === 'project') return !!projects[item.id]?.starred
    const maps = {
      note: notes,
      doc: docs,
      sheet: sheetDocs,
      present: presentDocs,
      code: codeDocs,
      asset: assets,
      board: boards,
    } as const
    return !!(maps[item.kind] as Record<string, { starred?: boolean }>)[item.id]?.starred
  }

  const dayLabel = (daysAgo: number, dayStart: number) =>
    daysAgo === 0
      ? t.shelves.today
      : daysAgo === 1
        ? t.shelves.yesterday
        : new Date(dayStart).toLocaleDateString(locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="text-[19px] font-bold tracking-tight">{t.destinations.title.recents}</h1>
      <p className="mt-1 text-[11.5px] text-muted">{t.destinations.description.recents}</p>

      {/* what this list is, stated rather than implied */}
      <p className="mt-4 rounded-xl border border-bord bg-panel p-3 text-[11.5px] text-muted">
        {t.shelves.recentsNote(RECENTS_CAP)}
      </p>

      <div className="mt-4">
        <WorkspaceFilter filter={filter} />
      </div>

      {state !== 'content' ? (
        <SectionStateBlock
          state={state}
          what={t.destinations.title.recents}
          title={t.shelves.recentsEmptyTitle}
          body={state === 'empty' ? t.shelves.recentsEmptyBody : t.shelves.noResultsBody}
          action={
            state === 'no-results'
              ? { label: t.states.noResultsAction, onClick: clearFilters }
              : undefined
          }
        />
      ) : (
        days.map((day) => (
          <section key={day.dayStart} aria-label={dayLabel(day.daysAgo, day.dayStart)} className="mt-5">
            <h2 className="mb-2 text-[9.5px] font-semibold tracking-widest text-muted uppercase">
              {dayLabel(day.daysAgo, day.dayStart)}
            </h2>
            <ul className="flex flex-col gap-1.5">
              {day.items.map(({ item, at }) => (
                <ShelfRow
                  key={`${item.kind}:${item.id}`}
                  item={item}
                  starred={starredOf(item)}
                  meta={t.shelves.rowMeta(
                    item.projectName ?? t.shelves.noProject,
                    item.workspaceName ?? t.shelves.noWorkspace,
                    timeAgo(at),
                  )}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
