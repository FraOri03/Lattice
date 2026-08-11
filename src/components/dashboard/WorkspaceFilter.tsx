import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { useI18n } from '@/lib/i18n'

/**
 * The workspace filter both shelves carry (13.1).
 *
 * Shelves span every workspace on purpose, so the filter is the control that
 * narrows them — not the surface doing it silently. It defaults to *all*, which
 * is the honest default for a question about you rather than about a workspace:
 * the file you closed two minutes ago stays visible after you switch.
 *
 * Its own state, not the store's: which workspace you are *filtering by* on a
 * shelf is not which workspace you are *in*, and persisting it would make a
 * narrowed shelf look empty on the next visit for no visible reason.
 */

export interface WorkspaceFilterState {
  value: string
  set: (value: string) => void
  accepts: (workspaceId: string | null) => boolean
}

export const ALL_WORKSPACES = 'all'

export function useWorkspaceFilter(): WorkspaceFilterState {
  const [value, set] = useState(ALL_WORKSPACES)
  return {
    value,
    set,
    accepts: (workspaceId) => value === ALL_WORKSPACES || workspaceId === value,
  }
}

export function WorkspaceFilter({ filter }: { filter: WorkspaceFilterState }) {
  const t = useI18n()
  const workspaces = useStore((s) => s.workspaces)

  return (
    <label className="inline-flex items-center gap-2">
      <span className="sr-only">{t.shelves.workspaceFilter}</span>
      <select
        className="field text-[12px]"
        value={filter.value}
        onChange={(e) => filter.set(e.target.value)}
      >
        <option value={ALL_WORKSPACES}>{t.shelves.allWorkspaces}</option>
        {Object.values(workspaces).map((ws) => (
          <option key={ws.id} value={ws.id}>
            {ws.icon} {ws.name}
          </option>
        ))}
      </select>
    </label>
  )
}
