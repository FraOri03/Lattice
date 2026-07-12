import { IcAlert, IcKeyboard, IcRefresh } from '@/components/Icons'

/** Specific error + recovery. Offers rebuild and the accessible list view as
 * a reduced fallback, so exploration is never fully blocked. */
export function GraphErrorState({
  message,
  onRetry,
  onOpenList,
}: {
  message: string
  onRetry: () => void
  onOpenList: () => void
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg px-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#f24822]/40 bg-panel text-[#f24822]">
        <IcAlert size={24} />
      </span>
      <p className="text-[14px] font-semibold">The project graph could not be built</p>
      <p className="max-w-md rounded-lg border border-bord bg-panel px-3 py-2 text-[11.5px] break-words text-muted">
        {message}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button className="btn" onClick={onRetry}>
          <IcRefresh size={13} /> Rebuild index
        </button>
        <button className="btn" onClick={onOpenList}>
          <IcKeyboard size={13} /> Open list view
        </button>
      </div>
    </div>
  )
}
