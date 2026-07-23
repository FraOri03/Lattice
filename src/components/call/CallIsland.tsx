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
import {
  IcChevronDown,
  IcChevronUp,
  IcMaximize,
  IcMinimize,
  IcUsers,
} from '@/components/Icons'

/** How many thumbnails stay visible before the strip scrolls. */
const VISIBLE_TILES = 4

/**
 * The call island: a compact bar anchored bottom-right, independent of both
 * toolbars. It grows in two deliberate steps — `panel` adds the filmstrip,
 * `stage` enlarges one participant or the screen share — so a bigger picture is
 * always something the user asked for, never the default.
 *
 * Placement avoids the board chrome: when the board is on screen its minimap
 * occupies the bottom-right corner, so the island sits above it.
 */
export function CallIsland() {
  const { status } = useCall()
  const size = useCallUiStore((s) => s.size)
  const toggleExpanded = useCallUiStore((s) => s.toggleExpanded)
  const toggleStage = useCallUiStore((s) => s.toggleStage)
  const focusedIdentity = useCallUiStore((s) => s.focusedIdentity)
  const focus = useCallUiStore((s) => s.focus)
  const viewMode = useStore((s) => s.viewMode)
  const split = useWorkspaceLayoutStore((s) => s.split)
  const secondaryContent = useWorkspaceLayoutStore((s) => s.secondaryContent)

  const participants = useParticipants()
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], {
    onlySubscribed: false,
  })

  if (status !== 'connected') return null

  const boardVisible = viewMode === 'board' || (split && secondaryContent === 'board')
  const screenShare = tracks.find(
    (t): t is TrackReference => t.source === Track.Source.ScreenShare,
  )
  const cameraTracks = tracks.filter(
    (t): t is TrackReference => t.source === Track.Source.Camera,
  )
  const speaking = participants.find((p) => p.isSpeaking)

  const expanded = size !== 'bar'
  const onStage = size === 'stage'

  // What the stage enlarges: an explicit pick, else the screen share, else the
  // active speaker, else the first camera.
  const picked =
    (focusedIdentity &&
      [...cameraTracks, ...(screenShare ? [screenShare] : [])].find(
        (t) => t.participant.identity === focusedIdentity,
      )) ||
    screenShare ||
    cameraTracks.find((t) => t.participant.identity === speaking?.identity) ||
    cameraTracks[0]

  return (
    <aside
      role="region"
      aria-label="Project call"
      className={`pointer-events-auto absolute right-3 z-40 rounded-xl border border-bord bg-panel/95 shadow-xl backdrop-blur ${
        onStage ? 'w-[320px] sm:w-[440px]' : 'w-[280px] sm:w-[340px]'
      } ${boardVisible ? 'bottom-44' : 'bottom-3'}`}
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
          onClick={toggleStage}
          aria-pressed={onStage}
          aria-label={onStage ? 'Shrink the call' : 'Enlarge the call'}
          title={
            onStage
              ? 'Shrink — back to the filmstrip'
              : 'Enlarge — show a bigger view of the camera or screen share'
          }
          className="flex flex-none cursor-pointer items-center justify-center rounded-md px-1 py-1.5 text-muted hover:bg-panel2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          {onStage ? <IcMinimize size={13} /> : <IcMaximize size={13} />}
        </button>

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
          {onStage && picked && (
            <div className="mb-2">
              <ParticipantTile trackRef={picked} variant="stage" />
            </div>
          )}

          {!onStage && screenShare && (
            <div className="mb-2">
              <ParticipantTile trackRef={screenShare} variant="stage" />
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
              {/* on the stage the screen share is selectable too, so you can go
                  back to it after enlarging someone's webcam */}
              {onStage && screenShare && (
                <div role="listitem">
                  <ParticipantTile
                    trackRef={screenShare}
                    selected={picked === screenShare}
                    onSelect={() => focus(screenShare.participant.identity)}
                  />
                </div>
              )}
              {cameraTracks.slice(0, VISIBLE_TILES).map((t) => (
                <div role="listitem" key={`${t.participant.identity}-${t.source}`}>
                  <ParticipantTile
                    trackRef={t}
                    selected={onStage && picked === t}
                    onSelect={
                      onStage ? () => focus(t.participant.identity) : undefined
                    }
                  />
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
