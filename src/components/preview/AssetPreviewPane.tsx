import type { AssetDoc } from '@/types/model'
import { useStore } from '@/store/useStore'
import { downloadAsset } from '@/lib/assets/AssetRegistry'
import { formatBytes } from '@/lib/media'
import { KIND_ICONS, KIND_LABEL } from '@/components/assetKinds'
import { IcDownload, IcX } from '@/components/Icons'
import { AssetPreview } from './previews'

/** Full asset preview pane — takes the document editor's slot when an asset is open. */
export function AssetPreviewPane({ asset }: { asset: AssetDoc }) {
  const renameAsset = useStore((s) => s.renameAsset)
  const closeAsset = useStore((s) => s.closeAsset)
  const Icon = KIND_ICONS[asset.kind]

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col border-r border-bord bg-panel">
      <div className="flex flex-none items-center gap-2 border-b border-bord px-4 py-2">
        <Icon size={15} className="flex-none text-muted" />
        <input
          className="min-w-0 flex-1 bg-transparent text-[15px] font-bold outline-none"
          value={asset.name}
          onChange={(e) => renameAsset(asset.id, e.target.value)}
          placeholder="Untitled asset"
        />
        <span className="flex-none text-[11px] text-muted">
          {KIND_LABEL[asset.kind]} · {formatBytes(asset.size)}
        </span>
        <button
          className="icon-btn"
          title="Download original file"
          onClick={() => void downloadAsset(asset)}
        >
          <IcDownload size={14} />
        </button>
        <button className="icon-btn" title="Close preview" onClick={closeAsset}>
          <IcX size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <AssetPreview asset={asset} />
      </div>
    </section>
  )
}
