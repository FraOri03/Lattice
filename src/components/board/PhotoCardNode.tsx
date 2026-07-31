import type { NodeProps } from '@xyflow/react'
import type { BoardNode } from '@/types/model'
import { useStore } from '@/store/useStore'
import { usePhotoScene } from '@/lib/photo/usePhotoScene'
import { resolveCardShot } from '@/lib/photo/shots'
import { PhotoScenePreview } from '@/components/photo/PhotoSceneRender'
import { CardChrome } from './CardChrome'
import { IcCamera, IcExternal } from '@/components/Icons'

type Props = NodeProps<BoardNode>

/**
 * Window onto one shot of the project's Photo-mode set: renders its
 * layout and lighting fit-to-bounds, and follows edits in real time. The
 * scene itself is only edited in Photo mode.
 *
 * A card either PINS a shot (data.shotId, chosen in the Inspector) or
 * follows whichever shot the editor has open. Pinning is what lets one
 * board show several setups side by side — an unpinned card mirrors the
 * editor's cursor, so every unpinned card shows the same thing.
 */
export function PhotoCardNode({ id, data, selected }: Props) {
  const projectId = useStore((s) => s.activeProjectId)
  const setViewMode = useStore((s) => s.setViewMode)
  const updateCardData = useStore((s) => s.updateCardData)

  const { shots, activeShotId } = usePhotoScene(projectId)
  const resolved = resolveCardShot(shots, activeShotId, data.shotId)
  const shot = resolved.kind === 'active' || resolved.kind === 'pinned' ? resolved.shot : null
  const pinned = resolved.kind === 'pinned'
  const sourceHint = pinned
    ? 'This card always shows this shot'
    : 'This card follows the shot open in Photo mode'

  return (
    <CardChrome
      data={data}
      selected={selected}
      icon={<IcCamera size={13} />}
      title={shot ? shot.name : resolved.kind === 'missing' ? 'Shot deleted' : 'Photo scene'}
      minWidth={240}
      minHeight={180}
      actions={
        <button
          className="icon-btn h-5 w-5"
          title="Open Photo mode"
          aria-label="Open Photo mode"
          onClick={() => setViewMode('photo')}
        >
          <IcExternal size={11} />
        </button>
      }
    >
      {shot ? (
        <div
          className="flex h-full flex-col"
          onDoubleClick={() => setViewMode('photo')}
          title="Double-click to open Photo mode"
        >
          <div className="min-h-0 w-full flex-1 bg-bg">
            <PhotoScenePreview shots={shots} shotId={shot.id} className="h-full w-full" />
          </div>
          <div className="flex items-center justify-between border-t border-bord px-3 py-1.5 text-[10px] text-muted">
            <span>
              Shot #{shot.number} · {shot.elements.length} element
              {shot.elements.length === 1 ? '' : 's'}
            </span>
            <span title={sourceHint}>
              {pinned ? 'Pinned' : 'Following editor'} · {shots.length} shot
              {shots.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      ) : resolved.kind === 'missing' ? (
        <div className="placeholder">
          <IcCamera size={22} />
          The pinned shot was deleted from this scene
          <button
            className="btn nodrag"
            onClick={() => updateCardData(id, { shotId: undefined })}
          >
            Follow the active shot
          </button>
        </div>
      ) : (
        <div className="placeholder">
          <IcCamera size={22} />
          No photo scene in this project yet
          <button className="btn nodrag" onClick={() => setViewMode('photo')}>
            Open Photo mode
          </button>
        </div>
      )}
    </CardChrome>
  )
}
