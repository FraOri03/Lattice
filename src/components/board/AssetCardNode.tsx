import type { FC } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { AssetDoc, AssetKind, BoardNode } from '@/types/model'
import { useStore } from '@/store/useStore'
import { useAssetUrl } from '@/lib/assets/AssetRegistry'
import { plannedEditorFor } from '@/lib/registry/documents'
import { conversionNoteForAsset } from '@/lib/convert/ConversionService'
import { formatBytes } from '@/lib/media'
import { KIND_ICONS, KIND_LABEL } from '@/components/assetKinds'
import { ThreeDViewer } from '@/components/preview/ThreeDViewer'
import { CardChrome } from './CardChrome'

interface BodyProps {
  asset: AssetDoc
  url?: string
}

const Loading = () => <div className="placeholder">Loading…</div>

const PdfBody: FC<BodyProps> = ({ asset, url }) =>
  url ? (
    <iframe
      src={`${url}#toolbar=0&navpanes=0`}
      title={asset.name}
      className="nodrag nowheel h-full w-full border-0 bg-white"
    />
  ) : (
    <Loading />
  )

const ImageBody: FC<BodyProps> = ({ asset, url }) =>
  url ? (
    <img
      src={url}
      alt={asset.name}
      className="h-full w-full object-cover"
      draggable={false}
    />
  ) : (
    <Loading />
  )

const VideoBody: FC<BodyProps> = ({ url }) =>
  url ? <video src={url} controls className="nodrag h-full w-full bg-black" /> : <Loading />

const AudioBody: FC<BodyProps> = ({ url }) => {
  const Icon = KIND_ICONS.audio
  return (
    <div className="flex h-full items-center gap-3 px-3">
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-panel2 text-muted">
        <Icon size={17} />
      </span>
      {url ? (
        <audio src={url} controls className="nodrag min-w-0 flex-1" />
      ) : (
        <span className="text-xs text-muted">Loading…</span>
      )}
    </div>
  )
}

const Model3DBody: FC<BodyProps> = ({ asset, url }) => (
  <ThreeDViewer url={url} ext={asset.ext} asset={asset} />
)

/** Office files & generic attachments: a tile that says what it is honestly. */
const TileBody: FC<BodyProps> = ({ asset }) => {
  const Icon = KIND_ICONS[asset.kind]
  const editor = plannedEditorFor(asset.kind)
  const conversionNote = conversionNoteForAsset(asset)
  return (
    <div className="flex h-full items-center gap-3 px-4">
      <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-panel2 text-muted">
        <Icon size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-semibold">{asset.name}</div>
        <div className="truncate text-[11px] text-muted">
          {asset.ext ? `${asset.ext.toUpperCase()} · ` : ''}
          {formatBytes(asset.size)}
        </div>
        <div
          className="mt-0.5 truncate text-[10.5px] text-muted"
          title={conversionNote ?? undefined}
        >
          {conversionNote
            ? conversionNote
            : editor && editor.status === 'planned'
              ? `${editor.editorHint} — Phase ${editor.phase}`
              : 'Double-click to preview'}
        </div>
      </div>
    </div>
  )
}

/** BoardCardRenderer registry: asset kind → card body. */
const cardBodyRegistry: Record<AssetKind, FC<BodyProps>> = {
  pdf: PdfBody,
  image: ImageBody,
  video: VideoBody,
  audio: AudioBody,
  model3d: Model3DBody,
  document: TileBody,
  spreadsheet: TileBody,
  presentation: TileBody,
  file: TileBody,
}

export function AssetCardNode({ data, selected }: NodeProps<BoardNode>) {
  const asset = useStore((s) => (data.assetId ? s.assets[data.assetId] : undefined))
  const url = useAssetUrl(asset?.id)
  const openAsset = useStore((s) => s.openAsset)

  if (!asset) {
    return (
      <CardChrome
        data={data}
        selected={selected}
        icon={<span />}
        title="Missing asset"
        minWidth={160}
        minHeight={80}
      >
        <div className="placeholder">This asset was removed from the vault</div>
      </CardChrome>
    )
  }

  const Icon = KIND_ICONS[asset.kind]
  const Body = cardBodyRegistry[asset.kind]
  return (
    <CardChrome
      data={data}
      selected={selected}
      icon={<Icon size={13} />}
      title={asset.name}
      minWidth={180}
      minHeight={90}
    >
      <div
        className="h-full"
        onDoubleClick={() => openAsset(asset.id)}
        title={`${KIND_LABEL[asset.kind]} — double-click to open preview`}
      >
        <Body asset={asset} url={url} />
      </div>
    </CardChrome>
  )
}
