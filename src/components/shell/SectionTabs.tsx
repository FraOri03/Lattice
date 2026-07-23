import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { useWorkspaceLayoutStore } from '@/store/workspaceLayoutStore'
import type { ViewMode } from '@/types/model'
import { SECTION_METAS, type WorkspaceSection } from '@/types/workspace'
import { useI18n } from '@/lib/i18n'
import {
  IcBoard,
  IcCamera,
  IcCode,
  IcDoc,
  IcGraph,
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

/**
 * The top navigation: three segmented clusters —
 * [Split] · [Board · Graph] · [Document · Sheet · Presentation · Code · Photo].
 *
 * Split leads on its own because it is the odd one out: a LAYOUT that applies
 * on top of whatever else is selected, rather than a thing you select.
 *
 * Presentation only. Underneath, the three concepts stay separated (see
 * src/types/workspace.ts): the sections drive `viewMode`, Graph is a content
 * VIEW, and Split is a LAYOUT owned by `workspaceLayoutStore` — which is why
 * Split and a section can be active at the same time, and why Graph can occupy
 * the second pane while an editor holds the first.
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
  const t = useI18n()

  // remember the section the graph is layered over, so leaving Graph goes back
  useEffect(() => {
    if (viewMode !== 'graph') setGraphReturnMode(viewMode)
  }, [viewMode, setGraphReturnMode])

  // Presentation and Photo are full-page sections without a split layout
  const canSplit = viewMode !== 'presentation' && viewMode !== 'photo'
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

  const board = SECTION_METAS[0]
  const rest = SECTION_METAS.slice(1)

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
            !canSplit
              ? t.topbar.splitUnavailable
              : split
                ? t.topbar.splitClose
                : t.topbar.splitOpen
          }
        />
      </Cluster>

      <Cluster>
        <SectionTab meta={board} active={viewMode === board.mode} onSelect={setViewMode} />
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

      <Cluster>
        {rest.map((meta) => (
          <SectionTab
            key={meta.section}
            meta={meta}
            active={viewMode === meta.mode}
            onSelect={setViewMode}
          />
        ))}
      </Cluster>
    </div>
  )
}

function Cluster({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex rounded-lg border border-bord bg-panel2 p-0.5">{children}</div>
  )
}

function SectionTab({
  meta,
  active,
  onSelect,
}: {
  meta: (typeof SECTION_METAS)[number]
  active: boolean
  onSelect: (mode: ViewMode) => void
}) {
  const t = useI18n()
  // SECTION_METAS.label stays the untranslated source of truth (and keeps the
  // list testable without a DOM); the visible label is localised here.
  const label = t.modes[meta.mode]
  return (
    <Tab
      icon={SECTION_ICONS[meta.section]}
      label={label}
      active={active}
      onClick={() => onSelect(meta.mode)}
      ariaLabel={t.topbar.sectionAria(label)}
      title={t.topbar.sectionAria(label)}
    />
  )
}

function Tab({
  icon,
  label,
  active,
  disabled,
  onClick,
  ariaLabel,
  title,
}: {
  icon: React.ReactNode
  label: string
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
      className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-panel text-ink shadow-sm' : 'text-muted hover:text-ink'
      }`}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </button>
  )
}
