import type { FC } from 'react'
import type { AssetDoc, AssetKind } from '@/types/model'
import { useAssetUrl, downloadAsset } from '@/lib/assets/AssetRegistry'
import { plannedEditorFor } from '@/lib/registry/documents'
import { conversionNoteForAsset } from '@/lib/convert/ConversionService'
import { formatBytes } from '@/lib/media'
import { KIND_ICONS, KIND_LABEL } from '@/components/assetKinds'
import { IcDownload } from '@/components/Icons'
import { ThreeDViewer } from './ThreeDViewer'

export interface PreviewProps {
  asset: AssetDoc
  url?: string
}

const Loading = () => <div className="placeholder">Loading…</div>

export const PdfPreview: FC<PreviewProps> = ({ asset, url }) =>
  url ? (
    <iframe src={url} title={asset.name} className="h-full w-full border-0 bg-white" />
  ) : (
    <Loading />
  )

export const ImagePreview: FC<PreviewProps> = ({ asset, url }) =>
  url ? (
    <div className="flex h-full items-center justify-center overflow-auto bg-bg p-4">
      <img
        src={url}
        alt={asset.name}
        className="max-h-full max-w-full rounded-md object-contain shadow-lg"
      />
    </div>
  ) : (
    <Loading />
  )

export const VideoPreview: FC<PreviewProps> = ({ url }) =>
  url ? (
    <div className="flex h-full items-center justify-center bg-black">
      <video src={url} controls className="max-h-full max-w-full" />
    </div>
  ) : (
    <Loading />
  )

export const AudioPreview: FC<PreviewProps> = ({ asset, url }) => {
  const Icon = KIND_ICONS.audio
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-6">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-panel2 text-muted">
        <Icon size={34} />
      </span>
      <span className="max-w-full truncate text-sm font-semibold">{asset.name}</span>
      {url ? <audio src={url} controls className="w-full max-w-md" /> : <Loading />}
    </div>
  )
}

export const Model3DPreview: FC<PreviewProps> = ({ asset, url }) => (
  <ThreeDViewer url={url} ext={asset.ext} />
)

/** Office files and unknown types: metadata tile until their editor ships. */
export const GenericPreview: FC<PreviewProps> = ({ asset }) => {
  const Icon = KIND_ICONS[asset.kind]
  const editor = plannedEditorFor(asset.kind)
  const conversionNote = conversionNoteForAsset(asset)
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-panel2 text-muted">
        <Icon size={34} />
      </span>
      <span className="max-w-full truncate text-sm font-semibold">
        {asset.originalName}
      </span>
      <span className="text-xs text-muted">
        {KIND_LABEL[asset.kind]} · {asset.mime} · {formatBytes(asset.size)}
      </span>
      {conversionNote ? (
        <span className="max-w-md rounded-full border border-bord bg-panel2 px-3 py-1 text-[11px] text-muted">
          {conversionNote} — the original file is preserved untouched
        </span>
      ) : (
        editor &&
        editor.status === 'planned' && (
          <span className="rounded-full border border-bord bg-panel2 px-3 py-1 text-[11px] text-muted">
            {editor.editorHint} arrives in Phase {editor.phase}
          </span>
        )
      )}
      <button className="btn mt-2" onClick={() => void downloadAsset(asset)}>
        <IcDownload size={13} /> Download original
      </button>
    </div>
  )
}

/** PreviewRenderer registry: asset kind → preview component. */
export const previewRegistry: Record<AssetKind, FC<PreviewProps>> = {
  pdf: PdfPreview,
  image: ImagePreview,
  video: VideoPreview,
  audio: AudioPreview,
  model3d: Model3DPreview,
  document: GenericPreview,
  spreadsheet: GenericPreview,
  presentation: GenericPreview,
  file: GenericPreview,
}

/** Router: resolves the binary URL and dispatches to the right preview. */
export function AssetPreview({ asset }: { asset: AssetDoc }) {
  const url = useAssetUrl(asset.id)
  const Renderer = previewRegistry[asset.kind]
  return <Renderer asset={asset} url={url} />
}
