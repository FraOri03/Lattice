import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { useWorkspaceLayoutStore } from '@/store/workspaceLayoutStore'
import { useI18n } from '@/lib/i18n'
import { announce } from '@/lib/a11y/announcer'
import { SidePanel } from '@/components/shell/SidePanel'
import { TopBar } from '@/components/TopBar'
import { IcPlus } from '@/components/Icons'
import { DashboardNav } from './DashboardNav'
import { HomeDestination } from './HomeDestination'
import { InvitesDestination } from './InvitesDestination'
import { RecentsDestination } from './RecentsDestination'
import { SharedDestination } from './SharedDestination'
import { StarredDestination } from './StarredDestination'
import { TrashDestination } from './TrashDestination'

/**
 * The dashboard (Phase 15.1) — the shell the six destinations live in.
 *
 * This replaces the Dashboard shipped in 11.2, which was a single scrolling
 * page mounted with no chrome at all: going Home meant losing the project tree,
 * the search launcher and every way of reaching anything that was not a project
 * card. 13.1 settled that the shell stays up here too, and that the surface has
 * five siblings besides Home.
 *
 * Three decisions worth stating, because each one is a thing this file does
 * *not* do:
 *
 * - **The navigation is `SidePanel`**, the same component the project sidebar
 *   uses, so "docked at Full and Compact, an overlay drawer with an edge handle
 *   below" is inherited from the tier model (12.2) rather than restated here.
 *   One drawer implementation, one set of focus rules, one Escape.
 * - **The URL owns the destination**, not this component: `d=…` is parsed in
 *   `lib/nav/navUrl` and applied by `applyNav`, which is what makes a refresh on
 *   Trash stay on Trash and lets Back walk the destinations.
 * - **The top bar is `TopBar`**, in the dashboard variant it grew in 15.7 —
 *   not a second bar. Search, notifications, sync, theme and profile were all
 *   already built and mounted only inside the project surface; what the variant
 *   drops is everything that names a project which is not open.
 */
export function Dashboard() {
  const t = useI18n()
  const destination = useStore((s) => s.dashboardDestination)
  const setActiveProject = useStore((s) => s.setActiveProject)
  const createProject = useStore((s) => s.createProject)
  const setProjectDialogOpen = useUiStore((s) => s.setProjectDialogOpen)
  const navCollapsed = useWorkspaceLayoutStore((s) => s.dashboardNavCollapsed)
  const setNavCollapsed = useWorkspaceLayoutStore((s) => s.setDashboardNavCollapsed)

  // Arriving somewhere is announced once, the way switching settings panel is
  // (14.1). Focus is deliberately not moved: it would evict a keyboard user
  // from the navigation they are still walking.
  useEffect(() => {
    announce(t.destinations.title[destination])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination])

  return (
    <div className="flex h-full w-full bg-bg">
      <SidePanel
        side="left"
        title={t.destinations.navLabel}
        width={240}
        collapsed={navCollapsed}
        onCollapsedChange={setNavCollapsed}
        chrome="none"
      >
        <DashboardNav />
      </SidePanel>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* the shell's own bar, in its dashboard variant — search, notifications,
            sync, theme and profile were all already built and mounted only
            inside the project surface until 15.7 */}
        <TopBar
          variant="dashboard"
          title={t.destinations.title[destination]}
          trailing={
            <button
              className="btn"
              onClick={() => {
                setActiveProject(createProject())
                setProjectDialogOpen(true)
              }}
            >
              <IcPlus size={12} /> {t.dashboard.newProject}
            </button>
          }
        />

        <main className="min-h-0 flex-1 overflow-y-auto">
          {destination === 'home' ? (
            <HomeDestination />
          ) : destination === 'recents' ? (
            <RecentsDestination />
          ) : destination === 'starred' ? (
            <StarredDestination />
          ) : destination === 'shared' ? (
            <SharedDestination />
          ) : destination === 'invites' ? (
            <InvitesDestination />
          ) : (
            <TrashDestination />
          )}
        </main>
      </div>
    </div>
  )
}
