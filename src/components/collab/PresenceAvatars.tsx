import { usePeers } from '@/lib/collab/useCollab'
import { useCollabMode } from '@/lib/collab/collabPresentation'
import { IcCloud, IcInfo } from '@/components/Icons'
import type { PresencePeer } from '@/types/collab'

/**
 * PresenceAvatars — stacked avatars of everyone active in this project,
 * shown in the top bar. Tooltip says where each person is.
 *
 * COL-1 (issue #9): when cross-device realtime is off, a scope badge marks
 * exactly what "active" means — tabs of this browser, or Drive polling — so
 * the avatars never imply live remote collaboration that isn't configured.
 * The wording comes from the central collabPresentation source of truth.
 */

function locationLabel(peer: PresencePeer): string {
  if (peer.editing) return `editing ${peer.editing.title}`
  if (peer.location.entityTitle) return `viewing ${peer.location.entityTitle}`
  return `in ${peer.location.mode} view`
}

function PeerAvatar({ peer, scope }: { peer: PresencePeer; scope: string }) {
  return (
    <span
      className="relative -ml-1.5 flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border-2 bg-panel2 text-[10px] font-bold first:ml-0"
      style={{ borderColor: peer.color }}
      title={`${peer.name} — ${locationLabel(peer)} · ${scope}`}
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
  const mode = useCollabMode()
  if (!peers.length) return null
  const shown = peers.slice(0, 4)
  const extra = peers.length - shown.length
  const scopeWord =
    mode.tier === 'realtime'
      ? 'live'
      : mode.tier === 'drive'
        ? 'same Google Drive'
        : 'same browser'
  return (
    <div
      className="flex items-center gap-1.5"
      aria-label={`${peers.length} other ${peers.length === 1 ? 'person' : 'people'} active — ${mode.scopeLabel}`}
    >
      <div className="flex items-center">
        {shown.map((p) => (
          <PeerAvatar key={p.sessionId} peer={p} scope={scopeWord} />
        ))}
        {extra > 0 && (
          <span className="-ml-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-bord bg-panel2 text-[9px] font-bold text-muted">
            +{extra}
          </span>
        )}
      </div>
      {!mode.isRealtime && (
        <span
          className="hidden items-center gap-1 rounded-full border border-bord bg-panel2 px-1.5 py-0.5 text-[9.5px] font-medium text-muted xl:flex"
          title={mode.description}
        >
          {mode.tier === 'drive' ? <IcCloud size={11} /> : <IcInfo size={11} />}
          {mode.presenceScope}
        </span>
      )}
    </div>
  )
}
