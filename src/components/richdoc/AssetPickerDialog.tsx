import { useMemo, useState } from 'react'
import type { AssetDoc } from '@/types/model'
import { useStore } from '@/store/useStore'
import { formatBytes } from '@/lib/media'
import { KIND_ICONS, KIND_LABEL } from '@/components/assetKinds'
import { IcSearch, IcX } from '@/components/Icons'

/** Modal listing vault assets; used by slash commands / toolbar to embed one. */
export function AssetPickerDialog({
  open,
  onPick,
  onClose,
}: {
  open: boolean
  onPick: (asset: AssetDoc) => void
  onClose: () => void
}) {
  const assets = useStore((s) => s.assets)
  const [query, setQuery] = useState('')

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return Object.values(assets)
      .filter((a) => !q || a.name.toLowerCase().includes(q))
      .sort((a, b) => b.importedAt - a.importedAt)
  }, [assets, query])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-96 flex-col rounded-xl border border-bord bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-bord px-3 py-2">
          <span className="text-xs font-semibold">Embed an asset</span>
          <div className="flex-1" />
          <button className="icon-btn" onClick={onClose} title="Close">
            <IcX size={13} />
          </button>
        </div>
        <div className="relative px-3 py-2">
          <span className="pointer-events-none absolute top-1/2 left-5.5 -translate-y-1/2 text-muted">
            <IcSearch size={12} />
          </span>
          <input
            autoFocus
            className="field pl-7"
            placeholder="Search assets…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {list.length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted">
              No assets in the vault yet — import files from the sidebar first.
            </div>
          )}
          {list.map((a) => {
            const Icon = KIND_ICONS[a.kind]
            return (
              <button
                key={a.id}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-panel2"
                onClick={() => onPick(a)}
              >
                <Icon size={14} className="flex-none text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs">{a.name}</span>
                  <span className="block truncate text-[10.5px] text-muted">
                    {KIND_LABEL[a.kind]} · {formatBytes(a.size)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
