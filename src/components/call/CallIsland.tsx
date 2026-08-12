import { useRef } from 'react'
import {
  RoomAudioRenderer,
  useParticipants,
  useTracks,
  type TrackReference,
} from '@livekit/components-react'
import { Track, type Participant } from 'livekit-client'
import { useStore } from '@/store/useStore'
import { useWorkspaceLayoutStore } from '@/store/workspaceLayoutStore'
import { floatingRectFrom, useCallUiStore } from '@/store/callUiStore'
import { announce } from '@/lib/a11y/announcer'
import { useCall } from './CallProvider'
import { CallStage, EmptyStage } from './CallStage'
import { CallWindow, rectOf, viewport } from './CallWindow'
import { MediaControls } from './MediaControls'
import { ParticipantTile } from './ParticipantTile'
import {
  IcChevronDown,
  IcChevronUp,
  IcDock,
  IcMaximize,
  IcUsers,
} from '@/components/Icons'

/** How many tiles stay visible in the docked filmstrip before it scrolls. */
const VISIBLE_TILES = 4

/**
 * The call island: a compact bar anchored bottom-right, independent of both
 * toolbars. Collapsed it is ~52px tall; expanded it adds a small filmstrip.
 * It is never a full-screen conference view — the workspace stays the subject.
 *
 * Placement avoids the board chrome: when the board is on screen its minimap
 * occupies the bottom-right corner, so the island sits above it.
 *
 * Undocked (the button in the bar) the same call becomes a free window the
 * user drags anywhere and resizes from any edge — a first-class replacement
 * for right-clicking a tile and asking the browser for picture-in-picture,
 * which pops out a single video and only if you know the menu is there.
 */
export function CallIsland() {
  const { status } = useCall()
  const mode = useCallUiStore((s) => s.mode)
  const float = useCallUiStore((s) => s.float)
  const dock = useCallUiStore((s) => s.dock)

  const participants = useParticipants()
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], {
    onlySubscribed: false,
  })
  const dockedRef = useRef<HTMLElement>(null)

  if (status !== 'connected') return null

  const screenShare = tracks.find(
    (t): t is TrackReference => t.source === Track.Source.ScreenShare,
  )
  const cameraTracks = tracks.filter(
    (t): t is TrackReference => t.source === Track.Source.Camera,
  )
  const speaking = participants.find((p) => p.isSpeaking)

  const undock = () => {
    const from = dockedRef.current ? rectOf(dockedRef.current) : null
    float(floatingRectFrom(from, viewport()))
    announce('Call undocked. Drag the bar to move it, the edges to resize it.')
  }

  const redock = () => {
    dock()
    announce('Call docked back to the corner')
  }

  return (
    <>
      {/* remote audio playback — granular, not the prefab conference layout.
          Outside the docked/floating switch so moving the window never tears
          down the audio elements. */}
      <RoomAudioRenderer />

      {mode === 'floating' ? (
        <CallWindow
          bar={
            <>
              <CallSummary count={participants.length} speaking={speaking} />
              <MediaControls compact />
              <BarButton
                onClick={redock}
                label="Dock the call back to the corner"
                title="Dock to the corner"
              >
                <IcDock size={13} />
              </BarButton>
            </>
          }
        >
          <CallStage screenShare={screenShare} cameraTracks={cameraTracks} />
        </CallWindow>
      ) : (
        <DockedIsland
          ref={dockedRef}
          count={participants.length}
          speaking={speaking}
          screenShare={screenShare}
          cameraTracks={cameraTracks}
          onUndock={undock}
        />
      )}
    </>
  )
}

function DockedIsland({
  ref,
  count,
  speaking,
  screenShare,
  cameraTracks,
  onUndock,
}: {
  ref: React.Ref<HTMLElement>
  count: number
  speaking: Participant | undefined
  screenShare: TrackReference | undefined
  cameraTracks: TrackReference[]
  onUndock: () => void
}) {
  const expanded = useCallUiStore((s) => s.expanded)
  const toggleExpanded = useCallUiStore((s) => s.toggleExpanded)
  const viewMode = useStore((s) => s.viewMode)
  const split = useWorkspaceLayoutStore((s) => s.split)
  const secondaryContent = useWorkspaceLayoutStore((s) => s.secondaryContent)

  const boardVisible =
    viewMode === 'board' || (split && secondaryContent === 'board')

  return (
    <aside
      ref={ref}
      role="region"
      aria-label="Project call"
      className={`pointer-events-auto absolute right-3 z-40 w-[280px] rounded-xl border border-bord bg-panel/95 shadow-xl backdrop-blur sm:w-[340px] ${
        boardVisible ? 'bottom-44' : 'bottom-3'
      }`}
    >
      <div className="flex h-[52px] items-center gap-2 px-2.5">
        <CallSummary count={count} speaking={speaking} />

        <MediaControls compact />

        {/* below `sm` the bar is already at its width with the media controls
            in it, and a window you drag is not a phone gesture anyway */}
        <BarButton
          onClick={onUndock}
          label="Undock the call into a window you can move and resize"
          title="Undock — drag to move and resize"
          className="hidden sm:flex"
        >
          <IcMaximize size={13} />
        </BarButton>

        <BarButton
          onClick={toggleExpanded}
          pressed={expanded}
          label={expanded ? 'Collapse the call panel' : 'Expand the call panel'}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <IcChevronDown size={13} /> : <IcChevronUp size={13} />}
        </BarButton>
      </div>

      {expanded && (
        <div className="border-t border-bord p-2">
          {screenShare && (
            <div className="mb-2">
              <ParticipantTile trackRef={screenShare} focused />
            </div>
          )}
          {cameraTracks.length === 0 && !screenShare ? (
            <EmptyStage />
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

/** Who is in the call and who is talking — the same in both shapes. */
function CallSummary({
  count,
  speaking,
}: {
  count: number
  speaking: Participant | undefined
}) {
  return (
    <>
      <span
        className="flex flex-none items-center gap-1.5 text-[11px] font-semibold text-[#14ae5c]"
        title="You are connected to the project call"
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#14ae5c]" />
        Call
      </span>

      <span className="flex flex-none items-center gap-1 text-[11px] text-muted">
        <IcUsers size={12} aria-hidden />
        {count}
        <span className="sr-only">
          {count === 1 ? 'participant' : 'participants'} in the call
        </span>
      </span>

      <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
        {speaking ? `${speaking.name || speaking.identity} is speaking` : ''}
      </span>
    </>
  )
}

function BarButton({
  onClick,
  label,
  title,
  pressed,
  className = 'flex',
  children,
}: {
  onClick: () => void
  label: string
  title: string
  pressed?: boolean
  /** carries the display utility, so a button can be dropped below a breakpoint */
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={pressed}
      aria-label={label}
      title={title}
      className={`flex-none cursor-pointer items-center justify-center rounded-md px-1 py-1.5 text-muted hover:bg-panel2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${className}`}
    >
      {children}
    </button>
  )
}
