import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { useWorkspaceLayoutStore } from '@/store/workspaceLayoutStore'
import { splitAvailable } from '@/lib/layout/tiers'
import { useViewportTier } from '@/lib/layout/useViewportTier'
import type { ViewMode } from '@/types/model'
import {
  SWITCHER_CLUSTERS,
  sectionMeta,
  type PlannedMeta,
  type PlannedSurface,
  type SwitcherItem,
  type WorkspaceSection,
} from '@/types/workspace'
import { useI18n } from '@/lib/i18n'
import {
  IcBezier,
  IcBoard,
  IcCamera,
  IcCode,
  IcComfyUI,
  IcDoc,
  IcFilm,
  IcGraph,
  IcPages,
  IcPalette,
  IcPresentation,
  IcSparkles,
  IcSplit,
  IcTable,
} from '@/components/Icons'

const SECTION_ICONS: Record<WorkspaceSection, React.ReactNode> = {
  board: <IcBoard size={13} />,
  document: <IcDoc size={13} />,
  spreadsheet: <IcTable size={13} />,
  presentation: <IcPresentation size={13} />,
  code: <IcCode size={13} />,
  photo: <IcCamera size={13} />,
}

const PLANNED_ICONS: Record<PlannedSurface, React.ReactNode> = {
  comfyui: <IcComfyUI size={13} />,
  aiDashboard: <IcSparkles size={13} />,
  trace: <IcBezier size={13} />,
  forge: <IcPalette size={13} />,
  folio: <IcPages size={13} />,
  flux: <IcFilm size={13} />,
}

/**
 * The top navigation: five segmented clusters —
 * [Split] · [Board · Graph] · [Document · Sheet · Presentation · Code] ·
 * [ComfyUI · AI dashboard] · [Trace · Forge · Photo · Folio · Flux].
 *
 * Split leads on its own because it is the odd one out: a LAYOUT that applies
 * on top of whatever else is selected, rather than a thing you select.
 *
 * Underneath, the three concepts stay separated (see src/types/workspace.ts):
 * the sections drive `viewMode`, Graph is a content VIEW, and Split is a
 * LAYOUT owned by `workspaceLayoutStore` — which is why Split and a section can
 * be active at the same time, and why Graph can occupy the second pane while an
 * editor holds the first.
 *
 * The last two clusters are the AI and Creative suites, disabled: the space
 * they will take is spent now rather than six times over as each ships. They
 * are also the first thing to leave a narrow bar — a placeholder you cannot
 * click is the cheapest thing to drop — which is why they hide on a container
 * query rather than being unconditionally mounted.
 */
export function SectionTabs() {
  const viewMode = useStore((s) => s.viewMode)
  const setViewMode = useStore((s) => s.setViewMode)
  const split = useWorkspaceLayoutStore((s) => s.split)
  const secondaryContent = useWorkspaceLayoutStore((s) => s.secondaryContent)
  const openSplit = useWorkspaceLayoutStore((s) => s.openSplit)
  const closeSplit = useWorkspaceLayoutStore((s) => s.closeSplit)
  const setSecondaryContent = useWorkspaceLayoutStore((s) => s.setSecondaryContent)
  const graphReturnMode = useWorkspaceLayoutStore((s) => s.graphReturnMode)
  const setGraphReturnMode = useWorkspaceLayoutStore((s) => s.setGraphReturnMode)
  const tier = useViewportTier()
  const t = useI18n()

  // remember the section the graph is layered over, so leaving Graph goes back
  useEffect(() => {
    if (viewMode !== 'graph') setGraphReturnMode(viewMode)
  }, [viewMode, setGraphReturnMode])

  // Presentation and Photo are full-page sections without a split layout —
  // and below the Full tier nothing splits, because two panes at 1100px leave
  // roughly 290px each once the chrome is paid for, which is under the width
  // at which any editor is usable (12.0 §F3, settled in the tier model).
  const fitsSplit = splitAvailable(tier)
  const canSplit = fitsSplit && viewMode !== 'presentation' && viewMode !== 'photo'
  const graphActive = split ? secondaryContent === 'graph' : viewMode === 'graph'

  const onToggleSplit = () => {
    if (split) {
      closeSplit()
    } else if (viewMode === 'graph') {
      // move the graph into the right pane, restore an editor/board on the left
      setViewMode(graphReturnMode)
      openSplit({ secondary: 'graph' })
    } else {
      // the Board pairs with a Graph; editor sections pair with the Board
      openSplit({ secondary: viewMode === 'board' ? 'graph' : 'board' })
    }
  }

  const onToggleGraph = () => {
    if (split) {
      setSecondaryContent(secondaryContent === 'graph' ? 'board' : 'graph')
    } else if (viewMode === 'graph') {
      setViewMode(graphReturnMode)
    } else {
      setViewMode('graph')
    }
  }

  return (
    <div
      className="flex items-center gap-2"
      role="group"
      aria-label={t.topbar.viewModeGroup}
    >
      <Cluster>
        <Tab
          icon={<IcSplit size={13} />}
          label={t.modes.split}
          active={split}
          disabled={!canSplit}
          onClick={onToggleSplit}
          ariaLabel={t.topbar.viewSuffix(t.modes.split)}
          title={
            !fitsSplit
              ? t.topbar.splitTooNarrow
              : !canSplit
                ? t.topbar.splitUnavailable
                : split
                  ? t.topbar.splitClose
                  : t.topbar.splitOpen
          }
        />
      </Cluster>

      <Cluster>
        <SectionTab section="board" active={viewMode === 'board'} onSelect={setViewMode} />
        <Tab
          icon={<IcGraph size={13} />}
          label={t.modes.graph}
          active={graphActive}
          onClick={onToggleGraph}
          ariaLabel={t.topbar.viewSuffix(t.modes.graph)}
          title={
            graphActive
              ? split
                ? t.topbar.graphCloseInPane
                : t.topbar.graphClose
              : split
                ? t.topbar.graphOpenInPane
                : t.topbar.graphOpen
          }
        />
      </Cluster>

      {SWITCHER_CLUSTERS.map((items, i) => (
        // a cluster with nothing clickable in it goes away whole at the same
        // width its members would have gone one by one
        <Cluster key={i} planned={items.every(isPlanned)}>
          {items.map((item) =>
            item.kind === 'section' ? (
              <SectionTab
                key={item.section}
                section={item.section}
                active={viewMode === sectionMeta(item.section).mode}
                onSelect={setViewMode}
              />
            ) : (
              <PlannedTab key={item.planned.id} meta={item.planned} />
            ),
          )}
        </Cluster>
      ))}
    </div>
  )
}

const isPlanned = (item: SwitcherItem) => item.kind === 'planned'

function Cluster({ children, planned }: { children: React.ReactNode; planned?: boolean }) {
  return (
    <div
      className={`rounded-lg border border-bord bg-panel2 p-0.5 ${
        planned ? 'hidden @min-[64rem]:flex' : 'flex'
      }`}
    >
      {children}
    </div>
  )
}

function SectionTab({
  section,
  active,
  onSelect,
}: {
  section: WorkspaceSection
  active: boolean
  onSelect: (mode: ViewMode) => void
}) {
  const t = useI18n()
  const meta = sectionMeta(section)
  // SECTION_METAS.label stays the untranslated source of truth (and keeps the
  // list testable without a DOM); the visible label is localised here.
  const label = t.modes[meta.mode]
  return (
    <Tab
      icon={SECTION_ICONS[section]}
      label={label}
      active={active}
      onClick={() => onSelect(meta.mode)}
      ariaLabel={t.topbar.sectionAria(label)}
      title={t.topbar.sectionAria(label)}
    />
  )
}

/**
 * A tab for an environment that does not exist yet. It is disabled, never
 * pressed, and its tooltip names the phase that builds it instead of the
 * "coming soon" that would be true of anything.
 *
 * It stays icon-only at every width: six more words would cost ~300px the bar
 * does not have, and the words belong to features nobody can reach.
 */
function PlannedTab({ meta }: { meta: PlannedMeta }) {
  const t = useI18n()
  const label = t.modes[meta.id]
  return (
    <Tab
      icon={PLANNED_ICONS[meta.id]}
      label={label}
      labelled={false}
      hideWhenTight
      active={false}
      disabled
      onClick={() => {}}
      ariaLabel={t.topbar.plannedAria(label)}
      title={t.topbar.plannedTitle(label, t.topbar.plannedDomain[meta.id], meta.phase)}
    />
  )
}

function Tab({
  icon,
  label,
  labelled = true,
  hideWhenTight,
  active,
  disabled,
  onClick,
  ariaLabel,
  title,
}: {
  icon: React.ReactNode
  label: string
  /** false pins the tab to its icon — see PlannedTab */
  labelled?: boolean
  /** leaves the bar below 64rem, where every pixel belongs to a live surface */
  hideWhenTight?: boolean
  active: boolean
  disabled?: boolean
  onClick: () => void
  ariaLabel: string
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={ariaLabel}
      title={title}
      className={`flex-none cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
        hideWhenTight ? 'hidden @min-[64rem]:flex' : 'flex'
      } ${active ? 'bg-panel text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
    >
      {icon}
      {/* The eight words take the switcher from 520px to 899px, and that is
          the difference between a bar that fits and one that does not: with
          them the bar asks for 1996px. 127rem is measured from that, unlike
          the 87.5rem it replaces — which was set when the switcher had eight
          tabs, and was already producing a bar that overflowed at 1920. The
          query asks the BAR how wide it is, not the window (audit F4). See
          lib/layout/topBarFit for the rest of the budget. */}
      {labelled && <span className="hidden @min-[127rem]:inline">{label}</span>}
    </button>
  )
}
