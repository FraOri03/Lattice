import { useMemo, useState } from 'react'
import { useStore } from '@/store/useStore'
import { useI18n, useTimeAgo, useLocale } from '@/lib/i18n'
import { announce } from '@/lib/a11y/announcer'
import { formatBytes } from '@/lib/media'
import { collectTrash, trashedBytes, RETENTION_DAYS } from '@/lib/dashboard/trash'
import { sectionState } from '@/lib/dashboard/sectionState'
import { SectionStateBlock } from './SectionStateBlock'
import { KIND_ICON } from './ShelfRow'
import { IcAlert, IcClock, IcRestore, IcTrash } from '@/components/Icons'

/**
 * Trash (13.2 §5, 13.5 §3) — real, now that 15.6 gave it something to show.
 *
 * Until the soft-delete model landed this page presented as *unavailable*, and
 * the reason it gave was true: deleting was terminal, so there was no list and
 * nothing to restore. That sentence would now be a lie, which is why the page
 * changes in the same commit as the model.
 *
 * Two things it is careful about, both from the prototype's own copy:
 *
 * - **Space is not reclaimed until the purge.** The payload stays exactly where
 *   it was, which is what makes restore free — so the bytes are still occupied
 *   and the page says so rather than implying the deletion freed anything.
 * - **Lattice's trash is not Drive's.** Nothing here touches the Drive mirror;
 *   a purge does, because that is when `storage.deleteDocument` finally runs.
 *
 * Deliberately not built: the prototype's origin filter, its four sorts and its
 * bulk selection. #115 is the model, and those are page affordances that can
 * arrive when there is enough in a trash to need them.
 */
export function TrashDestination() {
  const t = useI18n()
  const timeAgo = useTimeAgo()
  const locale = useLocale()
  const [now] = useState(() => Date.now())
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  const projects = useStore((s) => s.projects)
  const workspaces = useStore((s) => s.workspaces)
  const notes = useStore((s) => s.notes)
  const docs = useStore((s) => s.docs)
  const sheetDocs = useStore((s) => s.sheetDocs)
  const presentDocs = useStore((s) => s.presentDocs)
  const codeDocs = useStore((s) => s.codeDocs)
  const assets = useStore((s) => s.assets)
  const boards = useStore((s) => s.boards)
  const restoreFromTrash = useStore((s) => s.restoreFromTrash)
  const purgeFromTrash = useStore((s) => s.purgeFromTrash)
  const emptyTrash = useStore((s) => s.emptyTrash)

  const items = useMemo(
    () =>
      collectTrash(
        { notes, docs, sheetDocs, presentDocs, codeDocs, assets, boards, projects },
        workspaces,
        now,
      ),
    [notes, docs, sheetDocs, presentDocs, codeDocs, assets, boards, projects, workspaces, now],
  )
  const state = sectionState({ total: items.length })
  const bytes = trashedBytes(items)

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-bold tracking-tight">{t.destinations.title.trash}</h1>
          <p className="mt-1 text-[11.5px] text-muted">
            {items.length === 0
              ? t.trash.nothingLine(RETENTION_DAYS)
              : t.trash.countLine(items.length, formatBytes(bytes) || '0 B')}
          </p>
        </div>
        {items.length > 0 && (
          <button
            className="btn text-[#f24822]"
            onClick={() => setConfirmEmpty(true)}
            disabled={confirmEmpty}
          >
            {t.trash.emptyTrash}
          </button>
        )}
      </div>

      <p className="mt-4 rounded-xl border border-bord bg-panel p-3 text-[11.5px] text-muted">
        {t.trash.retentionNote(RETENTION_DAYS)}
      </p>

      {confirmEmpty && (
        <div
          role="alertdialog"
          aria-label={t.trash.emptyTrash}
          className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#f2482288] bg-[#f2482219] p-3"
        >
          <span className="min-w-0 flex-1 text-[11.5px]">
            {t.trash.confirmEmpty(items.length, formatBytes(bytes) || '0 B')}
          </span>
          <button className="btn" onClick={() => setConfirmEmpty(false)}>
            {t.trash.keepThem}
          </button>
          <button
            className="btn text-[#f24822]"
            onClick={() => {
              const n = emptyTrash()
              announce(t.announcements.purgedAll(n))
              setConfirmEmpty(false)
            }}
          >
            {t.trash.deletePermanently}
          </button>
        </div>
      )}

      {state !== 'content' ? (
        <SectionStateBlock
          state={state}
          what={t.destinations.title.trash}
          title={t.trash.emptyTitle}
          body={t.trash.emptyBody(RETENTION_DAYS)}
        />
      ) : (
        <ul className="mt-4 flex flex-col gap-1.5">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind]
            const soon = item.daysLeft <= 0
            return (
              <li
                key={`${item.kind}:${item.id}`}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-bord bg-panel px-3 py-2"
              >
                <Icon size={14} className="flex-none text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 truncate text-[12.5px] font-medium">
                      {item.name}
                    </span>
                    {/* its project is in the trash too, so restore cannot put it
                        back where it came from — the row says so before you press */}
                    {item.orphaned && (
                      <span className="flex-none rounded-full border border-bord bg-panel2 px-1.5 text-[9px] font-bold text-muted">
                        {t.trash.parentDeleted}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[10.5px] text-muted">
                    {t.trash.rowMeta(
                      t.shelves.kind[item.kind],
                      item.location ?? t.shelves.noProject,
                      timeAgo(item.deletedAt),
                      item.deletedBy,
                    )}
                  </span>
                </span>

                {/* shape plus word, and red only once it is the last night */}
                <span
                  className={`flex flex-none items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                    soon
                      ? 'border-[#f2482255] bg-[#f248221f] text-[#f24822]'
                      : 'border-bord bg-panel2 text-muted'
                  }`}
                  title={t.trash.purgeOn(
                    new Date(item.purgeDate).toLocaleDateString(locale, {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }),
                  )}
                >
                  {soon ? <IcAlert size={10} aria-hidden /> : <IcClock size={10} aria-hidden />}
                  {soon ? t.trash.purgingTonight : t.trash.inDays(item.daysLeft)}
                </span>

                <button
                  className="btn flex-none"
                  onClick={() => {
                    restoreFromTrash(item.kind, item.id)
                    announce(
                      item.orphaned
                        ? t.announcements.restoredToTop(item.name)
                        : t.announcements.restored(item.name, item.location ?? ''),
                    )
                  }}
                  title={
                    item.orphaned
                      ? t.trash.restoreToTopWhy
                      : t.trash.restoreToWhy(item.location ?? '')
                  }
                >
                  <IcRestore size={11} /> {t.trash.restore}
                </button>
                <button
                  className="icon-btn h-6 w-6 flex-none"
                  onClick={() => {
                    purgeFromTrash(item.kind, item.id)
                    announce(t.announcements.purged(item.name))
                  }}
                  aria-label={t.trash.deleteForever(item.name)}
                >
                  <IcTrash size={12} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
