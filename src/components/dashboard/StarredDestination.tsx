import { useMemo, useState } from 'react'
import { useStore } from '@/store/useStore'
import { useI18n } from '@/lib/i18n'
import { announce } from '@/lib/a11y/announcer'
import { collectStarred } from '@/lib/dashboard/shelves'
import { ShelfRow } from './ShelfRow'
import { WorkspaceFilter, useWorkspaceFilter } from './WorkspaceFilter'

/**
 * Starred (13.1 · 13.5 §3) — the shelf you curate.
 *
 * The opposite of Recents, which is why it gets the controls Recents does not:
 * Recents reorders itself every time you open something and eventually evicts;
 * this never reshuffles and never evicts, so multi-select and bulk unstar are
 * worth their weight here and would be noise there.
 *
 * **Order never changes on its own** — `collectStarred` sorts by kind then
 * title, so nothing moves unless the user renames it. Sorting by "last opened"
 * would make the shelf behave like the log it exists to contrast with.
 *
 * It spans every workspace and labels each row, per 13.1's scoping rule.
 */
export function StarredDestination() {
  const t = useI18n()
  const filter = useWorkspaceFilter()
  const [selection, setSelection] = useState<string[]>([])
  const toggleStarred = useStore((s) => s.toggleStarred)

  const projects = useStore((s) => s.projects)
  const workspaces = useStore((s) => s.workspaces)
  const notes = useStore((s) => s.notes)
  const docs = useStore((s) => s.docs)
  const sheetDocs = useStore((s) => s.sheetDocs)
  const presentDocs = useStore((s) => s.presentDocs)
  const codeDocs = useStore((s) => s.codeDocs)
  const assets = useStore((s) => s.assets)
  const boards = useStore((s) => s.boards)

  const all = useMemo(
    () =>
      collectStarred(
        { notes, docs, sheetDocs, presentDocs, codeDocs, assets, boards, projects },
        workspaces,
      ),
    [notes, docs, sheetDocs, presentDocs, codeDocs, assets, boards, projects, workspaces],
  )

  const items = all.filter((i) => filter.accepts(i.workspaceId))
  const key = (kind: string, id: string) => `${kind}:${id}`
  const selected = items.filter((i) => selection.includes(key(i.kind, i.id)))

  const unstarSelected = () => {
    for (const item of selected) toggleStarred(item.kind, item.id)
    announce(t.announcements.bulkUnstarred(selected.length))
    setSelection([])
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="text-[19px] font-bold tracking-tight">{t.destinations.title.starred}</h1>
      <p className="mt-1 text-[11.5px] text-muted">{t.destinations.description.starred}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <WorkspaceFilter filter={filter} />
        {selected.length > 0 && (
          <>
            <span className="text-[11.5px] font-semibold">
              {t.shelves.selectedCount(selected.length)}
            </span>
            <button className="btn" onClick={unstarSelected}>
              {t.shelves.unstarSelected}
            </button>
          </>
        )}
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-bord p-8 text-center">
          <p className="mb-1 text-[13px] font-semibold">
            {all.length === 0 ? t.shelves.starredEmptyTitle : t.shelves.noResultsTitle}
          </p>
          <p className="text-[11.5px] text-muted">
            {all.length === 0 ? t.shelves.starredEmptyBody : t.shelves.noResultsBody}
          </p>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-1.5">
          {items.map((item) => {
            const k = key(item.kind, item.id)
            return (
              <ShelfRow
                key={k}
                item={item}
                starred
                meta={t.shelves.starredMeta(
                  t.shelves.kind[item.kind],
                  item.projectName,
                  item.workspaceName ?? t.shelves.noWorkspace,
                )}
                selected={selection.includes(k)}
                onSelectedChange={(on) =>
                  setSelection((s) => (on ? [...s, k] : s.filter((x) => x !== k)))
                }
              />
            )
          })}
        </ul>
      )}
    </div>
  )
}
