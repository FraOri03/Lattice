import { useStore } from '@/store/useStore'
import { usePhotoScene } from '@/lib/photo/usePhotoScene'
import { resolveCardShot } from '@/lib/photo/shots'
import type { BoardNode } from '@/types/model'
import { IcEdit } from '@/components/Icons'

const FOLLOW = 'follow-active'

/**
 * Inspector control for a photo card: which shot of the project's scene
 * the card shows.
 *
 * Default is to follow whatever Photo mode has open — which means every
 * unpinned card shows the same shot and changes as you click around the
 * shot list. Pinning is what turns a card into a stable view, and is the
 * only way to put several setups on one board at once.
 */
export function PhotoShotPicker({ node }: { node: BoardNode }) {
  const projectId = useStore((s) => s.activeProjectId)
  const setViewMode = useStore((s) => s.setViewMode)
  const updateCardData = useStore((s) => s.updateCardData)

  const { shots, activeShotId } = usePhotoScene(projectId)
  const resolved = resolveCardShot(shots, activeShotId, node.data.shotId)

  return (
    <>
      <div className="insp-h">Shot shown</div>
      {shots.length ? (
        <select
          className="field"
          value={node.data.shotId ?? FOLLOW}
          onChange={(e) =>
            updateCardData(node.id, {
              shotId: e.target.value === FOLLOW ? undefined : e.target.value,
            })
          }
        >
          <option value={FOLLOW}>Follow the active shot</option>
          {shots.map((shot) => (
            <option key={shot.id} value={shot.id}>
              #{shot.number} — {shot.name}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-xs text-muted">This project has no photo scene yet.</p>
      )}

      {resolved.kind === 'missing' && (
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-[#f24822]">
          The shot this card was pinned to no longer exists. Pick another one,
          or let the card follow the active shot.
        </p>
      )}
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
        Following means the card mirrors the shot open in Photo mode, so every
        unpinned card shows the same one. Pin a shot to keep this card on it —
        that is how one board holds several setups side by side.
      </p>

      <button className="btn mt-2 w-full" onClick={() => setViewMode('photo')}>
        <IcEdit size={12} /> Open Photo mode
      </button>
    </>
  )
}
