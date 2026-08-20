import { useCall } from './CallProvider'
import { useI18n } from '@/lib/i18n'
import { IcMic, IcRefresh } from '@/components/Icons'

/**
 * The call's entry point, in the topbar's global-actions cluster.
 *
 * It is deliberately distinct from the presence avatars beside it: those show
 * who is *in the project*, this shows whether you are *in the call*. Being
 * online is not being on the call, and the labels say so.
 *
 * When calls are not configured (or you are signed out) the control is
 * disabled and explains why — it never pretends a call is available.
 *
 * `labelled` is decided by the bar (see lib/layout/topBarFit): the button also
 * lives inside the "···" panel, which is portalled out of the header, so a
 * container query cannot answer "is there room for the word" for both places.
 */
export function JoinCallButton({ labelled = true }: { labelled?: boolean }) {
  const { status, unavailable, unavailableMessage, join, error } = useCall()
  const t = useI18n()

  // while connected the CallIsland owns the controls; keep the topbar quiet
  if (status === 'connected') {
    return (
      <span
        className="flex items-center gap-1.5 rounded-full border border-[#14ae5c]/40 bg-panel2 px-2 py-1 text-[10px] font-medium whitespace-nowrap text-[#14ae5c]"
        title={t.call.inCallTitle}
      >
        <span aria-hidden className="h-1.5 w-1.5 flex-none rounded-full bg-[#14ae5c]" />
        {labelled && t.call.inCall}
      </span>
    )
  }

  const connecting = status === 'connecting'
  const disabled = !!unavailable || connecting
  const title = unavailable
    ? unavailableMessage
    : error
      ? t.call.retryTitle(error)
      : t.call.joinTitle

  return (
    <button
      className="btn"
      onClick={() => void join()}
      disabled={disabled}
      aria-label={unavailable ? t.call.unavailableAria(unavailableMessage) : t.call.joinAria}
      title={title}
    >
      {connecting ? <IcRefresh size={13} className="animate-spin" /> : <IcMic size={13} />}
      {labelled && <span>{connecting ? t.call.joining : t.call.join}</span>}
    </button>
  )
}
