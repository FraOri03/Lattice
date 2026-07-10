import { authService } from '@/lib/auth/AuthService'
import { env, hasConversionBackend } from '@/lib/env'

/**
 * ConversionBackendProvider (Phase 8, spec §14) — the seam between the
 * browser and heavyweight format conversion.
 *
 * Three implementations, honestly labelled:
 *  - LocalConversionProvider: browser-safe conversions that already run
 *    in-app (DOCX/ODT/RTF ↔ rich documents, PPTX/ODP → decks, sheets
 *    via SheetJS). No upload ever happens.
 *  - RemoteConversionProvider: talks to an EXTERNAL conversion worker
 *    (e.g. headless LibreOffice behind an authenticated endpoint) for
 *    legacy DOC/PPT and high-fidelity office conversion. Only active
 *    when VITE_CONVERSION_API_URL is configured; uploads happen only
 *    after the caller collected explicit consent.
 *  - DisabledConversionProvider: what runs when nothing is configured —
 *    canConvert() is false for everything and convertFile() throws a
 *    message the UI can show verbatim.
 *
 * Frontend guarantees (enforced here): explicit consent before upload,
 * abort/timeout support, size limit, progress callbacks, fidelity
 * warnings surfaced, original file untouched.
 */

export interface ConvertFileRequest {
  sourceAssetId: string
  /** lowercase extension, e.g. "doc" */
  sourceFormat: string
  targetFormat: string
  projectId: string
  /** the raw file to convert */
  file: Blob
  options?: Record<string, unknown>
}

export interface ConvertFileResponse {
  outputFile: Blob
  outputFormat: string
  warnings: string[]
  unsupportedFeatures: string[]
  conversionEngine: string
  durationMs: number
}

export interface ConvertOptions {
  signal?: AbortSignal
  onProgress?: (fraction: number) => void
  /** the caller confirmed the privacy dialog for remote uploads */
  uploadConsent?: boolean
}

export interface ConversionBackendProvider {
  readonly id: 'local' | 'remote' | 'disabled'
  readonly label: string
  /** true when convertFile sends the file to a server */
  readonly requiresUpload: boolean
  canConvert(sourceFormat: string, targetFormat: string): boolean
  convertFile(req: ConvertFileRequest, opts?: ConvertOptions): Promise<ConvertFileResponse>
}

export class ConversionError extends Error {}

/** Upload cap for remote conversion (server should enforce its own too). */
export const MAX_REMOTE_CONVERT_BYTES = 50 * 1024 * 1024
const REMOTE_TIMEOUT_MS = 120_000

/* ---------------- local (browser-safe) ---------------- */

/** source → targets actually implemented in-browser (see adapters). */
const LOCAL_PAIRS: Record<string, string[]> = {
  docx: ['richdoc'],
  odt: ['richdoc'],
  rtf: ['richdoc'],
  pptx: ['deck'],
  odp: ['deck'],
  csv: ['sheet'],
  tsv: ['sheet'],
  xls: ['sheet'],
  xlsx: ['sheet'],
  ods: ['sheet'],
}

export const LocalConversionProvider: ConversionBackendProvider = {
  id: 'local',
  label: 'In-browser converters',
  requiresUpload: false,
  canConvert: (s, t) => (LOCAL_PAIRS[s] ?? []).includes(t),
  // Local conversions run through ImportService/ExportService directly;
  // this provider exists so the capability question has one answer.
  convertFile: async () => {
    throw new ConversionError(
      'Local conversions run through the import/export pipeline, not convertFile().',
    )
  },
}

/* ---------------- remote (external worker) ---------------- */

const REMOTE_PAIRS: Record<string, string[]> = {
  doc: ['docx', 'pdf'],
  ppt: ['pptx', 'pdf'],
  docx: ['pdf'],
  pptx: ['pdf'],
  odt: ['pdf', 'docx'],
  odp: ['pdf', 'pptx'],
}

export const RemoteConversionProvider: ConversionBackendProvider = {
  id: 'remote',
  label: 'Remote conversion worker',
  requiresUpload: true,
  canConvert: (s, t) => hasConversionBackend && (REMOTE_PAIRS[s] ?? []).includes(t),

  async convertFile(req, opts = {}) {
    if (!hasConversionBackend) {
      throw new ConversionError('No conversion backend is configured (VITE_CONVERSION_API_URL).')
    }
    if (!opts.uploadConsent) {
      throw new ConversionError(
        'Remote conversion needs explicit consent: the file is uploaded and processed temporarily on the conversion worker.',
      )
    }
    if (req.file.size > MAX_REMOTE_CONVERT_BYTES) {
      throw new ConversionError('File exceeds the 50 MB remote conversion limit.')
    }
    const token = await authService.getAccessToken()
    if (!token) {
      throw new ConversionError('Sign in with Google — conversion requests are authenticated.')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS)
    const onCallerAbort = () => controller.abort()
    opts.signal?.addEventListener('abort', onCallerAbort)

    const started = Date.now()
    try {
      opts.onProgress?.(0.05)
      const form = new FormData()
      form.set('file', req.file)
      form.set('sourceFormat', req.sourceFormat)
      form.set('targetFormat', req.targetFormat)
      form.set('projectId', req.projectId)
      if (req.options) form.set('options', JSON.stringify(req.options))

      const res = await fetch(`${env.conversionApiUrl.replace(/\/$/, '')}/convert`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        signal: controller.signal,
      })
      opts.onProgress?.(0.7)
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new ConversionError(
          `Conversion worker rejected the request (HTTP ${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`,
        )
      }
      const warnings = safeJsonList(res.headers.get('x-conversion-warnings'))
      const unsupported = safeJsonList(res.headers.get('x-conversion-unsupported'))
      const engine = res.headers.get('x-conversion-engine') ?? 'unknown'
      const outputFile = await res.blob()
      opts.onProgress?.(1)
      return {
        outputFile,
        outputFormat: req.targetFormat,
        warnings,
        unsupportedFeatures: unsupported,
        conversionEngine: engine,
        durationMs: Date.now() - started,
      }
    } catch (err) {
      if (controller.signal.aborted) {
        throw new ConversionError('Conversion cancelled or timed out.')
      }
      throw err instanceof ConversionError
        ? err
        : new ConversionError(err instanceof Error ? err.message : 'Conversion failed')
    } finally {
      clearTimeout(timeout)
      opts.signal?.removeEventListener('abort', onCallerAbort)
    }
  },
}

/* ---------------- disabled ---------------- */

export const CONVERSION_SETUP_NOTE =
  'Legacy formats (DOC, PPT) need an external conversion worker — for example headless LibreOffice behind an authenticated endpoint. Set VITE_CONVERSION_API_URL to enable it; until then originals are preserved untouched.'

export const DisabledConversionProvider: ConversionBackendProvider = {
  id: 'disabled',
  label: 'Conversion backend not configured',
  requiresUpload: false,
  canConvert: () => false,
  convertFile: async () => {
    throw new ConversionError(CONVERSION_SETUP_NOTE)
  },
}

/** The active remote-capable provider for this build. */
export const conversionBackend: ConversionBackendProvider = hasConversionBackend
  ? RemoteConversionProvider
  : DisabledConversionProvider

function safeJsonList(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}
