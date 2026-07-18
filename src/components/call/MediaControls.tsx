import { useEffect, useRef, useState } from 'react'
import { useMediaDeviceSelect } from '@livekit/components-react'
import { useCall } from './CallProvider'
import {
  IcChevronDown,
  IcMic,
  IcMicOff,
  IcPhoneOff,
  IcScreenShare,
  IcVideo,
  IcVideoOff,
} from '@/components/Icons'

/**
 * Mic / camera / screen share / leave, plus the device menu.
 *
 * Controls the role cannot use are hidden rather than shown broken — but that
 * is only a courtesy: the server already refused those capabilities in the
 * signed token, so hiding them cannot be the security boundary.
 *
 * Every toggle is an `aria-pressed` button whose state is carried by an icon
 * shape (a slashed mic, a slashed camera) and not by colour alone.
 */
export function MediaControls({ compact = false }: { compact?: boolean }) {
  const {
    capabilities,
    micOn,
    cameraOn,
    screenOn,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    leave,
  } = useCall()

  const size = compact ? 14 : 15

  return (
    <div className="flex items-center gap-0.5">
      {capabilities?.audio && (
        <ControlButton
          onClick={() => void toggleMic()}
          active={micOn}
          label={micOn ? 'Mute microphone' : 'Unmute microphone'}
          title={micOn ? 'Mute microphone' : 'Unmute microphone'}
        >
          {micOn ? <IcMic size={size} /> : <IcMicOff size={size} />}
        </ControlButton>
      )}
      {capabilities?.video && (
        <ControlButton
          onClick={() => void toggleCamera()}
          active={cameraOn}
          label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
          title={cameraOn ? 'Turn camera off' : 'Turn camera on'}
        >
          {cameraOn ? <IcVideo size={size} /> : <IcVideoOff size={size} />}
        </ControlButton>
      )}
      {capabilities?.screenShare && (
        <ControlButton
          onClick={() => void toggleScreenShare()}
          active={screenOn}
          label={screenOn ? 'Stop sharing your screen' : 'Share your screen'}
          title={screenOn ? 'Stop sharing your screen' : 'Share your screen'}
        >
          <IcScreenShare size={size} />
        </ControlButton>
      )}
      <DeviceMenu />
      <button
        type="button"
        onClick={() => void leave()}
        aria-label="Leave the call"
        title="Leave the call"
        className="ml-0.5 flex cursor-pointer items-center justify-center rounded-md px-2 py-1.5 text-[#f24822] hover:bg-[#f24822]/15 focus-visible:ring-2 focus-visible:ring-[#f24822] focus-visible:outline-none"
      >
        <IcPhoneOff size={size} />
      </button>
    </div>
  )
}

function ControlButton({
  onClick,
  active,
  label,
  title,
  children,
}: {
  onClick: () => void
  active: boolean
  label: string
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={title}
      className={`flex cursor-pointer items-center justify-center rounded-md px-2 py-1.5 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none ${
        active ? 'bg-panel2 text-ink' : 'text-muted hover:bg-panel2 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Input picker. Devices are only enumerated when the menu is opened, so simply
 * being in a call never touches the camera or the microphone.
 */
function DeviceMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Audio and video devices"
        title="Audio and video devices"
        className="flex cursor-pointer items-center justify-center rounded-md px-1 py-1.5 text-muted hover:bg-panel2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <IcChevronDown size={12} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Devices"
          className="absolute right-0 bottom-9 z-50 w-60 rounded-xl border border-bord bg-panel p-1 shadow-xl"
        >
          <DeviceList kind="audioinput" label="Microphone" />
          <DeviceList kind="videoinput" label="Camera" />
        </div>
      )}
    </div>
  )
}

function DeviceList({ kind, label }: { kind: MediaDeviceKind; label: string }) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind })
  return (
    <div className="mb-1 last:mb-0">
      <p className="px-2 py-1 text-[10px] font-semibold tracking-widest text-muted uppercase">
        {label}
      </p>
      {devices.length === 0 && (
        <p className="px-2 pb-1 text-[11px] text-muted">
          No device found yet — turn {label.toLowerCase()} on once to let the browser
          list it.
        </p>
      )}
      {devices.map((d, i) => (
        <button
          key={d.deviceId || i}
          role="menuitemradio"
          aria-checked={d.deviceId === activeDeviceId}
          className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-muted hover:bg-panel2 hover:text-ink focus:bg-panel2 focus:outline-none"
          onClick={() => void setActiveMediaDevice(d.deviceId)}
        >
          <span className="flex-1 truncate">{d.label || `${label} ${i + 1}`}</span>
          {d.deviceId === activeDeviceId && <span aria-hidden>✓</span>}
        </button>
      ))}
    </div>
  )
}
