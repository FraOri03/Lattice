import { useEffect, useState } from 'react'
import { useUiStore } from '@/store/useUiStore'
import { useAccount } from '@/lib/auth/AccountProvider'
import { useSyncStore } from '@/lib/sync/syncStore'
import { syncEngine } from '@/lib/sync/SyncEngine'
import { authService, GOOGLE_SETUP_INSTRUCTIONS } from '@/lib/auth/AuthService'
import {
  runDriveDiagnostics,
  type DriveCheck,
  type DriveDiagnosticsReport,
} from '@/lib/sync/driveDiagnostics'
import { env, hasGoogleAuth } from '@/lib/env'
import { IcAlert, IcCheck, IcDrive, IcRefresh, IcX } from '@/components/Icons'

/**
 * Google Drive panel — connect/reconnect/disconnect the Drive-backed
 * cloud storage and run honest end-to-end diagnostics. Every state shown
 * here comes from real checks (token, scopes, API, folder); nothing is
 * assumed. When credentials are missing the panel shows the exact setup
 * steps instead of a broken button.
 */
export function DriveDialog() {
  const open = useUiStore((s) => s.driveDialogOpen)
  const setOpen = useUiStore((s) => s.setDriveDialogOpen)
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="flex max-h-[85vh] w-[560px] flex-col overflow-hidden rounded-2xl border border-bord bg-panel shadow-2xl">
        <div className="flex flex-none items-center gap-2 border-b border-bord px-4 py-3">
          <IcDrive size={16} />
          <span className="text-[14px] font-bold">Google Drive — cloud storage</span>
          <div className="flex-1" />
          <button className="icon-btn" onClick={() => setOpen(false)}>
            <IcX size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {hasGoogleAuth ? <DrivePanel /> : <SetupInstructions />}
        </div>
      </div>
    </div>
  )
}

/** Shown when VITE_GOOGLE_CLIENT_ID is missing from the build. */
function SetupInstructions() {
  return (
    <div className="py-2">
      <div className="mb-3 flex items-start gap-2 rounded-lg border border-[#ffa629]/40 bg-[#ffa629]/10 p-3">
        <IcAlert size={14} className="mt-0.5 flex-none text-[#ffa629]" />
        <p className="text-[12px] leading-relaxed">
          Google Drive is unavailable in this deployment:{' '}
          <code className="rounded bg-panel2 px-1 text-[11px]">VITE_GOOGLE_CLIENT_ID</code> was
          empty when this build was made, so the app is running with a local-only account.
          Your work is safe in this browser (IndexedDB) — nothing is lost.
        </p>
      </div>
      <p className="mb-2 text-[12px] font-semibold">To enable Drive sync:</p>
      <ol className="list-decimal space-y-1.5 pl-5 text-[12px] leading-relaxed text-muted">
        {GOOGLE_SETUP_INSTRUCTIONS.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] text-muted">
        Current origin: <code className="rounded bg-panel2 px-1">{window.location.origin}</code>
      </p>
    </div>
  )
}

function DrivePanel() {
  const { account, signIn, error: accountError } = useAccount()
  const sync = useSyncStore()
  const [report, setReport] = useState<DriveDiagnosticsReport | null>(null)
  const [busy, setBusy] = useState<'test' | 'connect' | 'disconnect' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const connected = sync.provider === 'google-drive'
  const hasToken = authService.peekToken() !== null

  const runTest = async () => {
    setBusy('test')
    setActionError(null)
    try {
      setReport(await runDriveDiagnostics())
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Diagnostics failed')
    } finally {
      setBusy(null)
    }
  }

  // run a passive diagnostics pass when the panel opens
  useEffect(() => {
    void runTest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connect = async () => {
    setBusy('connect')
    setActionError(null)
    try {
      if (!account) {
        await signIn() // signIn requests the Drive scope and starts sync
      } else {
        await authService.connectDrive() // fresh consent token
        await syncEngine.restart() // re-verify, then start syncing
      }
      setReport(await runDriveDiagnostics())
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not connect Google Drive')
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async () => {
    setBusy('disconnect')
    setActionError(null)
    try {
      syncEngine.stop()
      await authService.disconnectDrive()
      setReport(await runDriveDiagnostics())
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not disconnect')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <p className="mb-3 text-[12px] leading-relaxed text-muted">
        Lattice stores a synced copy of your vault in a{' '}
        <span className="font-medium text-ink">“{env.driveAppFolder}”</span> folder in your My
        Drive (scope <code className="rounded bg-panel2 px-1 text-[11px]">drive.file</code>: the
        app can only see files it created). Your working copy always stays local — if Drive is
        unreachable, everything keeps working offline in this browser.
      </p>

      {/* actions */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className="btn" disabled={busy !== null} onClick={() => void connect()}>
          <IcDrive size={13} />
          {busy === 'connect'
            ? 'Connecting…'
            : connected
              ? 'Reconnect Drive'
              : hasToken
                ? 'Reconnect Drive'
                : 'Connect Google Drive'}
        </button>
        <button className="btn" disabled={busy !== null} onClick={() => void runTest()}>
          <IcRefresh size={13} className={busy === 'test' ? 'animate-spin' : ''} />
          {busy === 'test' ? 'Testing…' : 'Test Drive connection'}
        </button>
        {(connected || hasToken) && (
          <button
            className="btn text-[#f24822]"
            disabled={busy !== null}
            onClick={() => void disconnect()}
          >
            <IcX size={13} />
            {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect Drive'}
          </button>
        )}
      </div>

      {(actionError ?? accountError) && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-[#f24822]/40 bg-[#f24822]/10 p-2.5 text-[12px] leading-relaxed">
          <IcAlert size={13} className="mt-0.5 flex-none text-[#f24822]" />
          {actionError ?? accountError}
        </div>
      )}

      {/* diagnostics checklist */}
      <div className="insp-h">Diagnostics</div>
      {report ? (
        <>
          <div className="overflow-hidden rounded-lg border border-bord">
            {report.checks.map((c) => (
              <CheckRow key={c.id} check={c} />
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted">
            Checked {new Date(report.checkedAt).toLocaleTimeString()} · origin {report.origin}
            {report.healthy ? ' · all checks passed' : ''}
          </p>
        </>
      ) : (
        <p className="text-[12px] text-muted">Running checks…</p>
      )}
    </div>
  )
}

function CheckRow({ check }: { check: DriveCheck }) {
  const icon =
    check.state === 'ok' ? (
      <IcCheck size={11} className="text-[#14ae5c]" />
    ) : check.state === 'fail' ? (
      <IcX size={11} className="text-[#f24822]" />
    ) : (
      <span className="text-[10px] text-muted">—</span>
    )
  return (
    <div className="flex items-start gap-2 border-b border-bord px-2.5 py-1.5 text-[12px] last:border-b-0">
      <span className="flex h-4 w-4 flex-none items-center justify-center pt-0.5">{icon}</span>
      <span className="w-44 flex-none font-medium">{check.label}</span>
      <span className={`min-w-0 flex-1 ${check.state === 'fail' ? 'text-[#f24822]' : 'text-muted'}`}>
        {check.detail}
      </span>
    </div>
  )
}
