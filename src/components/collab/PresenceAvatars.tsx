import { usePeers } from '@/lib/collab/useCollab'
import type { PresencePeer } from '@/types/collab'

/**
 * PresenceAvatars — stacked avatars of everyone active in this project,
 * shown in the top bar. Tooltip says where each person is.
 */

function locationLabel(peer: PresencePeer): string {
  if (peer.editing) return `editing ${peer.editing.title}`
  if (peer.location.entityTitle) return `viewing ${peer.location.entityTitle}`
  return `in ${peer.location.mode} view`
}

function PeerAvatar({ peer }: { peer: PresencePeer }) {
  return (
    <span
      className="relative -ml-1.5 flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 bg-panel2 text-[10px] font-bold first:ml-0"
      style={{ borderColor: peer.color }}
      title={`${peer.name} — ${locationLabel(peer)}`}
    >
      {peer.avatarUrl ? (
        <img src={peer.avatarUrl} alt={peer.name} className="h-full w-full object-cover" />
      ) : (
        <span style={{ color: peer.color }}>{peer.name.slice(0, 1).toUpperCase()}</span>
      )}
      {peer.editing && (
        <span
          className="absolute right-0 bottom-0 h-1.5 w-1.5 rounded-full"
          style={{ background: peer.color }}
        />
      )}
    </span>
  )
}

export function PresenceAvatars() {
  const peers = usePeers()
  if (!peers.length) return null
  const shown = peers.slice(0, 4)
  const extra = peers.length - shown.length
  return (
    <div
      className="flex items-center"
      aria-label={`${peers.length} other ${peers.length === 1 ? 'person' : 'people'} active in this project`}
    >
      {shown.map((p) => (
        <PeerAvatar key={p.sessionId} peer={p} />
      ))}
      {extra > 0 && (
        <span className="-ml-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-bord bg-panel2 text-[9px] font-bold text-muted">
          +{extra}
        </span>
      )}
    </div>
  )
}
