import { VideoTrack, type TrackReference } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { IcMicOff, IcScreenShare } from '@/components/Icons'

/**
 * One participant in the call filmstrip. Falls back to an initials avatar when
 * the camera is off — a tile is never an empty black rectangle — and carries
 * mic/screen-share state as icons, not colour.
 */
export function ParticipantTile({
  trackRef,
  focused = false,
}: {
  trackRef: TrackReference
  focused?: boolean
}) {
  const participant = trackRef.participant
  const isScreenShare = trackRef.source === Track.Source.ScreenShare
  const name = participant.name || participant.identity
  const hasVideo = !!trackRef.publication?.track && !trackRef.publication.isMuted
  const micMuted = !participant.isMicrophoneEnabled

  return (
    <div
      className={`relative flex-none overflow-hidden rounded-lg border bg-panel2 ${
        focused ? 'aspect-video w-full border-accent/50' : 'aspect-video w-24 border-bord'
      }`}
    >
      {hasVideo ? (
        <VideoTrack
          trackRef={trackRef}
          className="h-full w-full object-cover"
          // a screen share must stay readable; a face may be cropped
          style={isScreenShare ? { objectFit: 'contain' } : undefined}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-panel text-[11px] font-semibold text-muted">
            {initials(name)}
          </span>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1">
        {isScreenShare && <IcScreenShare size={10} className="flex-none text-white" />}
        {!isScreenShare && micMuted && (
          <IcMicOff size={10} className="flex-none text-white" aria-hidden />
        )}
        <span className="truncate text-[9px] font-medium text-white">
          {isScreenShare ? `${name} — screen` : name}
        </span>
      </div>

      {/* screen-reader summary, so state is not icon-only */}
      <span className="sr-only">
        {name}
        {isScreenShare ? ' is sharing their screen' : micMuted ? ', microphone muted' : ''}
        {!hasVideo && !isScreenShare ? ', camera off' : ''}
      </span>
    </div>
  )
}

function initials(name: string): string {
  const parts = name.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '')
  return letters.join('') || '?'
}
