# File formats

What Lattice can import, export, edit, preview or preserve — and the fidelity limits of
each. This mirrors `src/lib/registry/formatMatrix.ts`, the single source of truth that
also backs the in-app format view (code and docs cannot drift).

## Support states

| State | Meaning |
|---|---|
| **Native editable** | Created and edited in Lattice's own format. |
| **Converted to editable** | Converted to an editable internal document on import. |
| **Preview only** | Rendered, not editable. |
| **Preserved original** | Imported and kept as the original attachment. |
| **Needs conversion backend** | Converts only when the remote conversion worker is configured. |
| **Unsupported** | No reliable browser path — preserved as an attachment. |

## Text & documents

| Ext | Format | Support | Exports to | Notes |
|---|---|---|---|---|
| txt | Plain text | Native editable | txt, md | |
| md | Markdown | Native editable | md | Imports as a wiki note with `[[wikilinks]]`. |
| html | HTML | Converted | html | Imports into the code editor; rich docs export standalone HTML. |
| rtf | Rich Text Format | Converted | rtf | Basic marks/paragraphs; tables/images not converted. |
| docx | Word (DOCX) | Converted | docx, pdf, odt, rtf, html, md | mammoth.js import; **native** WordprocessingML export; source preserved. |
| doc | Legacy Word (DOC) | Needs backend | — | Preserved; converts only with a conversion backend. |
| odt | OpenDocument Text | Converted | odt, docx, pdf, rtf, html, md | In-browser ODF parser/serializer; embedded images skipped on import. |
| docg / odf | Non-standard / generic ODF | Preserved | — | Routed by MIME signature; original preserved. |

## Spreadsheets

| Ext | Format | Support | Exports to | Notes |
|---|---|---|---|---|
| csv | CSV | Converted | csv, xlsx | Native sheet engine; formulas evaluated in-app. |
| tsv | TSV | Converted | csv, xlsx | |
| xlsx | Excel (XLSX) | Converted | xlsx, csv | SheetJS: values, formulas, number formats; source preserved. |
| xls | Legacy Excel (XLS) | Converted | xlsx, csv | Imported via SheetJS; export upgrades to XLSX. |
| ods | OpenDocument Spreadsheet | Converted | xlsx, csv | ODS **export not yet available** (fidelity report on import). |

## Presentations

| Ext | Format | Support | Exports to | Notes |
|---|---|---|---|---|
| pptx | PowerPoint (PPTX) | Converted | pdf, pptx | Text/images extracted into the presentation engine; complex layouts flattened; source preserved. PPTX export is **basic fidelity**. |
| odp | OpenDocument Presentation | Converted | pdf, pptx | Text extracted into the editor; source preserved. |
| ppt | Legacy PowerPoint (PPT) | Needs backend | — | Preserved; converts only with a conversion backend. |

## PDF

| Ext | Format | Support | Notes |
|---|---|---|---|
| pdf | PDF | Preview only | Browser-native page preview with text selection. Rich docs/sheets/slides export **to** PDF. |

## Images

| Ext | Support | Notes |
|---|---|---|
| png, jpg, webp, gif, bmp | Preview only | |
| svg | Preview only | Rendered sandboxed (`img` element — scripts never execute). |
| avif | Preview only | Depends on browser codec support. |
| tiff | Preserved | Browsers cannot decode TIFF — preserved with download; the preview says so. |

## Video & audio

| Ext | Support | Notes |
|---|---|---|
| mp4, webm, mov, m4v, ogv | Converted (video) | Uploads up to 150 MB auto-convert to H.264/AAC MP4 in a background worker (ffmpeg.wasm) — see below. Over that ceiling, or if the worker is unavailable, the original upload is kept and played as-is. |
| mp3, wav, ogg, m4a, flac | Preview only | m4a/aac codec-dependent. |

### Video upload conversion

Every uploaded video is transcoded client-side to H.264/AAC MP4 (`+faststart`,
so playback can begin before the whole file has downloaded) — the format
combination with the widest browser support, notably including Safari, which
WebM cannot rely on. A JPEG thumbnail is extracted from the result when
possible.

- Runs entirely in a dedicated Web Worker via [ffmpeg.wasm](https://ffmpegwasm.netlify.app/)
  (single-thread core — no SharedArrayBuffer/COOP-COEP, which would otherwise
  break cross-origin WebEmbed iframes elsewhere in the app), so the main
  thread never blocks regardless of file size.
- One conversion runs at a time; others wait their turn. The card shows
  queued/converting/done/error/skipped state and an inline progress
  percentage while running.
- The **same** asset is replaced in place once conversion succeeds — there is
  never a second, permanently-kept copy of the pre-conversion bytes. If
  conversion fails or is skipped, the original upload is untouched and is
  what plays; a card in that state offers a manual retry.
- The ffmpeg-core WASM/JS build (~30 MB) is fetched lazily, on first use,
  from jsDelivr — a version-pinned external CDN dependency, not bundled with
  the app (self-hosting it as a build asset was investigated but has real
  Vite build friction). See [integrations.md](integrations.md#video-conversion-ffmpegwasm).

## 3D

| Ext | Support | Notes |
|---|---|---|
| glb | Preview only | three.js viewer; self-contained single file. |
| gltf | Preview only | Asset bundles resolve external `.bin`/textures; missing-dependency diagnostics + relink. |
| obj (+mtl) | Preview only | MTL companion + textures resolved through asset bundles. |
| stl | Preview only | three.js STL loader. |
| fbx | Unsupported | No reliable browser loader — preserved as attachment. |

## Code & data

30+ languages are **native editable** in Monaco with CRDT collaboration and download-as-
source: js, jsx, ts, tsx, css, scss, less, json, xml, yaml, py, java, c, cpp, cs, php, rb,
rs, go, sql, sh, toml, ini, and more.

| Ext | Support | Notes |
|---|---|---|
| env | Native editable | **Secret detection** on import: privacy warning, never auto-committed or shared. |

## Archives & generic

| Ext | Support | Notes |
|---|---|---|
| zip | Preserved | 3D asset bundles can be imported from a ZIP; otherwise preserved as an attachment. |
| * (any other) | Preserved | Generic binary attachment: stored, synced to Drive, downloadable. |

## Pipeline & dependencies

- Every office format is declared by a `FormatAdapter`/`FormatCapability` with honest
  `limitations`; nothing pretends to be editable when it isn't.
- Heavy converters are **lazy-loaded**: SheetJS (`xlsx`) for spreadsheets, jsPDF for PDF
  export, `mammoth` for DOCX import, `jszip` for archives/asset bundles, three.js for 3D.
- **Legacy DOC/PPT** and higher-fidelity office conversion route to the optional remote
  conversion backend ([integrations.md](integrations.md#conversion-backend-optional)); with
  it disabled, originals are preserved and the UI states what is missing.
- 3D **asset bundles** resolve external buffers/textures and surface missing-dependency
  diagnostics with a "Relink missing files" flow — never a silent empty viewport.
