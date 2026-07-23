import { useCall } from './CallProvider'
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
 */
export function JoinCallButton() {
  const { status, unavailable, unavailableMessage, join, error } = useCall()

  // while connected the CallIsland owns the controls; keep the topbar quiet
  if (status === 'connected') {
    return (
      <span
        className="hidden items-center gap-1.5 rounded-full border border-[#14ae5c]/40 bg-panel2 px-2 py-1 text-[10px] font-medium text-[#14ae5c] lg:flex"
        title="You are in the project call — controls are in the call island, bottom right"
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#14ae5c]" />
        In call
      </span>
    )
  }

  const connecting = status === 'connecting'
  const disabled = !!unavailable || connecting
  const title = unavailable
    ? unavailableMessage
    : error
      ? `${error} — click to try again`
      : 'Join the project call — your microphone and camera stay off until you turn them on'

  return (
    <button
      className="btn"
      onClick={() => void join()}
      disabled={disabled}
      aria-label={
        unavailable
          ? `Join call unavailable: ${unavailableMessage}`
          : 'Join the project call'
      }
      title={title}
    >
      {connecting ? <IcRefresh size={13} className="animate-spin" /> : <IcMic size={13} />}
      <span className="hidden lg:inline">{connecting ? 'Joining…' : 'Join call'}</span>
    </button>
  )
}
