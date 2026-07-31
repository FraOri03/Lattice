import type { VideoConversionState } from '@/types/model'
import { describeVideoConversion } from '@/lib/video/videoConversion'
import { IcAlert, IcInfo, IcRefresh } from '@/components/Icons'

/**
 * Small status pill for a video's upload-conversion lifecycle, shown over
 * the card/preview until conversion finishes. Renders nothing once done
 * (or when there is no conversion state at all — e.g. a non-video asset,
 * or a video asset from before this feature existed).
 *
 * Styling mirrors the sync status chip in TopBar.tsx: a rounded pill,
 * muted by default, colored only for states that need attention.
 */
export function VideoConversionBadge({
  state,
  onRetry,
}: {
  state: VideoConversionState | undefined
  onRetry?: () => void
}) {
  if (!state || state.status === 'done') return null

  const label = describeVideoConversion(state)

  if (state.status === 'queued' || state.status === 'converting') {
    return (
      <span
        className="flex items-center gap-1.5 rounded-full border border-bord bg-panel2/90 px-2 py-1 text-[10px] font-medium text-muted backdrop-blur-sm"
        title="Converting to a web-friendly format — the original plays fine while this finishes."
      >
        <IcRefresh size={11} className="animate-spin" /> {label}
      </span>
    )
  }

  if (state.status === 'skipped') {
    return (
      <span
        className="flex items-center gap-1.5 rounded-full border border-bord bg-panel2/90 px-2 py-1 text-[10px] font-medium text-muted backdrop-blur-sm"
        title={label}
      >
        <IcInfo size={11} /> Not converted
      </span>
    )
  }

  // error
  return (
    <span
      className="flex items-center gap-1.5 rounded-full border border-[#f24822]/40 bg-panel2/90 px-2 py-1 text-[10px] font-medium text-[#f24822] backdrop-blur-sm"
      title={label}
    >
      <IcAlert size={11} /> Conversion failed
      {onRetry && (
        <button
          className="cursor-pointer underline decoration-dotted underline-offset-2 hover:no-underline"
          onClick={(e) => {
            e.stopPropagation()
            onRetry()
          }}
        >
          Retry
        </button>
      )}
    </span>
  )
}
