/**
 * Format capability matrix (Phase 8, spec §12).
 *
 * One row per format, with the HONEST capability state — a format is
 * only "native" or "converted" when import, internal representation,
 * editing and (where claimed) export have actually been verified. The
 * README table is generated from this module, so docs and code cannot
 * drift apart.
 */

export type FormatState =
  | 'native' // native editable (created & edited in Lattice's own format)
  | 'converted' // converted to an editable internal document on import
  | 'preview' // preview only — rendered, not editable
  | 'preserved' // imported and preserved as the original attachment
  | 'backend' // requires the external conversion backend
  | 'unsupported'

export interface FormatCapability {
  ext: string
  label: string
  group:
    | 'text'
    | 'spreadsheet'
    | 'presentation'
    | 'pdf'
    | 'image'
    | 'video'
    | 'audio'
    | '3d'
    | 'code'
    | 'archive'
  state: FormatState
  exportFormats: string[]
  notes?: string
}

const code = (ext: string, label: string): FormatCapability => ({
  ext,
  label,
  group: 'code',
  state: 'native',
  exportFormats: [ext],
  notes: 'Monaco editor with CRDT collaboration; download as source file',
})

export const FORMAT_MATRIX: FormatCapability[] = [
  /* ---- text & documents ---- */
  { ext: 'txt', label: 'Plain text', group: 'text', state: 'native', exportFormats: ['txt', 'md'] },
  { ext: 'md', label: 'Markdown', group: 'text', state: 'native', exportFormats: ['md'], notes: 'Imports as a wiki note with [[wikilinks]]' },
  { ext: 'html', label: 'HTML', group: 'text', state: 'converted', exportFormats: ['html'], notes: 'Imports into the code editor; rich documents export standalone HTML' },
  { ext: 'rtf', label: 'Rich Text Format', group: 'text', state: 'converted', exportFormats: ['rtf'], notes: 'Basic marks and paragraphs; tables/images not converted' },
  { ext: 'docx', label: 'Word (DOCX)', group: 'text', state: 'converted', exportFormats: ['docx', 'pdf', 'odt', 'rtf', 'html', 'md'], notes: 'mammoth.js import; native WordprocessingML export since Phase 8; source preserved' },
  { ext: 'doc', label: 'Legacy Word (DOC)', group: 'text', state: 'backend', exportFormats: [], notes: 'Preserved as-is; converts only when a conversion backend is configured' },
  { ext: 'docg', label: 'DOCG (non-standard)', group: 'text', state: 'preserved', exportFormats: [], notes: 'Not a recognized standard — routed by MIME signature, original preserved' },
  { ext: 'odt', label: 'OpenDocument Text', group: 'text', state: 'converted', exportFormats: ['odt', 'docx', 'pdf', 'rtf', 'html', 'md'], notes: 'In-browser ODF parser/serializer; embedded images skipped on import' },
  { ext: 'odf', label: 'ODF (generic member)', group: 'text', state: 'preserved', exportFormats: [], notes: 'Routed by MIME signature to text/sheet/presentation when recognized' },

  /* ---- spreadsheets ---- */
  { ext: 'csv', label: 'CSV', group: 'spreadsheet', state: 'converted', exportFormats: ['csv', 'xlsx'], notes: 'Native sheet engine; formulas evaluated in-app' },
  { ext: 'tsv', label: 'TSV', group: 'spreadsheet', state: 'converted', exportFormats: ['csv', 'xlsx'] },
  { ext: 'xlsx', label: 'Excel (XLSX)', group: 'spreadsheet', state: 'converted', exportFormats: ['xlsx', 'csv'], notes: 'SheetJS: values, formulas, number formats; source preserved' },
  { ext: 'xls', label: 'Legacy Excel (XLS)', group: 'spreadsheet', state: 'converted', exportFormats: ['xlsx', 'csv'], notes: 'Imported via SheetJS; export upgrades to XLSX' },
  { ext: 'ods', label: 'OpenDocument Spreadsheet', group: 'spreadsheet', state: 'converted', exportFormats: ['xlsx', 'csv'], notes: 'Imported via SheetJS; ODS export not yet available (fidelity report on import)' },

  /* ---- presentations ---- */
  { ext: 'pptx', label: 'PowerPoint (PPTX)', group: 'presentation', state: 'converted', exportFormats: ['pdf', 'pptx'], notes: 'Text/images extracted into the Phase 8 presentation engine; complex layouts flattened; source preserved' },
  { ext: 'odp', label: 'OpenDocument Presentation', group: 'presentation', state: 'converted', exportFormats: ['pdf', 'pptx'], notes: 'Text extracted into the editor; source preserved' },
  { ext: 'ppt', label: 'Legacy PowerPoint (PPT)', group: 'presentation', state: 'backend', exportFormats: [], notes: 'Preserved as-is; converts only with a conversion backend' },

  /* ---- pdf ---- */
  { ext: 'pdf', label: 'PDF', group: 'pdf', state: 'preview', exportFormats: [], notes: 'Browser-native page preview with text selection; rich docs/sheets/slides export TO pdf' },

  /* ---- images ---- */
  { ext: 'png', label: 'PNG', group: 'image', state: 'preview', exportFormats: ['png'] },
  { ext: 'jpg', label: 'JPEG', group: 'image', state: 'preview', exportFormats: ['jpg'] },
  { ext: 'webp', label: 'WebP', group: 'image', state: 'preview', exportFormats: ['webp'] },
  { ext: 'gif', label: 'GIF', group: 'image', state: 'preview', exportFormats: ['gif'] },
  { ext: 'svg', label: 'SVG', group: 'image', state: 'preview', exportFormats: ['svg'], notes: 'Rendered sandboxed (img element — scripts never execute)' },
  { ext: 'avif', label: 'AVIF', group: 'image', state: 'preview', exportFormats: ['avif'], notes: 'Depends on browser codec support' },
  { ext: 'bmp', label: 'BMP', group: 'image', state: 'preview', exportFormats: ['bmp'] },
  { ext: 'tiff', label: 'TIFF', group: 'image', state: 'preserved', exportFormats: [], notes: 'Browsers cannot decode TIFF — preserved with download; preview says so' },

  /* ---- video ---- */
  { ext: 'mp4', label: 'MP4', group: 'video', state: 'preview', exportFormats: [] },
  { ext: 'webm', label: 'WebM', group: 'video', state: 'preview', exportFormats: [] },
  { ext: 'ogv', label: 'Ogg Video', group: 'video', state: 'preview', exportFormats: [], notes: 'Depends on browser codec support' },
  { ext: 'mov', label: 'QuickTime (MOV)', group: 'video', state: 'preview', exportFormats: [], notes: 'Plays only when the browser supports the codec; otherwise preserved honestly' },

  /* ---- audio ---- */
  { ext: 'mp3', label: 'MP3', group: 'audio', state: 'preview', exportFormats: [] },
  { ext: 'wav', label: 'WAV', group: 'audio', state: 'preview', exportFormats: [] },
  { ext: 'ogg', label: 'Ogg Audio', group: 'audio', state: 'preview', exportFormats: [] },
  { ext: 'm4a', label: 'M4A/AAC', group: 'audio', state: 'preview', exportFormats: [], notes: 'Codec-dependent' },
  { ext: 'flac', label: 'FLAC', group: 'audio', state: 'preview', exportFormats: [], notes: 'Supported in current browsers' },

  /* ---- 3d ---- */
  { ext: 'glb', label: 'glTF Binary (GLB)', group: '3d', state: 'preview', exportFormats: [], notes: 'three.js viewer; self-contained single file' },
  { ext: 'gltf', label: 'glTF + dependencies', group: '3d', state: 'preview', exportFormats: [], notes: 'Phase 8 asset bundles resolve external .bin/textures; missing-dependency diagnostics + relink' },
  { ext: 'obj', label: 'OBJ (+MTL)', group: '3d', state: 'preview', exportFormats: [], notes: 'MTL companion + textures resolved through asset bundles' },
  { ext: 'stl', label: 'STL', group: '3d', state: 'preview', exportFormats: [], notes: 'three.js STL loader' },
  { ext: 'fbx', label: 'FBX', group: '3d', state: 'unsupported', exportFormats: [], notes: 'No reliable browser loader — preserved as attachment' },

  /* ---- code & data ---- */
  code('js', 'JavaScript'), code('jsx', 'JSX'), code('ts', 'TypeScript'), code('tsx', 'TSX'),
  code('css', 'CSS'), code('scss', 'SCSS'), code('less', 'LESS'),
  code('json', 'JSON'), code('xml', 'XML'), code('yaml', 'YAML'),
  code('py', 'Python'), code('java', 'Java'), code('c', 'C'), code('cpp', 'C++'),
  code('cs', 'C#'), code('php', 'PHP'), code('rb', 'Ruby'), code('rs', 'Rust'),
  code('go', 'Go'), code('sql', 'SQL'), code('sh', 'Shell'), code('toml', 'TOML'),
  code('ini', 'INI'),
  { ext: 'env', label: 'Environment files', group: 'code', state: 'native', exportFormats: ['env'], notes: 'Secret detection on import: privacy warning, never auto-committed or shared' },

  /* ---- archives & generic ---- */
  { ext: 'zip', label: 'ZIP archive', group: 'archive', state: 'preserved', exportFormats: [], notes: '3D asset bundles can be imported from ZIP; otherwise preserved attachment' },
  { ext: '*', label: 'Any other file', group: 'archive', state: 'preserved', exportFormats: [], notes: 'Generic binary attachment: stored, synced to Drive, downloadable' },
]

export const STATE_LABEL: Record<FormatState, string> = {
  native: 'Native editable',
  converted: 'Converted to editable',
  preview: 'Preview only',
  preserved: 'Preserved original',
  backend: 'Needs conversion backend',
  unsupported: 'Unsupported',
}

/** Markdown table for the README (kept in sync by generation). */
export function formatMatrixMarkdown(): string {
  const rows = FORMAT_MATRIX.map(
    (f) =>
      `| ${f.ext} | ${f.label} | ${STATE_LABEL[f.state]} | ${f.exportFormats.join(', ') || '—'} | ${f.notes ?? ''} |`,
  )
  return [
    '| Ext | Format | Support | Exports to | Notes |',
    '| --- | ------ | ------- | ---------- | ----- |',
    ...rows,
  ].join('\n')
}
