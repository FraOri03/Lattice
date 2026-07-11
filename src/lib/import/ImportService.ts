import { nid } from '@/lib/id'
import { detectKind, extOf, KIND_CARD_SIZE, NOTE_EXTS } from '@/lib/assets/detect'
import { storage } from '@/lib/storage/StorageProvider'
import { primeAssetUrl } from '@/lib/assets/AssetRegistry'
import { KIND_DEFAULT_COLOR } from '@/components/assetKinds'
import { importAdapterFor } from '@/lib/convert/ConversionService'
import { isCodeExt, langForExt } from '@/lib/code/languages'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import type { AssetDoc, CardData, CardType } from '@/types/model'

export const MAX_IMPORT_BYTES = 200 * 1024 * 1024

/** Code files above this size stay as plain assets instead of editor docs. */
const MAX_CODE_BYTES = 2 * 1024 * 1024

export type ImportOutcome =
  | { kind: 'note'; noteId: string }
  | { kind: 'asset'; asset: AssetDoc }
  | { kind: 'richdoc'; docId: string; asset: AssetDoc }
  | { kind: 'code'; codeId: string }
  | { kind: 'sheet'; sheetId: string; asset: AssetDoc }
  | { kind: 'present'; presentId: string; asset: AssetDoc }
  | { kind: 'error'; fileName: string; message: string }

/** Register the raw file as a vault asset (binary → StorageProvider). */
async function importAsAsset(
  file: File,
  extra: Partial<AssetDoc> = {},
): Promise<{ kind: 'asset'; asset: AssetDoc } | { kind: 'error'; fileName: string; message: string }> {
  if (file.size > MAX_IMPORT_BYTES) {
    return {
      kind: 'error',
      fileName: file.name,
      message: 'File is larger than the 200 MB import limit',
    }
  }
  const id = nid('asset')
  const ext = extOf(file.name)
  const kind = detectKind(file.name, file.type)
  await storage.putBlob(id, file)
  primeAssetUrl(id, file)
  const asset: AssetDoc = {
    id,
    name: file.name.replace(/\.[^.]+$/, '') || file.name,
    kind,
    ext,
    mime: file.type || 'application/octet-stream',
    size: file.size,
    originalName: file.name,
    importedAt: Date.now(),
    assetPath: `assets/${id}${ext ? `.${ext}` : ''}`,
    importPath: `imports/${file.name}`,
    ...extra,
  }
  useStore.getState().addAsset(asset)
  return { kind: 'asset', asset }
}

/**
 * Import a bundle main file (.gltf/.obj) with its companion files:
 * companions become regular assets, the main asset carries the
 * relative-path → asset-id map viewers resolve through (spec §15).
 */
async function importBundle(main: File, deps: File[]): Promise<ImportOutcome> {
  const { depKeyFor } = await import('@/lib/assets/AssetBundle')
  const dependencies: Record<string, string> = {}
  for (const dep of deps) {
    const outcome = await importAsAsset(dep)
    if (outcome.kind === 'asset') dependencies[depKeyFor(dep)] = outcome.asset.id
  }
  return importAsAsset(main, {
    bundle: { dependencies },
  })
}

/**
 * ZIP import: when the archive contains a 3D bundle (.gltf/.obj), unpack
 * it — relative paths inside the archive are exactly what the model
 * references. Other ZIPs stay preserved attachments. The archive itself
 * is preserved either way.
 */
async function tryImportZipBundle(file: File): Promise<ImportOutcome | null> {
  const { BUNDLE_MAIN_EXTS, BUNDLE_DEP_EXTS } = await import('@/lib/assets/AssetBundle')
  const JSZip = (await import('jszip')).default
  let zip: import('jszip')
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer())
  } catch {
    return null // not a readable zip — preserve as attachment
  }
  const entries = Object.values(zip.files).filter((e) => !e.dir)
  const mainEntry =
    entries.find((e) => BUNDLE_MAIN_EXTS.includes(extOf(e.name))) ??
    entries.find((e) => extOf(e.name) === 'glb')
  if (!mainEntry) return null

  const mainDir = mainEntry.name.includes('/')
    ? mainEntry.name.slice(0, mainEntry.name.lastIndexOf('/') + 1)
    : ''
  const { normalizeRelPath } = await import('@/lib/assets/AssetBundle')
  const dependencies: Record<string, string> = {}
  for (const entry of entries) {
    if (entry === mainEntry) continue
    if (!BUNDLE_DEP_EXTS.includes(extOf(entry.name))) continue
    const blob = await entry.async('blob')
    const baseName = entry.name.split('/').pop() ?? entry.name
    const outcome = await importAsAsset(new File([blob], baseName))
    if (outcome.kind !== 'asset') continue
    // key by the path relative to the main file's directory
    const rel = entry.name.startsWith(mainDir)
      ? entry.name.slice(mainDir.length)
      : entry.name
    dependencies[normalizeRelPath(rel)] = outcome.asset.id
  }

  const mainBlob = await mainEntry.async('blob')
  const mainName = mainEntry.name.split('/').pop() ?? mainEntry.name
  const outcome = await importAsAsset(new File([mainBlob], mainName), {
    bundle: { dependencies },
  })
  // the archive itself stays preserved alongside (source of truth)
  await importAsAsset(file)
  return outcome
}

/**
 * Universal import. Routing precedence (documented, honest):
 *  1. md/txt            → editable markdown note (Obsidian-style)
 *  2. code extensions   → CodeDocument (js/ts/html/css/json/py/…)
 *  3. spreadsheet kinds (csv/tsv/xls/xlsx/ods) → SpreadsheetDocument via
 *     SheetJS (lazy chunk); the original file is preserved as source asset
 *  4. conversion adapter (docx/odt/rtf) → RichTextDocument;
 *     the original file is always preserved as the source asset
 *  5. everything else   → preserved asset (doc, odp, media, …) with
 *     the adapter's limitation note surfaced in the UI
 */
export async function importFile(file: File): Promise<ImportOutcome> {
  try {
    const ext = extOf(file.name)

    if (ext === 'zip') {
      const bundled = await tryImportZipBundle(file)
      if (bundled) return bundled
      return importAsAsset(file) // generic archive: preserved attachment
    }

    if (NOTE_EXTS.includes(ext)) {
      const title = file.name.replace(/\.[^.]+$/, '') || file.name
      const noteId = useStore.getState().createNote({
        title,
        content: await file.text(),
      })
      return { kind: 'note', noteId }
    }

    if (isCodeExt(ext) && file.size <= MAX_CODE_BYTES) {
      const content = await file.text()
      const store = useStore.getState()
      // env/credential files: loud privacy warning, flagged metadata —
      // they are never auto-committed to GitHub or exposed via shares
      const { isEnvFileName, secretWarningFor } = await import('@/lib/security/secrets')
      const secretWarning = isEnvFileName(file.name)
        ? secretWarningFor(file.name, content)
        : null
      const codeId = store.createCode({
        title: file.name.replace(/\.[^.]+$/, '') || file.name,
        language: langForExt(ext),
        extension: ext,
        metadata: secretWarning ? { secretWarning } : {},
      })
      store.persistCodeContent(codeId, content)
      if (secretWarning) {
        void import('@/components/ui/Toaster').then(({ toast }) =>
          toast.warning(`“${file.name}” may contain secrets`, secretWarning),
        )
      }
      return { kind: 'code', codeId }
    }

    const assetOutcome = await importAsAsset(file)
    if (assetOutcome.kind === 'error') return assetOutcome

    if (assetOutcome.asset.kind === 'spreadsheet') {
      try {
        // SheetJS lives in a lazy chunk — loaded on first spreadsheet import
        const { importSpreadsheet } = await import(
          '@/lib/sheet/SpreadsheetImportService'
        )
        const body = await importSpreadsheet(file)
        const store = useStore.getState()
        const sheetId = store.createSheetDoc({
          title: assetOutcome.asset.name,
          sourceAssetId: assetOutcome.asset.id,
        })
        store.persistSheetBody(sheetId, body)
        return { kind: 'sheet', sheetId, asset: assetOutcome.asset }
      } catch (err) {
        console.error('Spreadsheet conversion failed, keeping raw asset', err)
        return assetOutcome
      }
    }

    if (assetOutcome.asset.kind === 'presentation') {
      const ext = extOf(file.name)
      if (ext === 'pptx' || ext === 'odp') {
        try {
          const { importPptx, importOdp } = await import('@/lib/present/presentImport')
          const { body, report } = await (ext === 'pptx'
            ? importPptx(file)
            : importOdp(file))
          const store = useStore.getState()
          const presentId = store.createPresentDoc({
            title: assetOutcome.asset.name,
            sourceAssetId: assetOutcome.asset.id,
            metadata: { conversionReport: report },
          })
          store.persistPresentBody(presentId, body)
          if (report.length) {
            void import('@/components/ui/Toaster').then(({ toast }) =>
              toast.info(
                `Imported “${file.name}” with fidelity notes`,
                report.slice(0, 2).join(' · '),
              ),
            )
          }
          return { kind: 'present', presentId, asset: assetOutcome.asset }
        } catch (err) {
          console.error('Presentation conversion failed, keeping raw asset', err)
          return assetOutcome
        }
      }
      // legacy .ppt: preserved honestly — needs the conversion backend
      return assetOutcome
    }

    const adapter = importAdapterFor(file.name, file.type)
    if (adapter?.importDocument) {
      try {
        const body = await adapter.importDocument(file)
        const store = useStore.getState()
        const docId = store.createDoc({
          title: assetOutcome.asset.name,
          sourceAssetId: assetOutcome.asset.id,
        })
        store.persistDocContent(docId, body)
        return { kind: 'richdoc', docId, asset: assetOutcome.asset }
      } catch (err) {
        console.error(`${adapter.label} conversion failed, keeping raw asset`, err)
        return assetOutcome
      }
    }
    return assetOutcome
  } catch (err) {
    return {
      kind: 'error',
      fileName: file.name,
      message: err instanceof Error ? err.message : 'Import failed',
    }
  }
}

export async function importFiles(files: File[]): Promise<ImportOutcome[]> {
  const out: ImportOutcome[] = []
  const setProgress = useUiStore.getState().setImportProgress
  try {
    // multi-file 3D bundles: main files adopt companions from the batch
    const { groupFilesForImport } = await import('@/lib/assets/AssetBundle')
    const { mains, rest } = groupFilesForImport(files)
    const total = mains.length + rest.length
    let done = 0
    for (const { file, deps } of mains) {
      setProgress({ done: done++, total, current: file.name })
      out.push(await importBundle(file, deps))
    }
    for (const file of rest) {
      setProgress({ done: done++, total, current: file.name })
      out.push(await importFile(file))
    }
  } finally {
    setProgress(null)
  }
  const imported = out.filter((o) => o.kind !== 'error').length
  if (imported) {
    const { activityLog } = await import('@/lib/collab/ActivityLogService')
    activityLog.log(
      useStore.getState().activeProjectId,
      'file.imported',
      imported === 1 && files[0]
        ? `Imported “${files[0].name}”`
        : `Imported ${imported} files`,
    )
  }
  return out
}

/** How an import outcome should appear on the board. */
export function cardSpecFor(outcome: ImportOutcome): {
  type: CardType
  data: Partial<CardData>
  size: { w: number; h: number }
} | null {
  if (outcome.kind === 'note') {
    return { type: 'note', data: { noteId: outcome.noteId }, size: { w: 300, h: 240 } }
  }
  if (outcome.kind === 'richdoc') {
    return {
      type: 'richdoc',
      data: { docId: outcome.docId, mode: 'compact', color: 'blue' },
      size: { w: 320, h: 230 },
    }
  }
  if (outcome.kind === 'code') {
    return {
      type: 'code',
      data: { codeId: outcome.codeId, mode: 'compact', color: 'purple' },
      size: { w: 360, h: 200 },
    }
  }
  if (outcome.kind === 'sheet') {
    return {
      type: 'sheet',
      data: { sheetId: outcome.sheetId, mode: 'compact', color: 'green' },
      size: { w: 380, h: 260 },
    }
  }
  if (outcome.kind === 'present') {
    // imported decks become editable presentation cards pointing at the
    // converted deck (the original file stays preserved as a source asset)
    return {
      type: 'presentation',
      data: {
        presentId: outcome.presentId,
        mode: 'compact',
        color: KIND_DEFAULT_COLOR.presentation,
      },
      size: KIND_CARD_SIZE.presentation,
    }
  }
  if (outcome.kind === 'asset') {
    return {
      type: 'asset',
      data: {
        assetId: outcome.asset.id,
        color: KIND_DEFAULT_COLOR[outcome.asset.kind],
      },
      size: KIND_CARD_SIZE[outcome.asset.kind],
    }
  }
  return null
}

export function reportErrors(outcomes: ImportOutcome[]): void {
  const errors = outcomes.filter((o) => o.kind === 'error')
  if (errors.length) {
    // lazy import avoids a static cycle (Toaster → … → ImportService)
    void import('@/components/ui/Toaster').then(({ toast }) => {
      toast.error(
        `${errors.length} file${errors.length > 1 ? 's' : ''} could not be imported`,
        errors.map((e) => `${e.fileName}: ${e.message}`).join(' · '),
      )
    })
  }
}
