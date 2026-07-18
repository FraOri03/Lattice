import type {
  AssetDoc,
  Board,
  CodeDocMeta,
  PresentationDocMeta,
  RichDocMeta,
  SpreadsheetDocMeta,
} from '@/types/model'

/**
 * Who still points at an asset.
 *
 * Assets are stored once and referenced by id: a board card carries
 * `data.assetId`, never the bytes, so the same image can sit on twenty
 * cards while a single blob lives in the StorageProvider. That makes
 * duplication free, but it also means deleting an asset is destructive to
 * everything referencing it — this module is what lets the UI say exactly
 * what would break before it happens, instead of silently stripping cards.
 *
 * Four kinds of reference exist:
 *  - card:     a board node with data.assetId
 *  - document: a rich document embedding it (RichDocMeta.linkedAssets)
 *  - source:   a doc/code/sheet/deck keeping it as its imported original
 *  - bundle:   another asset naming it as a companion file (GLTF → .bin,
 *              OBJ → .mtl → textures), which is the one case where an
 *              asset is referenced by an asset rather than by an entity
 *
 * Pure and store-free so the rules stay unit-testable.
 */

export type AssetRefKind = 'card' | 'document' | 'source' | 'bundle'

export interface AssetRef {
  kind: AssetRefKind
  /** id of the referencing entity: board node, document, meta, or owning asset */
  id: string
  /** human label, used verbatim in confirmation dialogs */
  label: string
}

/** The slices of the vault that can point at an asset. */
export interface AssetRefIndex {
  boards: Record<string, Board>
  docs: Record<string, RichDocMeta>
  codeDocs: Record<string, CodeDocMeta>
  sheetDocs: Record<string, SpreadsheetDocMeta>
  presentDocs: Record<string, PresentationDocMeta>
  assets: Record<string, AssetDoc>
}

export interface AssetRefOptions {
  /**
   * Board node ids to treat as already gone — used to answer "would this
   * asset still be referenced once these cards are deleted?" without
   * mutating state first.
   */
  ignoreCardIds?: readonly string[]
}

/** Every reference to `assetId`, in a stable order (cards, docs, sources, bundles). */
export function assetRefsOf(
  assetId: string,
  index: Partial<AssetRefIndex>,
  opts: AssetRefOptions = {},
): AssetRef[] {
  if (!assetId) return []
  const ignored = new Set(opts.ignoreCardIds ?? [])
  const refs: AssetRef[] = []

  for (const board of Object.values(index.boards ?? {})) {
    for (const node of board.nodes) {
      if (node.data?.assetId !== assetId || ignored.has(node.id)) continue
      refs.push({ kind: 'card', id: node.id, label: `card on ${board.name}` })
    }
  }

  for (const doc of Object.values(index.docs ?? {})) {
    if (doc.linkedAssets?.includes(assetId)) {
      refs.push({ kind: 'document', id: doc.id, label: doc.title })
    }
  }

  // the imported original behind an editable entity
  const sourced: { title: string; id: string; sourceAssetId?: string }[] = [
    ...Object.values(index.docs ?? {}),
    ...Object.values(index.codeDocs ?? {}),
    ...Object.values(index.sheetDocs ?? {}),
    ...Object.values(index.presentDocs ?? {}),
  ]
  for (const meta of sourced) {
    if (meta.sourceAssetId === assetId) {
      refs.push({ kind: 'source', id: meta.id, label: `${meta.title} (imported original)` })
    }
  }

  for (const asset of Object.values(index.assets ?? {})) {
    if (asset.id === assetId || !asset.bundle) continue
    if (Object.values(asset.bundle.dependencies).includes(assetId)) {
      refs.push({ kind: 'bundle', id: asset.id, label: `${asset.name} (companion file)` })
    }
  }

  return refs
}

/** True when anything still points at the asset. */
export function isAssetReferenced(
  assetId: string,
  index: Partial<AssetRefIndex>,
  opts: AssetRefOptions = {},
): boolean {
  return assetRefsOf(assetId, index, opts).length > 0
}

/** Counts per reference kind, for building a human summary. */
export function summarizeAssetRefs(refs: readonly AssetRef[]): Record<AssetRefKind, number> {
  const out: Record<AssetRefKind, number> = { card: 0, document: 0, source: 0, bundle: 0 }
  for (const ref of refs) out[ref.kind]++
  return out
}

const PLURALS: Record<AssetRefKind, [string, string]> = {
  card: ['card', 'cards'],
  document: ['document', 'documents'],
  source: ['imported original', 'imported originals'],
  bundle: ['3D bundle', '3D bundles'],
}

/**
 * One-line "used by 3 cards and 1 document" summary, or an empty string when
 * nothing references the asset. Callers put this straight into a dialog.
 */
export function describeAssetRefs(refs: readonly AssetRef[]): string {
  const counts = summarizeAssetRefs(refs)
  const parts = (Object.keys(PLURALS) as AssetRefKind[])
    .filter((kind) => counts[kind] > 0)
    .map((kind) => {
      const [one, many] = PLURALS[kind]
      return `${counts[kind]} ${counts[kind] === 1 ? one : many}`
    })
  if (!parts.length) return ''
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}
