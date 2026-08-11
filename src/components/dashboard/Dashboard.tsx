import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { useWorkspaceLayoutStore } from '@/store/workspaceLayoutStore'
import { useI18n } from '@/lib/i18n'
import { announce } from '@/lib/a11y/announcer'
import { SidePanel } from '@/components/shell/SidePanel'
import { IcPlus, IcSearch } from '@/components/Icons'
import { DashboardNav } from './DashboardNav'
import { DestinationPlaceholder } from './DestinationPlaceholder'
import { HomeDestination } from './HomeDestination'

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
 * - **Search and New keep 11.2's behaviour.** The launcher opens the palette,
 *   which 13.4 confirms is the right pattern; making the palette search
 *   globally, rank its results and resolve a target before creating is #78's
 *   work, and doing half of it here would leave two ranking models.
 */
export function Dashboard() {
  const t = useI18n()
  const destination = useStore((s) => s.dashboardDestination)
  const setActiveProject = useStore((s) => s.setActiveProject)
  const createProject = useStore((s) => s.createProject)
  const setProjectDialogOpen = useUiStore((s) => s.setProjectDialogOpen)
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen)
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
        <header className="flex flex-none flex-wrap items-center gap-2 border-b border-bord px-4 py-2.5">
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold">
            {t.destinations.title[destination]}
          </span>
          <button
            className="btn"
            onClick={() => setPaletteOpen(true)}
            title={t.dashboard.searchHint}
          >
            <IcSearch size={12} /> {t.dashboard.search}
          </button>
          <button
            className="btn"
            onClick={() => {
              setActiveProject(createProject())
              setProjectDialogOpen(true)
            }}
          >
            <IcPlus size={12} /> {t.dashboard.newProject}
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          {destination === 'home' ? (
            <HomeDestination />
          ) : (
            <DestinationPlaceholder destination={destination} />
          )}
        </main>
      </div>
    </div>
  )
}
