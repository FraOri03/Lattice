import { useState, type ReactNode } from 'react'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { useSyncStore } from '@/lib/sync/syncStore'
import { useI18n } from '@/lib/i18n'
import { formatBytes } from '@/lib/media'
import { IcChevronDown, IcInfo, IcSettings } from '@/components/Icons'

/**
 * The three status bars at the foot of the dashboard's navigation.
 *
 * These are 13.3's **shape (1), "reserved and named"**: the row exists, states
 * that the integration does not, and explains why nothing is estimated. The
 * document calls this "the right default for anything structural", and names
 * these exact two bars as the pattern to copy.
 *
 * Which is why two of them are mostly dashes, and that is the point rather than
 * an omission:
 *
 * - **RunPod** is phase 21. No key, no integration, so no balance — and a
 *   balance invented from nothing would be the one thing the bar exists to
 *   avoid.
 * - **System** (CPU, memory, GPU, disk, network) is marked *not planned* in
 *   13.3: a browser cannot read any of it without a native host. The row says
 *   so instead of reporting a plausible-looking guess.
 * - **Storage** is the partial one. The vault's own size and file count are
 *   real and computed here; the Drive mirror's state is real; the trash figure
 *   waits on the soft-delete model (#115) and free space has no source, so both
 *   are reserved rather than filled with something that reads true.
 */

function StatusBar({
  label,
  value,
  accent,
  children,
}: {
  label: string
  /** The one-line reading, shown whether the bar is open or shut. */
  value: string
  /** A live reading gets the accent dot; a reserved one stays grey. */
  accent?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-t border-bord px-3 py-2">
      <button
        className="flex w-full min-h-6 cursor-pointer items-center gap-2 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 flex-none rounded-full ${accent ? 'bg-accent' : 'bg-muted/50'}`}
        />
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">{label}</span>
        <span className="flex-none text-[11px] font-semibold">{value}</span>
        <IcChevronDown
          size={11}
          className={`flex-none text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && <div className="mt-2 rounded-lg bg-panel2 p-2.5">{children}</div>}
    </div>
  )
}

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="min-w-0 truncate text-[10.5px] text-muted">{label}</span>
      <span className="flex-none text-[10.5px] font-semibold">{value}</span>
    </div>
  )
}

function Why({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-[10px] leading-relaxed text-muted">{children}</p>
}

export function SidebarStatus() {
  const t = useI18n()
  const openSettings = useStore((s) => s.openSettings)
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen)
  const provider = useSyncStore((s) => s.provider)
  const assets = useStore((s) => s.assets)
  const notes = useStore((s) => s.notes)
  const docs = useStore((s) => s.docs)
  const sheetDocs = useStore((s) => s.sheetDocs)
  const presentDocs = useStore((s) => s.presentDocs)
  const codeDocs = useStore((s) => s.codeDocs)

  const bytes = Object.values(assets).reduce((sum, a) => sum + (a.size ?? 0), 0)
  const files =
    Object.keys(assets).length +
    Object.keys(notes).length +
    Object.keys(docs).length +
    Object.keys(sheetDocs).length +
    Object.keys(presentDocs).length +
    Object.keys(codeDocs).length
  const synced = provider !== 'none'
  const dash = '—'

  return (
    <div className="flex-none">
      <StatusBar label={t.status.runpod} value={t.status.off}>
        <Reading label={t.status.integration} value={t.status.notImplemented} />
        <Reading label={t.status.apiKey} value={t.status.notSet} />
        <Reading label={t.status.balance} value={dash} />
        <Reading label={t.status.jobs} value={t.status.disabled} />
        <Why>{t.status.runpodWhy}</Why>
      </StatusBar>

      <StatusBar label={t.status.system} value={t.status.off}>
        {[t.status.cpu, t.status.memory, t.status.gpu, t.status.disk, t.status.network].map(
          (label) => (
            <Reading key={label} label={label} value={dash} />
          ),
        )}
        <Why>{t.status.systemWhy}</Why>
      </StatusBar>

      <StatusBar
        label={t.status.storage}
        value={t.status.storageLine(formatBytes(bytes) || '0 B', synced)}
        accent
      >
        <Reading label={t.status.localVault} value={t.status.vaultLine(formatBytes(bytes) || '0 B', files)} />
        <Reading
          label={t.status.driveMirror}
          value={synced ? t.status.connected : t.status.notConnected}
        />
        {/* the trash figure and free space are the two readings with no source:
            one waits on the soft-delete model, the other on nothing a browser
            can answer about the disk */}
        <Reading label={t.status.trash} value={dash} />
        <Reading label={t.status.freeSpace} value={dash} />
        <Why>{t.status.storageWhy}</Why>
      </StatusBar>

      <div className="flex items-center gap-1 border-t border-bord px-2 py-2">
        <button
          className="icon-btn h-7 w-7"
          onClick={() => openSettings()}
          aria-label={t.settings.title}
          title={t.settings.title}
        >
          <IcSettings size={14} />
        </button>
        <button
          className="icon-btn h-7 w-7"
          onClick={() => setShortcutsOpen(true)}
          aria-label={t.palette.commands.shortcuts}
          title={t.palette.commands.shortcuts}
        >
          <IcInfo size={14} />
        </button>
      </div>
    </div>
  )
}
