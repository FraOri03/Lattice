import mammoth from 'mammoth'
import { generateJSON, type JSONContent } from '@tiptap/core'
import type { AssetDoc } from '@/types/model'
import { extOf } from '@/lib/assets/detect'
import { baseExtensions } from '@/components/richdoc/extensions'
import { odtToDocJson, docJsonToOdtBlob } from './odt'
import { rtfToDocJson, docJsonToRtf } from './rtf'

/**
 * ConversionService: the format adapter registry. Every office/document
 * format Lattice touches is described by an adapter that declares exactly
 * what it can and cannot do — the UI reads these declarations, so no
 * format ever pretends to be editable.
 *
 * Import contract: importDocument(file) → Tiptap JSON (the canonical
 * RichTextDocument format). Export contract: exportDocument(body) → Blob.
 */
export interface FormatAdapter {
  id: string
  label: string
  extensions: string[]
  mimes: string[]
  canImport: boolean
  canExport: boolean
  importStrategy: string
  exportStrategy: string
  limitations: string[]
  requiresBackend: boolean
  /** hook for a future dedicated engine (spreadsheet / presentation) */
  futureEngine?: 'spreadsheet' | 'presentation'
  importDocument?: (file: Blob) => Promise<JSONContent>
  exportDocument?: (body: JSONContent) => Promise<Blob>
}

const ODF_MIME_PREFIX = 'application/vnd.oasis.opendocument.'

export const DocxAdapter: FormatAdapter = {
  id: 'docx',
  label: 'Word (DOCX)',
  extensions: ['docx'],
  mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  canImport: true,
  canExport: true,
  importStrategy: 'mammoth.js → HTML → Tiptap JSON',
  exportStrategy: 'Tiptap JSON → WordprocessingML package (in-browser, Phase 8)',
  limitations: [
    'Complex layout, comments and tracked changes are dropped on import',
    'Export: asset embeds become a reference line; image sizes default when unknown',
  ],
  requiresBackend: false,
  importDocument: async (file) => {
    const { value: html } = await mammoth.convertToHtml({
      arrayBuffer: await file.arrayBuffer(),
    })
    return generateJSON(html, baseExtensions)
  },
  exportDocument: async (body) => {
    const { docJsonToDocxBlob } = await import('./docx')
    return docJsonToDocxBlob(body)
  },
}

export const OdtAdapter: FormatAdapter = {
  id: 'odt',
  label: 'OpenDocument Text (ODT)',
  extensions: ['odt'],
  mimes: [`${ODF_MIME_PREFIX}text`],
  canImport: true,
  canExport: true,
  importStrategy: 'JSZip → content.xml → Tiptap JSON (in-browser)',
  exportStrategy: 'Tiptap JSON → ODT package (mimetype, manifest, content.xml)',
  limitations: [
    'Embedded images are skipped on import',
    'Export covers headings, paragraphs, marks, lists and basic tables',
  ],
  requiresBackend: false,
  importDocument: (file) => odtToDocJson(file),
  exportDocument: (body) => docJsonToOdtBlob(body),
}

export const RtfAdapter: FormatAdapter = {
  id: 'rtf',
  label: 'Rich Text Format (RTF)',
  extensions: ['rtf'],
  mimes: ['application/rtf', 'text/rtf'],
  canImport: true,
  canExport: true,
  importStrategy: 'basic RTF tokenizer → Tiptap JSON (in-browser)',
  exportStrategy: 'Tiptap JSON → basic RTF writer',
  limitations: [
    'Import covers paragraphs and bold/italic/underline only',
    'Tables, images and colors are not converted',
  ],
  requiresBackend: false,
  importDocument: async (file) => rtfToDocJson(await file.text()),
  exportDocument: async (body) =>
    new Blob([docJsonToRtf(body)], { type: 'application/rtf' }),
}

export const HtmlAdapter: FormatAdapter = {
  id: 'html',
  label: 'HTML',
  extensions: [],
  mimes: [],
  canImport: true,
  canExport: true,
  importStrategy: '.html files open in the code editor; paste HTML into a rich document to convert',
  exportStrategy: 'generateHTML → standalone page',
  limitations: ['Scripts and styles are dropped when parsed into a document'],
  requiresBackend: false,
}

export const MarkdownAdapter: FormatAdapter = {
  id: 'markdown',
  label: 'Markdown',
  extensions: [],
  mimes: [],
  canImport: true,
  canExport: true,
  importStrategy: '.md files import as wiki notes (Obsidian-style)',
  exportStrategy: 'Tiptap JSON → Markdown serializer',
  limitations: [],
  requiresBackend: false,
}

export const PlainTextAdapter: FormatAdapter = {
  id: 'plaintext',
  label: 'Plain text',
  extensions: [],
  mimes: [],
  canImport: true,
  canExport: true,
  importStrategy: '.txt files import as wiki notes',
  exportStrategy: 'plain text download',
  limitations: [],
  requiresBackend: false,
}

export const LegacyDocAdapter: FormatAdapter = {
  id: 'doc',
  label: 'Legacy Word (DOC)',
  extensions: ['doc'],
  mimes: ['application/msword'],
  canImport: false,
  canExport: false,
  importStrategy: 'preserved as original asset — no in-browser converter exists',
  exportStrategy: 'not planned',
  limitations: ['Legacy DOC conversion requires a backend or LibreOffice bridge'],
  requiresBackend: true,
}

/**
 * Spreadsheet formats route through the Phase 4 spreadsheet engine
 * (SpreadsheetImportService, SheetJS), not through importDocument — these
 * adapters describe the conversion honestly for tiles and the inspector.
 * Empty limitations = no warning shown: the formats are fully handled.
 */
export const OdsAdapter: FormatAdapter = {
  id: 'ods',
  label: 'OpenDocument Spreadsheet (ODS)',
  extensions: ['ods'],
  mimes: [`${ODF_MIME_PREFIX}spreadsheet`],
  canImport: true,
  canExport: false,
  importStrategy: 'SheetJS → SpreadsheetDocument (spreadsheet engine, Phase 4)',
  exportStrategy: 'export via XLSX/CSV from the spreadsheet workspace',
  limitations: [],
  requiresBackend: false,
  futureEngine: 'spreadsheet',
}

export const XlsxAdapter: FormatAdapter = {
  id: 'xlsx',
  label: 'Excel (XLS/XLSX)',
  extensions: ['xls', 'xlsx'],
  mimes: [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  canImport: true,
  canExport: true,
  importStrategy: 'SheetJS → SpreadsheetDocument (values, formulas, number formats)',
  exportStrategy: 'SpreadsheetBody → XLSX via SheetJS',
  limitations: [],
  requiresBackend: false,
  futureEngine: 'spreadsheet',
}

export const CsvAdapter: FormatAdapter = {
  id: 'csv',
  label: 'CSV / TSV',
  extensions: ['csv', 'tsv'],
  mimes: ['text/csv', 'text/tab-separated-values'],
  canImport: true,
  canExport: true,
  importStrategy: 'SheetJS → SpreadsheetDocument (single sheet)',
  exportStrategy: 'active sheet → CSV (computed values)',
  limitations: [],
  requiresBackend: false,
  futureEngine: 'spreadsheet',
}

export const OdpAdapter: FormatAdapter = {
  id: 'odp',
  label: 'OpenDocument Presentation (ODP)',
  extensions: ['odp'],
  mimes: [`${ODF_MIME_PREFIX}presentation`],
  canImport: false,
  canExport: false,
  importStrategy: 'preserved as asset — converts when the presentation engine lands',
  exportStrategy: 'planned with the presentation engine',
  limitations: ['Presentation engine planned — original preserved untouched'],
  requiresBackend: false,
  futureEngine: 'presentation',
}

export const UnknownOfficeAdapter: FormatAdapter = {
  id: 'unknown-office',
  label: 'Unknown / legacy office format',
  extensions: ['docg', 'odf'],
  mimes: [],
  canImport: false,
  canExport: false,
  importStrategy: 'preserved as asset; routed by MIME signature when one is recognized',
  exportStrategy: 'not available',
  limitations: [
    'No standard converter for this format — the original file is preserved as-is',
  ],
  requiresBackend: true,
}

export const ADAPTERS: FormatAdapter[] = [
  DocxAdapter,
  OdtAdapter,
  RtfAdapter,
  HtmlAdapter,
  MarkdownAdapter,
  PlainTextAdapter,
  LegacyDocAdapter,
  OdsAdapter,
  XlsxAdapter,
  CsvAdapter,
  OdpAdapter,
  UnknownOfficeAdapter,
]

/**
 * Resolve the adapter for a file. MIME signatures win over extensions so
 * the OpenDocument family (.odf and friends) routes correctly even with
 * unusual extensions.
 */
export function adapterForFile(name: string, mime: string): FormatAdapter | undefined {
  if (mime) {
    const byMime = ADAPTERS.find((a) => a.mimes.includes(mime))
    if (byMime) return byMime
    // route generic OpenDocument members we don't specifically know
    if (mime.startsWith(ODF_MIME_PREFIX)) return UnknownOfficeAdapter
  }
  const ext = extOf(name)
  return ADAPTERS.find((a) => a.extensions.includes(ext))
}

export function adapterById(id: string): FormatAdapter | undefined {
  return ADAPTERS.find((a) => a.id === id)
}

/** Adapter that can convert this file into an editable rich document. */
export function importAdapterFor(name: string, mime: string): FormatAdapter | undefined {
  const adapter = adapterForFile(name, mime)
  return adapter?.canImport && adapter.importDocument ? adapter : undefined
}

/**
 * Honest one-liner for asset tiles/inspector about why a preserved office
 * file is not editable (yet), or null when no conversion story applies.
 */
export function conversionNoteForAsset(asset: AssetDoc): string | null {
  const adapter = adapterForFile(asset.originalName, asset.mime)
  if (!adapter || adapter.importDocument) return null
  if (adapter.limitations.length) return adapter.limitations[0]
  if (adapter.requiresBackend) return `${adapter.label}: requires a converter backend`
  return null
}
