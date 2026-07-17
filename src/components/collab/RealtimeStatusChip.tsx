import { useState } from 'react'
import { useCrdtStore, REALTIME_SETUP_INSTRUCTIONS } from '@/lib/crdt/crdtStore'
import { ROLE_LABEL, type RealtimeStatus } from '@/types/collab'
import {
  IcAlert,
  IcCheck,
  IcCloudOff,
  IcInfo,
  IcLock,
  IcRefresh,
  IcWifiOff,
} from '@/components/Icons'

/**
 * RealtimeStatusChip — the top-bar truth about realtime collaboration.
 *
 * Every state is shown as-is: when no backend is configured the chip
 * says so and the popover explains how to set one up, instead of
 * pretending a connection exists. When connected it reports the
 * server-acknowledged role and any queued offline changes.
 *
 * A11Y-2: state is carried by an ICON (shape) + label text, never colour
 * alone — statuses that share a colour (e.g. connecting vs sign-in, both
 * amber) are still distinguishable, and the accessible name always spells
 * the state out.
 */

type IconCmp = (p: { size?: number; className?: string }) => React.ReactNode

const STATUS_META: Record<
  RealtimeStatus,
  { label: string; dot: string; Icon: IconCmp; pulse?: boolean }
> = {
  unconfigured: { label: 'Realtime off', dot: 'var(--muted)', Icon: IcCloudOff },
  'no-account': { label: 'Realtime: sign in', dot: '#ffa629', Icon: IcInfo },
  inactive: { label: 'Realtime idle', dot: 'var(--muted)', Icon: IcCloudOff },
  connecting: { label: 'Connecting…', dot: '#ffa629', Icon: IcRefresh, pulse: true },
  connected: { label: 'Live', dot: '#14ae5c', Icon: IcCheck },
  reconnecting: { label: 'Reconnecting…', dot: '#ffa629', Icon: IcRefresh, pulse: true },
  offline: { label: 'Offline', dot: 'var(--muted)', Icon: IcWifiOff },
  unauthorized: { label: 'No access', dot: '#f24822', Icon: IcLock },
  error: { label: 'Realtime error', dot: '#f24822', Icon: IcAlert },
}

export function RealtimeStatusChip() {
  const status = useCrdtStore((s) => s.status)
  const detail = useCrdtStore((s) => s.detail)
  const pendingUpdates = useCrdtStore((s) => s.pendingUpdates)
  const serverRole = useCrdtStore((s) => s.serverRole)
  const [open, setOpen] = useState(false)
  const meta = STATUS_META[status]
  const Icon = meta.Icon

  return (
    <div className="relative">
      <button
        className="btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Realtime collaboration: ${meta.label}`}
        title={detail ?? `Realtime collaboration: ${meta.label}`}
      >
        <span
          className={meta.pulse ? 'flex animate-pulse' : 'flex'}
          style={{ color: meta.dot }}
          aria-hidden
        >
          <Icon size={13} />
        </span>
        <span className="hidden lg:inline">{meta.label}</span>
        {pendingUpdates > 0 && status !== 'connected' && (
          <span className="rounded-full bg-panel2 px-1.5 text-[9.5px] font-bold text-muted">
            {pendingUpdates > 99 ? '99+' : pendingUpdates}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close realtime status"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-label="Realtime collaboration status"
            className="absolute right-0 z-50 mt-1.5 w-72 rounded-xl border border-bord bg-panel p-3 text-xs shadow-xl"
          >
            <div className="mb-1 flex items-center gap-2">
              <span style={{ color: meta.dot }} aria-hidden>
                <Icon size={14} />
              </span>
              <span className="font-semibold">{meta.label}</span>
              {serverRole && status === 'connected' && (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
                  {ROLE_LABEL[serverRole]} (server-verified)
                </span>
              )}
            </div>

            {detail && <p className="mb-2 leading-relaxed text-muted">{detail}</p>}

            {status === 'connected' && (
              <p className="text-muted">
                {pendingUpdates > 0
                  ? `${pendingUpdates} change${pendingUpdates === 1 ? '' : 's'} queued for sync…`
                  : 'All changes synced. Documents, code and boards merge live across devices.'}
              </p>
            )}

            {status === 'offline' && (
              <p className="text-muted">
                Edits keep working offline and merge deterministically when the
                connection returns
                {pendingUpdates > 0
                  ? ` (${pendingUpdates} queued so far).`
                  : '.'}
              </p>
            )}

            {status === 'unconfigured' && (
              <>
                <p className="mb-2 leading-relaxed text-muted">
                  Cross-device realtime is not configured in this deployment.
                  Tabs of this browser still collaborate live; other devices
                  sync through Google Drive. To enable true realtime:
                </p>
                <ol className="flex list-decimal flex-col gap-1 pl-4 text-[11px] leading-snug text-muted">
                  {REALTIME_SETUP_INSTRUCTIONS.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </>
            )}

            {status === 'no-account' && (
              <p className="leading-relaxed text-muted">
                The realtime backend is configured, but it verifies identity
                through Google. Sign in with Google to join project rooms.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
