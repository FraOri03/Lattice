import { useCollabStore, type CollabPanel as PanelId } from '@/lib/collab/collabStore'
import { CommentsPanel } from './CommentsPanel'
import { ActivityPanel } from './ActivityPanel'
import { VersionHistoryPanel } from './VersionHistoryPanel'
import { IcActivity, IcHistory, IcMessage, IcX } from '@/components/Icons'
import { panelsAreDocked } from '@/lib/layout/tiers'
import { useViewportTier } from '@/lib/layout/useViewportTier'

/**
 * CollabPanel — right-side drawer hosting Comments / Activity / Versions.
 * One drawer, three tabs: keeps the workspace from growing three separate
 * side panels.
 */

const TABS: { id: Exclude<PanelId, null>; label: string; icon: React.ReactNode }[] = [
  { id: 'comments', label: 'Comments', icon: <IcMessage size={13} /> },
  { id: 'activity', label: 'Activity', icon: <IcActivity size={13} /> },
  { id: 'versions', label: 'Versions', icon: <IcHistory size={13} /> },
]

export function CollabPanel() {
  const panel = useCollabStore((s) => s.panel)
  const setPanel = useCollabStore((s) => s.setPanel)
  const setFocusedThread = useCollabStore((s) => s.setFocusedThread)
  const docked = panelsAreDocked(useViewportTier())
  if (!panel) return null

  return (
    /**
     * Docked it takes 288px out of the working area; below the Compact tier
     * there is no working area left to take it from, so it overlays instead —
     * the same move the sidebar and the inspector make in 12.2, on the same
     * threshold. It matters more here than for either of them: reading and
     * answering a comment is the realistic phone job, and 12.5 promises
     * comments work at every tier.
     */
    <aside
      className={
        docked
          ? 'flex w-72 flex-none flex-col border-l border-bord bg-panel'
          : 'side-panel-drawer w-72 max-w-[85vw]'
      }
      data-side="right"
      aria-label="Collaboration panel"
    >
      <div className="flex h-9 flex-none items-center gap-0.5 border-b border-bord px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setPanel(t.id)}
            aria-label={t.label}
            className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium ${
              panel === t.id ? 'bg-panel2 text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          className="icon-btn h-6 w-6"
          aria-label="Close panel"
          onClick={() => {
            setPanel(null)
            setFocusedThread(null)
          }}
        >
          <IcX size={12} />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {panel === 'comments' && <CommentsPanel />}
        {panel === 'activity' && <ActivityPanel />}
        {panel === 'versions' && <VersionHistoryPanel />}
      </div>
    </aside>
  )
}
