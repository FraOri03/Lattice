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
  | { kind: 'error'; fileName: string; message: string }

/** Register the raw file as a vault asset (binary → StorageProvider). */
async function importAsAsset(
  file: File,
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
  }
  useStore.getState().addAsset(asset)
  return { kind: 'asset', asset }
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
      const codeId = store.createCode({
        title: file.name.replace(/\.[^.]+$/, '') || file.name,
        language: langForExt(ext),
        extension: ext,
      })
      store.persistCodeContent(codeId, content)
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
    for (let i = 0; i < files.length; i++) {
      setProgress({ done: i, total: files.length, current: files[i].name })
      out.push(await importFile(files[i]))
    }
  } finally {
    setProgress(null)
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
    alert(
      `Some files could not be imported:\n${errors
        .map((e) => `· ${e.fileName}: ${e.message}`)
        .join('\n')}`,
    )
  }
}
