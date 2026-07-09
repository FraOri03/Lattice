import type { ComponentType } from 'react'
import type { AssetKind, CardColor } from '@/types/model'
import {
  IcCube,
  IcDoc,
  IcFile,
  IcImage,
  IcMusic,
  IcPresentation,
  IcTable,
  IcVideo,
} from './Icons'

type IconComponent = ComponentType<{ size?: number; className?: string }>

export const KIND_ICONS: Record<AssetKind, IconComponent> = {
  pdf: IcFile,
  image: IcImage,
  video: IcVideo,
  audio: IcMusic,
  model3d: IcCube,
  document: IcDoc,
  spreadsheet: IcTable,
  presentation: IcPresentation,
  file: IcFile,
}

export const KIND_LABEL: Record<AssetKind, string> = {
  pdf: 'PDF',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  model3d: '3D model',
  document: 'Document',
  spreadsheet: 'Spreadsheet',
  presentation: 'Presentation',
  file: 'File',
}

/** Office-style default card colors: Word blue, Excel green, PowerPoint orange… */
export const KIND_DEFAULT_COLOR: Record<AssetKind, CardColor> = {
  pdf: 'red',
  image: 'purple',
  video: 'red',
  audio: 'yellow',
  model3d: 'blue',
  document: 'blue',
  spreadsheet: 'green',
  presentation: 'orange',
  file: 'gray',
}
