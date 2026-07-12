import type { ComponentType } from 'react'
import { CARD_COLORS, type CardColor } from '@/types/model'
import type { GraphColorToken } from '@/lib/graph/graphKindMeta'
import type { GraphRelationshipKind } from '@/lib/graph/graphTypes'
import {
  IcBoard,
  IcCode,
  IcCube,
  IcDoc,
  IcExternal,
  IcFile,
  IcFolder,
  IcGithub,
  IcGlobe,
  IcHistory,
  IcImage,
  IcMessage,
  IcMusic,
  IcNote,
  IcPresentation,
  IcSection,
  IcTable,
  IcTag,
  IcUser,
  IcVideo,
} from '@/components/Icons'

type IconComponent = ComponentType<{ size?: number; className?: string }>

/**
 * Resolve the plain icon token the (React-free) builder stamps on a node to
 * a real icon component. Keeps the worker free of JSX while the graph still
 * uses the same semantic glyphs as the sidebar and cards.
 */
const ICON_BY_TOKEN: Record<string, IconComponent> = {
  note: IcNote,
  richdoc: IcDoc,
  sheet: IcTable,
  presentation: IcPresentation,
  code: IcCode,
  pdf: IcFile,
  image: IcImage,
  video: IcVideo,
  audio: IcMusic,
  model3d: IcCube,
  board: IcBoard,
  webembed: IcGlobe,
  github: IcGithub,
  file: IcFile,
  tag: IcTag,
  project: IcFolder,
  section: IcSection,
  user: IcUser,
  comment: IcMessage,
  version: IcHistory,
  external: IcExternal,
}

export function GraphNodeIcon({
  icon,
  size = 12,
  className,
}: {
  icon?: string
  size?: number
  className?: string
}) {
  const Icon = ICON_BY_TOKEN[icon ?? 'file'] ?? IcFile
  return <Icon size={size} className={className} />
}

/** Read a CSS custom property (theme-aware) at call time. */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

/**
 * Resolve a node colour token to a concrete hex/CSS colour. Reuses the app's
 * CardColor palette so the graph is visually native; `tag` and `project`
 * fall back to the accent / muted theme tokens.
 */
export function graphNodeColor(token?: GraphColorToken | string): string {
  if (!token) return CARD_COLORS.gray
  if (token === 'tag') return cssVar('--accent', '#0d99ff')
  if (token === 'project') return cssVar('--muted', '#97979f')
  return CARD_COLORS[token as CardColor] ?? CARD_COLORS.gray
}

/** Line style per relationship family — never colour-only encoding. */
export function edgeStyle(kind: GraphRelationshipKind): {
  dash: number[]
  label: string
} {
  switch (kind) {
    case 'references':
    case 'backlink':
    case 'linked-to':
    case 'mentions':
      return { dash: [], label: 'Reference' }
    case 'contains':
    case 'belongs-to':
    case 'parent-of':
    case 'child-of':
      return { dash: [1, 3], label: 'Containment' }
    case 'imported-from':
    case 'source-of':
    case 'depends-on':
    case 'generated-by':
      return { dash: [6, 4], label: 'Source / import' }
    case 'embedded-in':
    case 'displayed-on':
      return { dash: [2, 3], label: 'Embed / display' }
    case 'tagged-with':
      return { dash: [4, 3], label: 'Tag' }
    case 'github-source':
    case 'external-source':
      return { dash: [8, 3], label: 'External source' }
    case 'suggested-related':
      return { dash: [1, 4], label: 'AI suggestion' }
    default:
      return { dash: [3, 3], label: 'Plugin / other' }
  }
}
