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
import { SwitcherTab } from './SwitcherTab'
import { AiTab } from '@/components/ai/AiTab'
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
  trace: <IcBezier size={13} />,
  forge: <IcPalette size={13} />,
  folio: <IcPages size={13} />,
  flux: <IcFilm size={13} />,
}

/**
 * The top navigation: five segmented clusters —
 * [Split] · [Board · Graph] · [Document · Sheet · Presentation · Code] ·
 * [AI · ComfyUI] · [Trace · Forge · Photo · Folio · Flux].
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
 * The last two clusters are the AI and Creative suites. Their placeholders are
 * disabled: the space they will take is spent now rather than six times over
 * as each ships, and they are the first thing to leave a narrow bar — a tab
 * you cannot click is the cheapest thing to drop — which is why a cluster with
 * nothing live in it hides on a container query.
 *
 * The AI cluster stopped being one of those in 21.3. Its first member is the
 * real surface now, so the cluster stays at every width and only the ComfyUI
 * placeholder beside it folds away. That is the placeholder model working: the
 * live tab moved into space the bar had already been measured with.
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
        <SwitcherTab
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
        <SwitcherTab
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
          {items.map((item) => {
            if (item.kind === 'ai') return <AiTab key="ai" />
            if (item.kind === 'planned') {
              return <PlannedTab key={item.planned.id} meta={item.planned} />
            }
            return (
              <SectionTab
                key={item.section}
                section={item.section}
                active={viewMode === sectionMeta(item.section).mode}
                onSelect={setViewMode}
              />
            )
          })}
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
    <SwitcherTab
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
    <SwitcherTab
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
