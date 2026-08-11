import { useStore } from '@/store/useStore'
import { useCollabStore } from '@/lib/collab/collabStore'
import { useSyncStore } from '@/lib/sync/syncStore'
import { useI18n, useTimeAgo } from '@/lib/i18n'
import { announce } from '@/lib/a11y/announcer'
import { workspaceOfProject } from '@/lib/dashboard/shelves'
import { CARD_COLORS, type Project } from '@/types/model'
import { IcArchive, IcBoard, IcCloud, IcCloudOff, IcFile, IcStar } from '@/components/Icons'

/**
 * A project, in the two shapes 13.2 §4 specifies.
 *
 * One component rather than two, because the anatomy is the same list of facts
 * in a different order — and two components are how a card and a row end up
 * disagreeing about what a project is called or where the star lives.
 *
 * **The star is why this exists.** 15.2 gave every entity kind a `starred`
 * field, and projects stayed unstarrable outside `ProjectSwitcher` because the
 * old card was a single `<button>` and a nested star is invalid HTML. The card
 * is now a container with three separate controls in it, which is also what
 * 13.5 §4 asks for: the card, its star and its overflow are three tab stops,
 * and that verbosity is the price of not hiding actions from the keyboard.
 *
 * Deliberately absent: **author**. 13.2 lists it and `Project` has no field for
 * it — no `createdBy`, nothing. Rendering the current user there would be a
 * guess dressed as a fact, so the line is simply not drawn.
 */

/** The preview, until a thumbnail generator exists (13.2 §4). */
function KindPreview({ project }: { project: Project }) {
  const color = CARD_COLORS[project.color] ?? CARD_COLORS.blue
  return (
    <span
      aria-hidden
      className="relative block w-full overflow-hidden rounded-lg border border-bord"
      style={{ aspectRatio: '16 / 10', background: `${color}14` }}
    >
      {/* a board-ish placeholder built from the project's own colour: a kind
          hint, never a fake screenshot of content nobody rendered */}
      <span
        className="absolute rounded"
        style={{ left: '14%', top: '22%', width: '34%', height: '30%', background: `${color}55` }}
      />
      <span
        className="absolute rounded"
        style={{ left: '56%', top: '30%', width: '28%', height: '22%', background: `${color}33` }}
      />
      <span
        className="absolute rounded"
        style={{ left: '26%', top: '62%', width: '40%', height: '18%', background: `${color}22` }}
      />
    </span>
  )
}

export function ProjectCard({
  project,
  view,
  counts,
  badge,
}: {
  project: Project
  view: 'grid' | 'list'
  counts: { boards: number; files: number }
  badge?: 'starred' | 'archived' | 'recent'
}) {
  const t = useI18n()
  const timeAgo = useTimeAgo()
  const setActiveProject = useStore((s) => s.setActiveProject)
  const toggleStarred = useStore((s) => s.toggleStarred)
  const workspaces = useStore((s) => s.workspaces)
  const members = useCollabStore((s) => s.members[project.id])
  const provider = useSyncStore((s) => s.provider)

  const workspace = workspaceOfProject(project.id, workspaces)
  const synced = provider !== 'none'
  const SyncIcon = synced ? IcCloud : IcCloudOff

  const star = () => {
    toggleStarred('project', project.id)
    announce(
      project.starred
        ? t.announcements.unstarred(project.name)
        : t.announcements.starred(project.name),
    )
  }

  /** Star and overflow are always ≥24px and always in the same corner. */
  const starButton = (
    <button
      className="icon-btn h-6 w-6 flex-none"
      onClick={star}
      aria-pressed={!!project.starred}
      aria-label={
        project.starred ? t.cards.unstarLabel(project.name) : t.cards.starLabel(project.name)
      }
    >
      <IcStar size={13} className={project.starred ? 'text-[#ffcd29]' : 'text-muted'} />
    </button>
  )

  /** Shape plus word, never colour alone (13.5 §2.7). */
  const syncChip = (
    <span
      className="flex flex-none items-center gap-1 rounded-full border border-bord bg-panel2 px-2 py-0.5 text-[10px] text-muted"
      title={synced ? t.cards.syncDriveWhy : t.cards.syncLocalWhy}
    >
      <SyncIcon size={10} aria-hidden />
      {synced ? t.cards.syncDrive : t.cards.syncLocal}
    </span>
  )

  const open = () => setActiveProject(project.id)

  if (view === 'list') {
    return (
      <li className="flex items-center gap-2 rounded-xl border border-bord bg-panel px-3 py-2">
        <span
          aria-hidden
          className="h-[30px] w-11 flex-none rounded border border-bord"
          style={{ background: `${CARD_COLORS[project.color] ?? CARD_COLORS.blue}22` }}
        />
        <button
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
          onClick={open}
          aria-label={t.dashboard.openProject(project.name)}
        >
          <span className="flex-none text-[13px]" aria-hidden>
            {project.icon}
          </span>
          <span className="min-w-0 flex-1">
            {/* the name truncates; nothing else pushes it */}
            <span className="block min-w-[140px] truncate text-[12.5px] font-medium">
              {project.name}
            </span>
            <span className="block truncate text-[10.5px] text-muted">
              {workspace?.name ?? ''} · {t.dashboard.updated(timeAgo(project.updatedAt))}
            </span>
          </span>
        </button>
        {/* location and time drop before the name does, so the chip goes first */}
        <span className="hidden sm:flex">{syncChip}</span>
        {starButton}
      </li>
    )
  }

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-bord bg-panel p-3">
      <span className="relative block">
        <KindPreview project={project} />
        {/* badges sit OVER the preview, each in its fixed corner */}
        <span className="absolute top-1.5 left-1.5 flex gap-1">
          {project.starred && (
            <span className="rounded-full bg-bg/80 p-1" title={t.dashboard.starredBadge}>
              <IcStar size={11} className="text-[#ffcd29]" aria-hidden />
            </span>
          )}
          {badge === 'archived' && (
            <span className="rounded-full bg-bg/80 p-1" title={t.dashboard.archivedBadge}>
              <IcArchive size={11} className="text-muted" aria-hidden />
            </span>
          )}
        </span>
        <span className="absolute top-1.5 right-1.5">{syncChip}</span>
      </span>

      <span className="flex items-center gap-2">
        <span className="flex-none text-[14px]" aria-hidden>
          {project.icon}
        </span>
        {/* min-h-6: the title is a target like any other, and a line of 13px
            text is 20 tall — under the 24px floor 13.5 §6 sets. The spacing
            exception does not apply here: this is a card, not a dense row. */}
        <button
          className="flex min-h-6 min-w-0 flex-1 cursor-pointer items-center truncate text-left text-[13px] font-semibold"
          onClick={open}
          aria-label={t.dashboard.openProject(project.name)}
        >
          {project.name}
        </button>
        {starButton}
      </span>

      <span className="line-clamp-2 min-h-[2em] text-[11.5px] text-muted">
        {project.description || t.dashboard.noDescription}
      </span>

      <span className="flex items-center gap-1.5 text-[10.5px] text-muted">
        <IcBoard size={10} aria-hidden />
        {t.dashboard.boardCount(counts.boards)}
        <span aria-hidden>·</span>
        <IcFile size={10} aria-hidden />
        {t.dashboard.fileCount(counts.files)}
      </span>

      <span className="flex items-center gap-2 text-[10.5px] text-muted">
        <span className="min-w-0 flex-1 truncate">
          {workspace?.name ? `${workspace.name} · ` : ''}
          {t.dashboard.updated(timeAgo(project.updatedAt))}
        </span>
        {/* members, NOT presence: no room is attached on the dashboard, so
            these are the people with access rather than who is here now */}
        {members && members.length > 0 && (
          <span className="flex flex-none -space-x-1" title={t.cards.membersTitle(members.length)}>
            {members.slice(0, 3).map((m) => (
              <span
                key={m.userId}
                className="flex h-4 w-4 items-center justify-center rounded-full border border-panel bg-panel2 text-[8px] font-semibold"
              >
                {(m.name || m.email).slice(0, 1).toUpperCase()}
              </span>
            ))}
          </span>
        )}
      </span>
    </li>
  )
}
