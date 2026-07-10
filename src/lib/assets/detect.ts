import type { AssetKind } from '@/types/model'

/** Extensions that import as editable markdown notes instead of assets. */
export const NOTE_EXTS = ['md', 'markdown', 'txt']

const EXT_KINDS: Record<Exclude<AssetKind, 'file'>, string[]> = {
  pdf: ['pdf'],
  // tiff routes as image but browsers can't decode it — the preview says so
  image: ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif', 'avif', 'bmp', 'tif', 'tiff'],
  video: ['mp4', 'webm', 'mov', 'm4v', 'ogv'],
  audio: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'],
  model3d: ['glb', 'gltf', 'obj', 'stl', 'mtl'],
  document: ['doc', 'docx', 'odt', 'rtf'],
  spreadsheet: ['xls', 'xlsx', 'ods', 'csv', 'tsv'],
  presentation: ['ppt', 'pptx', 'odp'],
}

/** Image formats current browsers cannot decode natively. */
export const UNDECODABLE_IMAGE_EXTS = ['tif', 'tiff']
/** Video containers whose codecs are often unsupported in browsers. */
export const CODEC_DEPENDENT_VIDEO_EXTS = ['mov', 'ogv']

export function extOf(name: string): string {
  const m = name.match(/\.([^.]+)$/)
  return m ? m[1].toLowerCase() : ''
}

export function detectKind(name: string, mime: string): AssetKind {
  if (mime === 'application/pdf') return 'pdf'
  // OpenDocument family: the MIME signature wins over the extension, so
  // .odf and mislabeled members route to the right kind.
  if (mime.startsWith('application/vnd.oasis.opendocument.')) {
    const member = mime.slice('application/vnd.oasis.opendocument.'.length)
    if (member.startsWith('text')) return 'document'
    if (member.startsWith('spreadsheet')) return 'spreadsheet'
    if (member.startsWith('presentation')) return 'presentation'
    return 'file'
  }
  const ext = extOf(name)
  // non-standard/legacy office extensions are preserved as documents
  if (ext === 'docg') return 'document'
  for (const [kind, exts] of Object.entries(EXT_KINDS)) {
    if (exts.includes(ext)) return kind as AssetKind
  }
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}

/** Default board-card size per asset kind. */
export const KIND_CARD_SIZE: Record<AssetKind, { w: number; h: number }> = {
  pdf: { w: 340, h: 420 },
  image: { w: 300, h: 220 },
  video: { w: 340, h: 240 },
  audio: { w: 300, h: 120 },
  model3d: { w: 320, h: 260 },
  document: { w: 280, h: 150 },
  spreadsheet: { w: 280, h: 150 },
  presentation: { w: 280, h: 150 },
  file: { w: 260, h: 130 },
}
