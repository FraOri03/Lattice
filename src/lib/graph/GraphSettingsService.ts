/**
 * Graph view settings: defaults, clamping and decoding.
 *
 * Pure functions only — persistence lives in the store (per project). Every
 * numeric field is clamped and every enum validated on decode so a corrupt
 * or malicious persisted value can never reach the layout/renderer.
 */
import type {
  GraphEntityKind,
  GraphLabelMode,
  GraphLayoutKind,
  GraphNodeSizeMode,
  GraphRelationshipKind,
  GraphScope,
  GraphViewSettings,
} from './graphTypes'

/** Node kinds shown by default in the Project Graph (knowledge-first). */
export const DEFAULT_VISIBLE_NODE_KINDS: GraphEntityKind[] = [
  'note',
  'document',
  'spreadsheet',
  'presentation',
  'code',
  'board',
  'asset',
  'pdf',
  'image',
  'video',
  'audio',
  'model-3d',
  'web-embed',
  'tag',
  'github-file',
  'project',
]

/** Relationship kinds shown by default (verified, low-noise). */
export const DEFAULT_VISIBLE_RELATIONSHIP_KINDS: GraphRelationshipKind[] = [
  'references',
  'backlink',
  'contains',
  'belongs-to',
  'embedded-in',
  'displayed-on',
  'imported-from',
  'source-of',
  'linked-to',
  'depends-on',
  'tagged-with',
  'github-source',
  'plugin-defined',
]

const LAYOUTS: GraphLayoutKind[] = ['force', 'grid-by-type', 'radial']
const LABEL_MODES: GraphLabelMode[] = ['smart', 'all', 'selected', 'none']
const SIZE_MODES: GraphNodeSizeMode[] = ['degree', 'fixed']
const SCOPES: GraphScope[] = ['project', 'local']

export const DEPTH_MIN = 1
export const DEPTH_MAX = 5
export const LINK_DISTANCE_MIN = 30
export const LINK_DISTANCE_MAX = 400

export function defaultGraphSettings(): GraphViewSettings {
  return {
    scope: 'project',
    layout: 'force',
    visibleNodeKinds: [...DEFAULT_VISIBLE_NODE_KINDS],
    visibleRelationshipKinds: [...DEFAULT_VISIBLE_RELATIONSHIP_KINDS],
    depth: 2,
    showLabels: 'smart',
    showOrphans: true,
    showCardInstances: false,
    showComments: false,
    showVersions: false,
    showProject: false,
    showTags: true,
    linkDistance: 110,
    nodeSizeMode: 'degree',
    pinnedPositions: {},
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback
}

function stringArray<T extends string>(value: unknown, fallback: T[]): T[] {
  if (!Array.isArray(value)) return [...fallback]
  const seen = new Set<string>()
  const out: T[] = []
  for (const v of value) {
    if (typeof v === 'string' && !seen.has(v)) {
      seen.add(v)
      out.push(v as T)
    }
  }
  return out
}

function sanitizePins(
  value: unknown,
): Record<string, { x: number; y: number }> {
  if (!value || typeof value !== 'object') return {}
  const out: Record<string, { x: number; y: number }> = {}
  for (const [id, pos] of Object.entries(value as Record<string, unknown>)) {
    const p = pos as { x?: unknown; y?: unknown }
    if (
      p &&
      typeof p.x === 'number' &&
      Number.isFinite(p.x) &&
      typeof p.y === 'number' &&
      Number.isFinite(p.y)
    ) {
      out[id] = { x: p.x, y: p.y }
    }
  }
  return out
}

/**
 * Merge a (possibly partial, possibly untrusted) persisted value onto the
 * defaults, clamping every field. Safe to call on anything from storage.
 */
export function decodeGraphSettings(raw: unknown): GraphViewSettings {
  const d = defaultGraphSettings()
  if (!raw || typeof raw !== 'object') return d
  const r = raw as Partial<GraphViewSettings>
  return {
    scope: oneOf(r.scope, SCOPES, d.scope),
    layout: oneOf(r.layout, LAYOUTS, d.layout),
    visibleNodeKinds: stringArray(r.visibleNodeKinds, d.visibleNodeKinds),
    visibleRelationshipKinds: stringArray(
      r.visibleRelationshipKinds,
      d.visibleRelationshipKinds,
    ),
    depth: clampNumber(r.depth, DEPTH_MIN, DEPTH_MAX, d.depth),
    showLabels: oneOf(r.showLabels, LABEL_MODES, d.showLabels),
    showOrphans: typeof r.showOrphans === 'boolean' ? r.showOrphans : d.showOrphans,
    showCardInstances:
      typeof r.showCardInstances === 'boolean' ? r.showCardInstances : d.showCardInstances,
    showComments: typeof r.showComments === 'boolean' ? r.showComments : d.showComments,
    showVersions: typeof r.showVersions === 'boolean' ? r.showVersions : d.showVersions,
    showProject: typeof r.showProject === 'boolean' ? r.showProject : d.showProject,
    showTags: typeof r.showTags === 'boolean' ? r.showTags : d.showTags,
    linkDistance: clampNumber(
      r.linkDistance,
      LINK_DISTANCE_MIN,
      LINK_DISTANCE_MAX,
      d.linkDistance,
    ),
    nodeSizeMode: oneOf(r.nodeSizeMode, SIZE_MODES, d.nodeSizeMode),
    pinnedPositions: sanitizePins(r.pinnedPositions),
  }
}

/** Re-clamp an in-memory settings object (used after a patch). */
export function clampGraphSettings(settings: GraphViewSettings): GraphViewSettings {
  return decodeGraphSettings(settings)
}
