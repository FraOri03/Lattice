import { useStore } from '@/store/useStore'
import { useI18n } from '@/lib/i18n'
import { groupProjects } from '@/lib/projects/ProjectRegistry'
import { DESTINATIONS, type Destination } from '@/lib/dashboard/destinations'
import { IcClock, IcHome, IcMail, IcStar, IcTrash, IcUsers } from '@/components/Icons'

/**
 * The dashboard's lateral navigation (13.1, built in 15.1).
 *
 * Three bands, in the order 13.1 settles them: the workspace you are in, the
 * six destinations, and the active workspace's projects grouped exactly as
 * `groupProjects()` groups them for the switcher.
 *
 * The prototype draws the third band as a folder tree holding projects. There
 * is no such level in the model — `Folder` is scoped to one category inside one
 * project — so the tree is the workspace's projects, and folders keep working
 * where they already work.
 */

const ICON: Record<Destination, typeof IcHome> = {
  home: IcHome,
  recents: IcClock,
  starred: IcStar,
  shared: IcUsers,
  invites: IcMail,
  trash: IcTrash,
}

export function DashboardNav() {
  const t = useI18n()
  const destination = useStore((s) => s.dashboardDestination)
  const openDestination = useStore((s) => s.openDestination)
  const workspaces = useStore((s) => s.workspaces)
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId)
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace)
  const projects = useStore((s) => s.projects)
  const setActiveProject = useStore((s) => s.setActiveProject)

  const workspace = workspaces[activeWorkspaceId]
  const wsList = Object.values(workspaces).filter(
    (ws) => !ws.archived || ws.id === activeWorkspaceId,
  )
  // the same scoping the project switcher applies — Home is the project index
  // for ONE workspace, and the tree below has to agree with it
  const wsProjects = workspace
    ? Object.values(projects).filter((p) => workspace.projectIds.includes(p.id))
    : Object.values(projects)
  const groups = groupProjects(wsProjects)

  const group = (label: string, items: typeof groups.starred) =>
    items.length > 0 && (
      <div className="mt-3">
        <div className="mb-1 px-2 text-[9.5px] font-semibold tracking-widest text-muted uppercase">
          {label}
        </div>
        {items.map((p) => (
          <button
            key={p.id}
            className="flex min-h-6 w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-left text-[12px] text-muted hover:bg-panel2 hover:text-ink"
            onClick={() => setActiveProject(p.id)}
            aria-label={t.dashboard.openProject(p.name)}
          >
            <span className="flex-none text-[12px]">{p.icon}</span>
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
          </button>
        ))}
      </div>
    )

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* the workspace selector 13.1 settles: switching re-scopes the surface
          and never opens or creates a project */}
      <div className="flex-none border-b border-bord p-2">
        <label className="block">
          <span className="sr-only">{t.destinations.workspaceLabel}</span>
          <select
            className="field w-full text-[12px]"
            value={activeWorkspaceId}
            onChange={(e) => setActiveWorkspace(e.target.value)}
          >
            {wsList.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.icon} {ws.name} · {t.destinations.projectCount(ws.projectIds.length)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <nav aria-label={t.destinations.navLabel}>
          {DESTINATIONS.map((key) => {
            const Icon = ICON[key]
            const active = key === destination
            return (
              <button
                key={key}
                aria-current={active ? 'page' : undefined}
                onClick={() => openDestination(key)}
                className={`flex min-h-8 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] ${
                  active ? 'bg-panel2 font-semibold text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                <Icon size={13} className="flex-none" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{t.destinations.title[key]}</span>
              </button>
            )
          })}
        </nav>

        {group(t.dashboard.starred, groups.starred)}
        {group(t.dashboard.projects, groups.active)}
        {group(t.dashboard.archived, groups.archived)}
      </div>
    </div>
  )
}
