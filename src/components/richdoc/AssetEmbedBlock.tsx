import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useStore } from '@/store/useStore'
import { useAssetUrl } from '@/lib/assets/AssetRegistry'
import { formatBytes } from '@/lib/media'
import { KIND_ICONS, KIND_LABEL } from '@/components/assetKinds'
import { ThreeDViewer } from '@/components/preview/ThreeDViewerLazy'
import { IcExternal, IcX } from '@/components/Icons'

/**
 * React NodeView for the assetEmbed node: any vault asset rendered
 * inline in a rich document. The slim header doubles as the block's
 * drag handle.
 */
export function AssetEmbedBlock({ node, selected, deleteNode }: NodeViewProps) {
  const assetId = String(node.attrs.assetId ?? '')
  const asset = useStore((s) => s.assets[assetId])
  const openAsset = useStore((s) => s.openAsset)
  const url = useAssetUrl(asset?.id)

  if (!asset) {
    return (
      <NodeViewWrapper className="asset-embed-block is-missing">
        <div className="embed-header" data-drag-handle>
          <span className="embed-title">Missing asset</span>
          <button className="icon-btn h-5 w-5" onClick={deleteNode} title="Remove embed">
            <IcX size={11} />
          </button>
        </div>
        <div className="placeholder">This asset was removed from the vault</div>
      </NodeViewWrapper>
    )
  }

  const Icon = KIND_ICONS[asset.kind]

  let body: React.ReactNode
  switch (asset.kind) {
    case 'image':
      body = url ? (
        <img src={url} alt={asset.name} className="w-full rounded-b-lg" draggable={false} />
      ) : null
      break
    case 'pdf':
      body = url ? (
        <iframe src={url} title={asset.name} className="h-96 w-full border-0 bg-white" />
      ) : null
      break
    case 'video':
      body = url ? <video src={url} controls className="w-full bg-black" /> : null
      break
    case 'audio':
      body = url ? <audio src={url} controls className="w-full p-2" /> : null
      break
    case 'model3d':
      body = (
        <div className="h-72 w-full">
          <ThreeDViewer url={url} ext={asset.ext} asset={asset} />
        </div>
      )
      break
    default:
      body = (
        <div className="flex items-center gap-3 px-3 py-2.5 text-xs text-muted">
          <Icon size={16} />
          <span className="min-w-0 flex-1 truncate">
            {KIND_LABEL[asset.kind]} · {formatBytes(asset.size)}
          </span>
        </div>
      )
  }

  return (
    <NodeViewWrapper
      className={`asset-embed-block ${selected ? 'is-selected' : ''}`}
    >
      <div className="embed-header" data-drag-handle title="Drag to move this block">
        <Icon size={12} />
        <span className="embed-title">{asset.name}</span>
        <button
          className="icon-btn h-5 w-5"
          onClick={() => openAsset(asset.id)}
          title="Open in preview"
        >
          <IcExternal size={11} />
        </button>
        <button className="icon-btn h-5 w-5" onClick={deleteNode} title="Remove embed">
          <IcX size={11} />
        </button>
      </div>
      {body}
    </NodeViewWrapper>
  )
}
