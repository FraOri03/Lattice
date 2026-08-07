import type { ReactNode } from 'react'
import {
  MAX_INSPECTOR_WIDTH,
  MIN_INSPECTOR_WIDTH,
  useWorkspaceLayoutStore,
} from '@/store/workspaceLayoutStore'
import { SidePanel } from './SidePanel'

/**
 * The shell's right-hand panel: the properties of the current selection.
 *
 * Four sections mount an inspector — the board's, the document's, the
 * spreadsheet's cell inspector and the code file's — and only the board's had
 * been given a width, a rail and a way to shut it. The other three were still
 * the same hard-coded `aside`, repeated three times: `w-70 flex-none
 * overflow-y-auto border-l …`.
 *
 * They share this now, so "the inspector is 280 px, resizable, collapsible,
 * and a drawer below Compact" is one fact instead of four copies that drift.
 * One state serves all four because only one section is on screen at a time —
 * the inspector is a place in the shell, not a possession of a section.
 */
export function InspectorPanel({ children }: { children: ReactNode }) {
  const collapsed = useWorkspaceLayoutStore((s) => s.inspectorCollapsed)
  const width = useWorkspaceLayoutStore((s) => s.inspectorWidth)
  const setCollapsed = useWorkspaceLayoutStore((s) => s.setInspectorCollapsed)
  const setWidth = useWorkspaceLayoutStore((s) => s.setInspectorWidth)

  return (
    <SidePanel
      title="Inspector"
      width={width}
      collapsed={collapsed}
      minWidth={MIN_INSPECTOR_WIDTH}
      maxWidth={MAX_INSPECTOR_WIDTH}
      onWidth={setWidth}
      onCollapsedChange={setCollapsed}
    >
      {children}
    </SidePanel>
  )
}
