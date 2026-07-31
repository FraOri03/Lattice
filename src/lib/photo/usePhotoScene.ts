import { usePhotoStore } from '@/store/photoStore'
import type { PhotoShot } from '@/types/photo'

/**
 * Read a project's Photo-mode scene from outside Photo mode.
 *
 * The store keeps one FLAT scene (the project currently open in the editor)
 * plus a snapshot per project, so a reader has to prefer the live scene
 * when it belongs to the project it is asking about and fall back to the
 * snapshot otherwise. Both the board card and the Inspector need that rule;
 * it lives here so the two can never drift apart.
 *
 * Selectors stay field-by-field on purpose: subscribing to the whole store
 * would re-render every card on each canvas pan.
 */
/** Stable identity, so a project with no scene doesn't churn dependencies. */
const NO_SHOTS: PhotoShot[] = []

export function usePhotoScene(projectId: string): {
  shots: PhotoShot[]
  activeShotId: string | null
} {
  const liveShots = usePhotoStore((s) => (s.projectId === projectId ? s.shots : undefined))
  const liveActiveId = usePhotoStore((s) =>
    s.projectId === projectId ? s.activeShotId : undefined,
  )
  const stored = usePhotoStore((s) => s.scenes[projectId])

  return {
    shots: liveShots ?? stored?.shots ?? NO_SHOTS,
    activeShotId: liveActiveId ?? stored?.activeShotId ?? null,
  }
}
