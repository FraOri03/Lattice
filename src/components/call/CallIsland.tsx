import {
  RoomAudioRenderer,
  useParticipants,
  useTracks,
  type TrackReference,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import { useStore } from '@/store/useStore'
import { useWorkspaceLayoutStore } from '@/store/workspaceLayoutStore'
import { useCallUiStore } from '@/store/callUiStore'
import { useCall } from './CallProvider'
import { MediaControls } from './MediaControls'
import { ParticipantTile } from './ParticipantTile'
import { IcChevronDown, IcChevronUp, IcUsers } from '@/components/Icons'

/** How many tiles stay visible before the strip scrolls. */
const VISIBLE_TILES = 4

/**
 * The call island: a compact bar anchored bottom-right, independent of both
 * toolbars. Collapsed it is ~52px tall; expanded it adds a small filmstrip.
 * It is never a full-screen conference view — the workspace stays the subject.
 *
 * Placement avoids the board chrome: when the board is on screen its minimap
 * occupies the bottom-right corner, so the island sits above it.
 */
export function CallIsland() {
  const { status } = useCall()
  const expanded = useCallUiStore((s) => s.expanded)
  const toggleExpanded = useCallUiStore((s) => s.toggleExpanded)
  const viewMode = useStore((s) => s.viewMode)
  const split = useWorkspaceLayoutStore((s) => s.split)
  const secondaryContent = useWorkspaceLayoutStore((s) => s.secondaryContent)

  const participants = useParticipants()
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], {
    onlySubscribed: false,
  })

  if (status !== 'connected') return null

  const boardVisible =
    viewMode === 'board' || (split && secondaryContent === 'board')
  const screenShare = tracks.find(
    (t): t is TrackReference => t.source === Track.Source.ScreenShare,
  )
  const cameraTracks = tracks.filter(
    (t): t is TrackReference => t.source === Track.Source.Camera,
  )
  const speaking = participants.find((p) => p.isSpeaking)

  return (
    <aside
      role="region"
      aria-label="Project call"
      className={`pointer-events-auto absolute right-3 z-40 w-[280px] rounded-xl border border-bord bg-panel/95 shadow-xl backdrop-blur sm:w-[340px] ${
        boardVisible ? 'bottom-44' : 'bottom-3'
      }`}
    >
      {/* remote audio playback — granular, not the prefab conference layout */}
      <RoomAudioRenderer />

      <div className="flex h-[52px] items-center gap-2 px-2.5">
        <span
          className="flex flex-none items-center gap-1.5 text-[11px] font-semibold text-[#14ae5c]"
          title="You are connected to the project call"
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#14ae5c]" />
          Call
        </span>

        <span className="flex flex-none items-center gap-1 text-[11px] text-muted">
          <IcUsers size={12} aria-hidden />
          {participants.length}
          <span className="sr-only">
            {participants.length === 1 ? 'participant' : 'participants'} in the call
          </span>
        </span>

        <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
          {speaking ? `${speaking.name || speaking.identity} is speaking` : ''}
        </span>

        <MediaControls compact />

        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse the call panel' : 'Expand the call panel'}
          title={expanded ? 'Collapse' : 'Expand'}
          className="flex flex-none cursor-pointer items-center justify-center rounded-md px-1 py-1.5 text-muted hover:bg-panel2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          {expanded ? <IcChevronDown size={13} /> : <IcChevronUp size={13} />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-bord p-2">
          {screenShare && (
            <div className="mb-2">
              <ParticipantTile trackRef={screenShare} focused />
            </div>
          )}
          {cameraTracks.length === 0 && !screenShare ? (
            <p className="px-1 py-2 text-[11px] text-muted">
              No one has a camera on. Audio still works — turn your camera on from the
              controls above.
            </p>
          ) : (
            <div
              className="flex gap-1.5 overflow-x-auto"
              role="list"
              aria-label="Call participants"
            >
              {cameraTracks.slice(0, VISIBLE_TILES).map((t) => (
                <div role="listitem" key={`${t.participant.identity}-${t.source}`}>
                  <ParticipantTile trackRef={t} />
                </div>
              ))}
              {cameraTracks.length > VISIBLE_TILES && (
                <span className="flex flex-none items-center px-1 text-[11px] text-muted">
                  +{cameraTracks.length - VISIBLE_TILES}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
