import type { NodeProps } from '@xyflow/react'
import type { BoardNode } from '@/types/model'
import { useStore } from '@/store/useStore'
import { usePhotoStore } from '@/store/photoStore'
import { PhotoScenePreview } from '@/components/photo/PhotoSceneRender'
import { CardChrome } from './CardChrome'
import { IcCamera, IcExternal } from '@/components/Icons'

type Props = NodeProps<BoardNode>

/**
 * Live mirror of the project's Photo-mode set on a board: renders the
 * active shot (lighting included) fit-to-bounds and follows edits in real
 * time. The scene itself is edited only in Photo mode — the card is a
 * window, so it stores no payload of its own.
 */
export function PhotoCardNode({ data, selected }: Props) {
  const projectId = useStore((s) => s.activeProjectId)
  const setViewMode = useStore((s) => s.setViewMode)

  // live flat scene when Photo mode has loaded this project, else snapshot
  const liveShots = usePhotoStore((s) => (s.projectId === projectId ? s.shots : undefined))
  const liveActiveId = usePhotoStore((s) =>
    s.projectId === projectId ? s.activeShotId : undefined,
  )
  const stored = usePhotoStore((s) => s.scenes[projectId])
  const shots = liveShots ?? stored?.shots ?? []
  const activeShotId = liveActiveId ?? stored?.activeShotId ?? null
  const shot = shots.find((sh) => sh.id === activeShotId) ?? shots[0]

  return (
    <CardChrome
      data={data}
      selected={selected}
      icon={<IcCamera size={13} />}
      title={shot ? shot.name : 'Photo scene'}
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
            <PhotoScenePreview
              shots={shots}
              shotId={activeShotId}
              className="h-full w-full"
            />
          </div>
          <div className="flex items-center justify-between border-t border-bord px-3 py-1.5 text-[10px] text-muted">
            <span>
              Shot #{shot.number} · {shot.elements.length} element
              {shot.elements.length === 1 ? '' : 's'}
            </span>
            <span>
              {shots.length} shot{shots.length === 1 ? '' : 's'}
            </span>
          </div>
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
