import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { useSyncStore } from '@/lib/sync/syncStore'
import { useOptionalAccount } from '@/lib/auth/AccountProvider'
import { formatBytes } from '@/lib/media'
import { useRecentProjects } from '@/lib/projects/ProjectStore'
import { groupProjects } from '@/lib/projects/ProjectRegistry'
import { openRecent, resolveRecents, type ResolvedRecent } from '@/lib/recents/resolveRecents'
import { useI18n, useTimeAgo } from '@/lib/i18n'
import { CARD_COLORS, type Project } from '@/types/model'
import {
  IcArchive,
  IcBoard,
  IcClock,
  IcCloud,
  IcCode,
  IcDoc,
  IcFile,
  IcFolder,
  IcNote,
  IcPlus,
  IcPresentation,
  IcSearch,
  IcStar,
  IcTable,
} from '@/components/Icons'

const RECENT_ICON = {
  note: IcNote,
  doc: IcDoc,
  sheet: IcTable,
  present: IcPresentation,
  code: IcCode,
  asset: IcFile,
  board: IcBoard,
} as const satisfies Record<ResolvedRecent['kind'], unknown>

/**
 * Home — the surface with no project open (Phase 11.2).
 *
 * It shows only what the store already knows: this workspace's projects,
 * grouped exactly as the switcher groups them, plus the projects you touched
 * last. Deliberately absent: "Shared with me", "Trash" and pending invites.
 * Each of those needs an index no single browser can hold, so they arrive
 * with the server in 13.4 rather than as an empty promise here.
 *
 * Recent ENTITIES (that note, that spreadsheet) are 11.2.3: `RecentEntry`
 * carries no project id, so off a project surface there is nothing to
 * resolve them against yet.
 */
export function Dashboard() {
  const t = useI18n().dashboard
  const timeAgo = useTimeAgo()
  const projects = useStore((s) => s.projects)
  const workspaces = useStore((s) => s.workspaces)
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId)
  const setActiveProject = useStore((s) => s.setActiveProject)
  const createProject = useStore((s) => s.createProject)
  const setProjectDialogOpen = useUiStore((s) => s.setProjectDialogOpen)
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
  const recent = useRecentProjects(6)
  // decoration only: Home renders with or without a signed-in identity
  const account = useOptionalAccount()
  const syncProvider = useSyncStore((s) => s.provider)
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt)
  const recents = useStore((s) => s.recents)
  const notes = useStore((s) => s.notes)
  const docs = useStore((s) => s.docs)
  const sheetDocs = useStore((s) => s.sheetDocs)
  const presentDocs = useStore((s) => s.presentDocs)
  const codeDocs = useStore((s) => s.codeDocs)
  const assets = useStore((s) => s.assets)
  const boards = useStore((s) => s.boards)

  // resolved in a memo, not in the selector: the selector would build a new
  // array on every store read and React would never see a stable snapshot.
  const recentFiles = useMemo(
    () =>
      resolveRecents(
        recents,
        { notes, docs, sheetDocs, presentDocs, codeDocs, assets, boards, projects },
        // Home shows every project's files, but only the ones it can name a
        // project for: opening one has to land the surface somewhere real.
        { attributedOnly: true, limit: 8 },
      ),
    [recents, notes, docs, sheetDocs, presentDocs, codeDocs, assets, boards, projects],
  )

  const workspace = workspaces[activeWorkspaceId]
  // the dashboard scopes to the active workspace, like the project switcher
  const wsProjects = workspace
    ? Object.values(projects).filter((p) => workspace.projectIds.includes(p.id))
    : Object.values(projects)
  const groups = groupProjects(wsProjects)

  /**
   * What each project holds, and what the workspace holds in total.
   *
   * Counted per project id and only for entities that carry one: the same
   * rule the recent-files list follows. An entity that predates project ids
   * is not silently attributed to whichever project you happen to be in —
   * it is left out of the count rather than counted somewhere wrong.
   */
  const tally = useMemo(() => {
    const perProject: Record<string, { boards: number; files: number }> = {}
    const bump = (projectId: string | undefined, key: 'boards' | 'files') => {
      if (!projectId) return
      perProject[projectId] ??= { boards: 0, files: 0 }
      perProject[projectId][key] += 1
    }
    for (const b of Object.values(boards)) bump(b.projectId, 'boards')
    const fileMaps: Record<string, { projectId?: string }>[] = [
      notes,
      docs,
      sheetDocs,
      presentDocs,
      codeDocs,
      assets,
    ]
    for (const map of fileMaps) for (const e of Object.values(map)) bump(e.projectId, 'files')
    return perProject
  }, [boards, notes, docs, sheetDocs, presentDocs, codeDocs, assets])

  const totals = useMemo(() => {
    const ids = new Set(wsProjects.map((p) => p.id))
    let boardCount = 0
    let fileCount = 0
    for (const [id, counts] of Object.entries(tally)) {
      if (!ids.has(id)) continue
      boardCount += counts.boards
      fileCount += counts.files
    }
    const bytes = Object.values(assets)
      .filter((a) => a.projectId && ids.has(a.projectId))
      .reduce((sum, a) => sum + (a.size ?? 0), 0)
    return { projects: wsProjects.length, boards: boardCount, files: fileCount, bytes }
  }, [wsProjects, tally, assets])

  // A project belongs to exactly one section, claimed in the order they are
  // rendered: Starred, then Recent, then the rest. The switcher can afford to
  // repeat a project in two lists because its rows are one line; cards are
  // not, and the same project twice on a Home screen reads as a bug.
  const recentOnly = recent.filter((p) => !p.starred)
  const recentIds = new Set(recentOnly.map((p) => p.id))
  const activeOnly = groups.active.filter((p) => !recentIds.has(p.id))

  // opening a project is what leaves the dashboard: setActiveProject moves
  // the surface, so nothing here has to know about navSurface.
  const open = (id: string) => setActiveProject(id)

  const firstName = account?.name?.trim().split(/\s+/)[0] ?? ''
  const syncLine =
    syncProvider === 'none'
      ? t.localOnly
      : lastSyncAt
        ? t.syncedAgo(timeAgo(lastSyncAt))
        : t.syncPending

  const card = (p: Project, badge?: 'starred' | 'archived' | 'recent') => {
    const color = CARD_COLORS[p.color] ?? CARD_COLORS.blue
    return (
      <button
        key={p.id}
        className="flex cursor-pointer flex-col gap-2 rounded-xl border border-bord bg-panel p-3 text-left hover:border-accent"
        onClick={() => open(p.id)}
        aria-label={t.openProject(p.name)}
      >
        <span className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 flex-none items-center justify-center rounded-md text-[14px]"
            style={{ background: `${color}22`, border: `1px solid ${color}55` }}
          >
            {p.icon}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{p.name}</span>
          {badge === 'starred' && (
            <IcStar size={12} className="flex-none text-[#ffcd29]" aria-hidden />
          )}
          {badge === 'archived' && (
            <IcArchive size={12} className="flex-none text-muted" aria-hidden />
          )}
          {badge === 'recent' && (
            <IcClock size={12} className="flex-none text-muted" aria-hidden />
          )}
        </span>
        <span className="line-clamp-2 min-h-[2em] text-[11.5px] text-muted">
          {p.description || t.noDescription}
        </span>
        {/* what is actually inside, so a card is a summary and not just a
            name — counted from the entities the project owns */}
        <span className="flex items-center gap-1.5 text-[10.5px] text-muted">
          <IcBoard size={10} aria-hidden />
          {t.boardCount(tally[p.id]?.boards ?? 0)}
          <span aria-hidden>·</span>
          <IcFile size={10} aria-hidden />
          {t.fileCount(tally[p.id]?.files ?? 0)}
        </span>
        <span className="text-[10.5px] text-muted">{t.updated(timeAgo(p.updatedAt))}</span>
      </button>
    )
  }

  const stat = (label: string, value: string, icon: ReactNode, index: number) => (
    <div
      className="anim-rise anim-stagger flex items-center gap-2.5 rounded-xl border border-bord bg-panel px-3.5 py-3"
      style={{ '--i': index } as CSSProperties}
    >
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-panel2 text-muted">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] leading-tight font-semibold">{value}</span>
        <span className="block truncate text-[10.5px] text-muted">{label}</span>
      </span>
    </div>
  )

  const section = (
    id: string,
    label: string,
    items: Project[],
    index: number,
    badge?: 'starred' | 'archived' | 'recent',
  ) =>
    items.length > 0 && (
      <section
        aria-labelledby={id}
        className="anim-rise anim-stagger mb-7"
        style={{ '--i': index } as CSSProperties}
      >
        <h2
          id={id}
          className="mb-2 text-[9.5px] font-semibold tracking-widest text-muted uppercase"
        >
          {label}
        </h2>
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {items.map((p) => card(p, badge))}
        </div>
      </section>
    )

  return (
    <main className="h-full w-full overflow-y-auto bg-bg">
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <header className="anim-rise mb-6 flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h1 className="text-[19px] font-bold tracking-tight">
              {t.greeting(firstName)}
            </h1>
            {/* where you are and whether your work is leaving this browser —
                the shell's top bar is not mounted on this surface, so Home
                has to answer both questions itself */}
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted">
              {workspace && <span>{t.inWorkspace(`${workspace.icon} ${workspace.name}`)}</span>}
              {workspace && <span aria-hidden>·</span>}
              <span>{syncLine}</span>
            </p>
          </div>
          <div className="flex-1" />
          <button className="btn" onClick={() => setPaletteOpen(true)} title={t.searchHint}>
            <IcSearch size={12} /> {t.search}
          </button>
          <button
            className="btn"
            onClick={() => {
              setActiveProject(createProject())
              setProjectDialogOpen(true)
            }}
          >
            <IcPlus size={12} /> {t.newProject}
          </button>
        </header>

        <section
          aria-label={t.overview}
          className="mb-7 grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(148px,1fr))]"
        >
          {stat(t.projects, String(totals.projects), <IcFolder size={14} />, 0)}
          {stat(t.boards, String(totals.boards), <IcBoard size={14} />, 1)}
          {stat(t.files, String(totals.files), <IcFile size={14} />, 2)}
          {/* formatBytes answers '' for nothing stored, which would leave a
              tile with a label and no number — an empty vault says so */}
          {stat(t.storage, formatBytes(totals.bytes) || t.nothingStored, <IcCloud size={14} />, 3)}
        </section>

        {recentFiles.length > 0 && (
          <section
            aria-labelledby="dash-files"
            className="anim-rise anim-stagger mb-7"
            style={{ '--i': 4 } as CSSProperties}
          >
            <h2
              id="dash-files"
              className="mb-2 text-[9.5px] font-semibold tracking-widest text-muted uppercase"
            >
              {t.recentFiles}
            </h2>
            <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
              {recentFiles.map((r) => {
                const Icon = RECENT_ICON[r.kind]
                return (
                  <button
                    key={`${r.kind}:${r.id}`}
                    className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-bord bg-panel px-3 py-2.5 text-left hover:border-accent"
                    onClick={() => openRecent(r)}
                    aria-label={t.openRecent(r.title, r.projectName ?? '')}
                  >
                    <Icon size={14} className="flex-none text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium">
                        {r.title}
                      </span>
                      <span className="block truncate text-[10.5px] text-muted">
                        {r.projectName} · {timeAgo(r.at)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {section('dash-starred', t.starred, groups.starred, 5, 'starred')}
        {section('dash-recent', t.recent, recentOnly, 6, 'recent')}
        {section('dash-projects', t.projects, activeOnly, 7)}
        {section('dash-archived', t.archived, groups.archived, 8, 'archived')}

        {wsProjects.length === 0 && (
          <div className="rounded-xl border border-dashed border-bord p-8 text-center">
            <p className="mb-1 text-[13px] font-semibold">{t.emptyTitle}</p>
            <p className="text-[11.5px] text-muted">{t.emptyBody}</p>
          </div>
        )}
      </div>
    </main>
  )
}
