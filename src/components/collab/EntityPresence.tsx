import { usePeers } from '@/lib/collab/useCollab'
import type { PresencePeer } from '@/types/collab'

/**
 * EntityPresence — small contextual presence indicators (Phase 8):
 *  - SheetPeerChips: who is on this spreadsheet and which cell/sheet
 *  - ViewingPeers:  "X is viewing this file" for asset previews
 * Both read the same PresencePeer stream every transport feeds.
 */

/** 0-based column index → A1 letters. */
export function colLetters(c: number): string {
  let s = ''
  let n = c
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

function Chip({ peer, note }: { peer: PresencePeer; note?: string }) {
  return (
    <span
      className="flex h-5 items-center gap-1 rounded-full border px-1.5 text-[10px] font-semibold"
      style={{ borderColor: peer.color, color: peer.color }}
      title={note ? `${peer.name} — ${note}` : peer.name}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: peer.color }}
        aria-hidden
      />
      <span className="max-w-24 truncate">{peer.name}</span>
      {note && <span className="font-normal opacity-80">{note}</span>}
    </span>
  )
}

/** Peers working on the given spreadsheet, with their active cell. */
export function SheetPeerChips({ sheetId }: { sheetId: string }) {
  const peers = usePeers().filter((p) => p.sheetCell?.sheetId === sheetId)
  if (!peers.length) return null
  return (
    <span
      className="ml-auto flex items-center gap-1"
      aria-label={`${peers.length} ${peers.length === 1 ? 'person' : 'people'} on this spreadsheet`}
    >
      {peers.slice(0, 3).map((p) => (
        <Chip
          key={p.sessionId}
          peer={p}
          note={
            p.sheetCell
              ? `${p.sheetCell.sheetName ? p.sheetCell.sheetName + '·' : ''}${colLetters(p.sheetCell.c)}${p.sheetCell.r + 1}`
              : undefined
          }
        />
      ))}
      {peers.length > 3 && (
        <span className="text-[10px] text-muted">+{peers.length - 3}</span>
      )}
    </span>
  )
}

/** Subtle "X is viewing this file" hint for asset previews. */
export function ViewingPeers({ entityId }: { entityId: string }) {
  const peers = usePeers().filter((p) => p.location.entityId === entityId)
  if (!peers.length) return null
  const names = peers.map((p) => p.name)
  const label =
    names.length === 1
      ? `${names[0]} is viewing this file`
      : `${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''} are viewing this file`
  return (
    <span className="flex items-center gap-1.5 text-[10.5px] text-muted" role="status">
      <span className="flex items-center gap-0.5">
        {peers.slice(0, 3).map((p) => (
          <span
            key={p.sessionId}
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: p.color }}
            aria-hidden
          />
        ))}
      </span>
      {label}
    </span>
  )
}
