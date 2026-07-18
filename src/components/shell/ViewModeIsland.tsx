import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { useWorkspaceLayoutStore } from '@/store/workspaceLayoutStore'
import { IcGraph, IcSplit } from '@/components/Icons'

/**
 * ViewModeIsland — the view/layout controls, deliberately separate from the
 * TopBar (navigation) and the bottom toolbar (canvas tools). It floats at the
 * top-right of the work area and owns exactly two things:
 *
 *  - Split — a LAYOUT toggle that opens/closes the second pane.
 *  - Graph — a VIEW toggle. In a single pane it swaps the primary content
 *    between the current section and the graph; while split it puts the graph
 *    in the second pane (so "editor on the left, graph on the right" works).
 *
 * Both are toggles, so they expose `aria-pressed` and never rely on colour
 * alone to show state (an active pill also carries a filled dot + ring).
 */
export function ViewModeIsland() {
  const viewMode = useStore((s) => s.viewMode)
  const setViewMode = useStore((s) => s.setViewMode)
  const split = useWorkspaceLayoutStore((s) => s.split)
  const secondaryContent = useWorkspaceLayoutStore((s) => s.secondaryContent)
  const openSplit = useWorkspaceLayoutStore((s) => s.openSplit)
  const closeSplit = useWorkspaceLayoutStore((s) => s.closeSplit)
  const setSecondaryContent = useWorkspaceLayoutStore((s) => s.setSecondaryContent)
  const graphReturnMode = useWorkspaceLayoutStore((s) => s.graphReturnMode)
  const setGraphReturnMode = useWorkspaceLayoutStore((s) => s.setGraphReturnMode)

  // remember the section the graph is overlaying, so leaving Graph goes back
  // there (and the SectionSwitcher keeps naming it meanwhile)
  useEffect(() => {
    if (viewMode !== 'graph') setGraphReturnMode(viewMode)
  }, [viewMode, setGraphReturnMode])

  // Presentation and Photo are full-page sections without a split layout.
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

  return (
    <div
      className="absolute top-3 right-3 z-30 flex items-center gap-0.5 rounded-lg border border-bord bg-panel/95 p-0.5 shadow-lg backdrop-blur"
      role="group"
      aria-label="View and layout controls"
    >
      <IslandButton
        label="Split"
        icon={<IcSplit size={14} />}
        active={split}
        disabled={!canSplit}
        onClick={onToggleSplit}
        pressedTitle="Close split — show a single pane"
        idleTitle={
          canSplit
            ? 'Split view — open a second pane beside the current one'
            : 'Split view is not available for this section'
        }
      />
      <IslandButton
        label="Graph"
        icon={<IcGraph size={14} />}
        active={graphActive}
        onClick={onToggleGraph}
        pressedTitle={
          split ? 'Hide the graph from the second pane' : 'Close the graph view'
        }
        idleTitle={
          split
            ? 'Graph view — show the graph in the second pane'
            : 'Graph view — browse relationships instead of the editor'
        }
      />
    </div>
  )
}

function IslandButton({
  label,
  icon,
  active,
  disabled,
  onClick,
  pressedTitle,
  idleTitle,
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  disabled?: boolean
  onClick: () => void
  pressedTitle: string
  idleTitle: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={`${label} view mode`}
      title={active ? pressedTitle : idleTitle}
      className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'bg-accent/15 text-accent ring-1 ring-accent/40'
          : 'text-muted hover:bg-panel2 hover:text-ink'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {/* state is conveyed by text + a filled dot, not colour alone */}
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-accent' : 'bg-transparent'}`}
      />
    </button>
  )
}
