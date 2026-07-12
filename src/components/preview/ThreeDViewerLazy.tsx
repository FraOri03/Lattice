import { lazy, Suspense } from 'react'
import type { AssetDoc } from '@/types/model'
import { useInViewport } from '@/lib/perf/useInViewport'
import { useViewerSlot } from '@/lib/perf/useViewerSlot'
import { ThreePlaceholder } from '@/components/board/ThreePlaceholder'

/**
 * Lazy, viewport-gated wrapper around the real three.js asset viewer.
 *
 * PERF-1: every consumer (asset preview pane, doc embed block, board asset
 * card) imports THIS module, never ./ThreeDViewer directly, so three.js only
 * enters via the lazy chunk and stays out of the main bundle.
 *
 * PERF-2: the heavy viewer mounts only while on-screen and within the live-
 * viewer budget, and receives `active` so it renders on-demand (pausing when
 * the tab is hidden). A stable placeholder holds the space otherwise.
 */
const ThreeDViewerImpl = lazy(() =>
  import('./ThreeDViewer').then((m) => ({ default: m.ThreeDViewer })),
)

export function ThreeDViewer({
  url,
  ext,
  asset,
}: {
  url?: string
  ext: string
  asset?: AssetDoc
}) {
  const { ref, onScreen, active } = useInViewport<HTMLDivElement>()
  const slotId = asset?.id ?? url ?? 'model'
  const hasSlot = useViewerSlot(slotId, onScreen)
  const mount = onScreen && hasSlot
  return (
    <div ref={ref} className="relative h-full w-full">
      {mount ? (
        <Suspense fallback={<ThreePlaceholder label="Loading 3D…" />}>
          <ThreeDViewerImpl url={url} ext={ext} asset={asset} active={active} />
        </Suspense>
      ) : (
        <ThreePlaceholder
          label="3D model"
          hint={onScreen ? 'Paused — too many 3D views active' : 'Scroll into view to load'}
        />
      )}
    </div>
  )
}
