import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { useRecentProjects } from '@/lib/projects/ProjectStore'
import { groupProjects } from '@/lib/projects/ProjectRegistry'
import { useI18n, useTimeAgo } from '@/lib/i18n'
import { CARD_COLORS, type Project } from '@/types/model'
import { IcArchive, IcClock, IcPlus, IcSearch, IcStar } from '@/components/Icons'

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

  const workspace = workspaces[activeWorkspaceId]
  // the dashboard scopes to the active workspace, like the project switcher
  const wsProjects = workspace
    ? Object.values(projects).filter((p) => workspace.projectIds.includes(p.id))
    : Object.values(projects)
  const groups = groupProjects(wsProjects)

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
        <span className="text-[10.5px] text-muted">{t.updated(timeAgo(p.updatedAt))}</span>
      </button>
    )
  }

  const section = (
    id: string,
    label: string,
    items: Project[],
    badge?: 'starred' | 'archived' | 'recent',
  ) =>
    items.length > 0 && (
      <section aria-labelledby={id} className="mb-7">
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
        <header className="mb-7 flex flex-wrap items-center gap-3">
          <h1 className="text-[19px] font-bold tracking-tight">{t.title}</h1>
          {workspace && (
            <span className="text-[12px] text-muted">
              {t.inWorkspace(`${workspace.icon} ${workspace.name}`)}
            </span>
          )}
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

        {section('dash-starred', t.starred, groups.starred, 'starred')}
        {section('dash-recent', t.recent, recentOnly, 'recent')}
        {section('dash-projects', t.projects, activeOnly)}
        {section('dash-archived', t.archived, groups.archived, 'archived')}

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
