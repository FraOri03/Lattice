import type { AssetBundleInfo, AssetDoc } from '@/types/model'
import { getAssetUrl } from './AssetRegistry'
import { extOf } from './detect'

/**
 * Asset bundles (Phase 8, spec §15) — multi-file 3D assets.
 *
 * `.gltf` references external buffers/textures, `.obj` references `.mtl`
 * which references textures. When such files are imported together (or
 * inside a ZIP), the companions become regular assets and the main asset
 * carries a relative-path → asset-id map. Viewers resolve references
 * through that map and report exactly which paths are missing — an empty
 * viewport is never shown silently.
 */

/** Extensions that act as a bundle's MAIN file. */
export const BUNDLE_MAIN_EXTS = ['gltf', 'obj']
/** Extensions importable as bundle companions. */
export const BUNDLE_DEP_EXTS = [
  'bin',
  'mtl',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp',
  'ktx2',
  'dds',
  'tga',
]

/** Normalize a path the way loaders request it ("./tex/../a.png" → "a.png"). */
export function normalizeRelPath(path: string): string {
  const decoded = decodeURIComponent(path).replace(/\\/g, '/')
  const parts: string[] = []
  for (const seg of decoded.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/').toLowerCase()
}

/** Look a requested path up in a bundle: exact match first, then basename. */
export function lookupDependency(
  bundle: AssetBundleInfo | undefined,
  requestedPath: string,
): string | undefined {
  if (!bundle) return undefined
  const norm = normalizeRelPath(requestedPath)
  if (bundle.dependencies[norm]) return bundle.dependencies[norm]
  const base = norm.split('/').pop() ?? norm
  if (bundle.dependencies[base]) return bundle.dependencies[base]
  // last resort: any dependency whose basename matches
  for (const [key, id] of Object.entries(bundle.dependencies)) {
    if ((key.split('/').pop() ?? key) === base) return id
  }
  return undefined
}

export interface BundleResolution {
  /** blob: URL for each resolvable relative path */
  resolve: (requestedUrl: string) => Promise<string | null>
  /** requested-but-unresolved paths, filled while loading */
  missing: Set<string>
}

/**
 * Build a resolver for a main asset's bundle. Used with three.js
 * LoadingManager.setURLModifier via a pre-resolved URL cache (the
 * modifier API is synchronous, so callers pre-resolve what they need).
 */
export function createBundleResolver(asset: AssetDoc): BundleResolution {
  const missing = new Set<string>()
  return {
    missing,
    resolve: async (requestedUrl: string) => {
      const id = lookupDependency(asset.bundle, requestedUrl)
      if (!id) {
        missing.add(normalizeRelPath(requestedUrl))
        return null
      }
      const url = await getAssetUrl(id)
      if (!url) {
        missing.add(normalizeRelPath(requestedUrl))
        return null
      }
      return url
    },
  }
}

/**
 * Group a multi-file import selection into bundles: every main-format
 * file adopts all companion-format files of the batch as dependencies
 * (keyed by webkitRelativePath when a folder was picked, else by name).
 * Files that are neither mains nor companions import as usual.
 */
export function groupFilesForImport(files: File[]): {
  mains: { file: File; deps: File[] }[]
  rest: File[]
} {
  const mains = files.filter((f) => BUNDLE_MAIN_EXTS.includes(extOf(f.name)))
  if (!mains.length) return { mains: [], rest: files }
  const deps = files.filter(
    (f) => !mains.includes(f) && BUNDLE_DEP_EXTS.includes(extOf(f.name)),
  )
  const rest = files.filter((f) => !mains.includes(f) && !deps.includes(f))
  return { mains: mains.map((file) => ({ file, deps })), rest }
}

/** Relative path key for a dependency file. */
export function depKeyFor(file: File): string {
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath
  // drop the top-level folder from folder-picker paths: loaders resolve
  // relative to the main file, which usually sits inside that folder
  if (rel && rel.includes('/')) {
    const parts = rel.split('/')
    return normalizeRelPath(parts.slice(1).join('/'))
  }
  return normalizeRelPath(file.name)
}
