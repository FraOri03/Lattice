import type { TrackReference } from '@livekit/components-react'
import { ParticipantTile } from './ParticipantTile'

/**
 * The free window's video area. Unlike the docked filmstrip's fixed 96px tiles
 * these fill the space the user gave the window — making the call bigger is
 * the whole reason to undock it.
 */
export function CallStage({
  screenShare,
  cameraTracks,
}: {
  screenShare: TrackReference | undefined
  cameraTracks: TrackReference[]
}) {
  return (
    <div className="flex h-full flex-col gap-1.5 overflow-y-auto p-2">
      {screenShare && <ParticipantTile trackRef={screenShare} focused />}

      {cameraTracks.length > 0 ? (
        <div
          role="list"
          aria-label="Call participants"
          className="grid gap-1.5"
          style={{
            // a shared screen keeps the faces small beside it; on their own
            // they take as much width as the window can give them
            gridTemplateColumns: `repeat(auto-fit, minmax(${screenShare ? 96 : 150}px, 1fr))`,
          }}
        >
          {cameraTracks.map((t) => (
            <div role="listitem" key={`${t.participant.identity}-${t.source}`}>
              <ParticipantTile trackRef={t} fill />
            </div>
          ))}
        </div>
      ) : (
        !screenShare && <EmptyStage />
      )}
    </div>
  )
}

/** Nobody's camera is on. Said once, in both shapes of the island. */
export function EmptyStage() {
  return (
    <p className="px-1 py-2 text-[11px] text-muted">
      No one has a camera on. Audio still works — turn your camera on from the
      controls above.
    </p>
  )
}
