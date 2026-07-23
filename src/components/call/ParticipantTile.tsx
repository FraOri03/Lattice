import { VideoTrack, type TrackReference } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { IcMicOff, IcScreenShare } from '@/components/Icons'

/**
 * One participant in the call. Falls back to an initials avatar when the camera
 * is off — a tile is never an empty black rectangle — and carries mic /
 * screen-share state as icons, not colour.
 *
 * `strip` is the small filmstrip thumbnail; `stage` is the enlarged view. When
 * `onSelect` is given the tile becomes a real button, so enlarging a webcam is
 * reachable from the keyboard too.
 */
export function ParticipantTile({
  trackRef,
  variant = 'strip',
  selected = false,
  onSelect,
}: {
  trackRef: TrackReference
  variant?: 'strip' | 'stage'
  selected?: boolean
  onSelect?: () => void
}) {
  const participant = trackRef.participant
  const isScreenShare = trackRef.source === Track.Source.ScreenShare
  const name = participant.name || participant.identity
  const hasVideo = !!trackRef.publication?.track && !trackRef.publication.isMuted
  const micMuted = !participant.isMicrophoneEnabled
  const stage = variant === 'stage'

  const label = isScreenShare ? `${name} — screen` : name
  const description = `${name}${
    isScreenShare
      ? ' is sharing their screen'
      : micMuted
        ? ', microphone muted'
        : ''
  }${!hasVideo && !isScreenShare ? ', camera off' : ''}`

  const body = (
    <>
      {hasVideo ? (
        <VideoTrack
          trackRef={trackRef}
          className="h-full w-full"
          // a screen share must stay readable; a face may be cropped
          style={{ objectFit: isScreenShare ? 'contain' : 'cover' }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span
            className={`flex items-center justify-center rounded-full bg-panel font-semibold text-muted ${
              stage ? 'h-14 w-14 text-lg' : 'h-7 w-7 text-[11px]'
            }`}
          >
            {initials(name)}
          </span>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1">
        {isScreenShare && <IcScreenShare size={stage ? 12 : 10} className="flex-none text-white" />}
        {!isScreenShare && micMuted && (
          <IcMicOff size={stage ? 12 : 10} className="flex-none text-white" aria-hidden />
        )}
        <span
          className={`truncate font-medium text-white ${stage ? 'text-[11px]' : 'text-[9px]'}`}
        >
          {label}
        </span>
      </div>
    </>
  )

  const shell = `relative overflow-hidden rounded-lg border bg-panel2 ${
    stage ? 'aspect-video w-full' : 'aspect-video w-24 flex-none'
  } ${selected ? 'border-accent/60 ring-1 ring-accent/40' : 'border-bord'}`

  if (!onSelect) {
    return (
      <div className={shell}>
        {body}
        <span className="sr-only">{description}</span>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={selected ? `${description}. Currently enlarged` : `Enlarge ${description}`}
      title={selected ? `${label} — enlarged` : `Enlarge ${label}`}
      className={`${shell} cursor-pointer focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none`}
    >
      {body}
    </button>
  )
}

function initials(name: string): string {
  const parts = name.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean)
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '')
  return letters.join('') || '?'
}
