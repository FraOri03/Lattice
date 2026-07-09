import type { ComponentType } from 'react'
import type { AssetKind, CardColor } from '@/types/model'
import {
  IcBoard,
  IcCode,
  IcCube,
  IcDoc,
  IcDrive,
  IcFile,
  IcGithub,
  IcGlobe,
  IcImage,
  IcMusic,
  IcNote,
  IcPresentation,
  IcTable,
  IcVideo,
} from '@/components/Icons'

type IconComponent = ComponentType<{ size?: number; className?: string }>

/**
 * Every kind of thing that can appear in the sidebar, on cards, in search
 * results or in pickers — unified across entities (notes, documents…),
 * imported assets, and external references (webpages, GitHub, Drive).
 */
export type FileKind =
  | 'note' // markdown notes / plain text
  | 'richdoc' // rich text documents
  | 'sheet' // spreadsheets
  | 'presentation' // slide decks
  | 'code' // code files
  | 'pdf'
  | 'image'
  | 'video'
  | 'audio'
  | 'model3d'
  | 'board'
  | 'file' // generic attachment
  | 'webembed' // external webpage / embed
  | 'github' // GitHub repo or repo file
  | 'gdrive' // Google Drive file

export interface FileKindSpec {
  kind: FileKind
  label: string
  icon: IconComponent
  color: CardColor
}

/** The single source of truth: kind → label, icon, default color. */
export const fileKindRegistry: Record<FileKind, FileKindSpec> = {
  note: { kind: 'note', label: 'Note', icon: IcNote, color: 'gray' },
  richdoc: { kind: 'richdoc', label: 'Document', icon: IcDoc, color: 'blue' },
  sheet: { kind: 'sheet', label: 'Spreadsheet', icon: IcTable, color: 'green' },
  presentation: {
    kind: 'presentation',
    label: 'Presentation',
    icon: IcPresentation,
    color: 'orange',
  },
  code: { kind: 'code', label: 'Code', icon: IcCode, color: 'purple' },
  pdf: { kind: 'pdf', label: 'PDF', icon: IcFile, color: 'red' },
  image: { kind: 'image', label: 'Image', icon: IcImage, color: 'purple' },
  video: { kind: 'video', label: 'Video', icon: IcVideo, color: 'red' },
  audio: { kind: 'audio', label: 'Audio', icon: IcMusic, color: 'yellow' },
  model3d: { kind: 'model3d', label: '3D model', icon: IcCube, color: 'blue' },
  board: { kind: 'board', label: 'Board', icon: IcBoard, color: 'gray' },
  file: { kind: 'file', label: 'File', icon: IcFile, color: 'gray' },
  webembed: { kind: 'webembed', label: 'Webpage', icon: IcGlobe, color: 'blue' },
  github: { kind: 'github', label: 'GitHub', icon: IcGithub, color: 'gray' },
  gdrive: { kind: 'gdrive', label: 'Google Drive', icon: IcDrive, color: 'green' },
}

/** Map an imported asset's AssetKind onto the unified FileKind space. */
export function fileKindForAsset(kind: AssetKind): FileKind {
  switch (kind) {
    case 'pdf':
      return 'pdf'
    case 'image':
      return 'image'
    case 'video':
      return 'video'
    case 'audio':
      return 'audio'
    case 'model3d':
      return 'model3d'
    case 'document':
      return 'richdoc'
    case 'spreadsheet':
      return 'sheet'
    case 'presentation':
      return 'presentation'
    default:
      return 'file'
  }
}

/** Kind-aware icon, used consistently in the sidebar, cards and pickers. */
export function FileKindIcon({
  kind,
  size = 13,
  className,
}: {
  kind: FileKind
  size?: number
  className?: string
}) {
  const spec = fileKindRegistry[kind] ?? fileKindRegistry.file
  const Icon = spec.icon
  return <Icon size={size} className={className} />
}
