import type { VideoConversionState } from '@/types/model'

/**
 * Pure decision logic + ffmpeg command shape for video upload conversion.
 * The worker (src/workers/video.worker.ts) and its client
 * (VideoConversionClient.ts) own the actual IO/WASM execution; everything
 * here is synchronous and testable without a browser.
 */

/**
 * Above this, a video is NOT auto-converted — it stays exactly as
 * uploaded. Client-side WASM transcoding of very large files risks tab
 * memory exhaustion and multi-minute stalls; 150 MB (well under the 200 MB
 * general import cap) is a conservative line for what a single-threaded
 * in-browser encode can reliably finish in a background tab. Tune here if
 * that turns out too tight or too generous in practice.
 */
export const AUTO_CONVERT_MAX_BYTES = 150 * 1024 * 1024

/** Circuit breaker for a stuck/pathological job — not a normal-case limit. */
export const CONVERT_TIMEOUT_MS = 10 * 60 * 1000

/** Extensions known to often carry codecs browsers cannot decode natively. */
export const CODEC_RISK_EXTS = ['mov', 'ogv', 'avi', 'wmv', 'mkv', 'flv']

export type ConversionEligibility =
  | { eligible: true }
  | { eligible: false; reason: string }

/** Whether a just-uploaded video should be queued for auto-conversion. */
export function eligibleForAutoConvert(file: { size: number }): ConversionEligibility {
  if (file.size > AUTO_CONVERT_MAX_BYTES) {
    const capMb = Math.round(AUTO_CONVERT_MAX_BYTES / (1024 * 1024))
    return {
      eligible: false,
      reason: `File is over the ${capMb} MB automatic-conversion limit — kept as uploaded.`,
    }
  }
  return { eligible: true }
}

/**
 * ffmpeg args for the web-friendly transcode: H.264 video + AAC audio in
 * an MP4 container, the combination with the widest browser support
 * (notably including Safari, which WebM cannot rely on). yuv420p forces a
 * pixel format every hardware decoder accepts — some source files use
 * formats (10-bit, 4:4:4) that decode inconsistently across browsers.
 * faststart moves the moov atom to the front so playback can start before
 * the whole file has downloaded.
 */
export function transcodeArgs(inputName: string, outputName: string): string[] {
  return [
    '-i',
    inputName,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    outputName,
  ]
}

/**
 * ffmpeg args for a single-frame JPEG thumbnail, seeked slightly into the
 * clip (a cold first frame is often a black/blank slate) and scaled down.
 * `-ss` before `-i` seeks by input demuxing, which is fast even in wasm.
 */
export function thumbnailArgs(
  inputName: string,
  outputName: string,
  seekSeconds: number,
): string[] {
  return [
    '-ss',
    String(seekSeconds),
    '-i',
    inputName,
    '-frames:v',
    '1',
    '-vf',
    'scale=320:-1',
    outputName,
  ]
}

/** Human status line for the card overlay / inspector. */
export function describeVideoConversion(state: VideoConversionState | undefined): string {
  if (!state) return ''
  switch (state.status) {
    case 'queued':
      return 'Queued for conversion…'
    case 'converting':
      return typeof state.progress === 'number' && state.progress > 0
        ? `Converting… ${Math.round(state.progress * 100)}%`
        : 'Converting…'
    case 'done':
      return 'Converted for the web'
    case 'skipped':
      return state.skippedReason ?? 'Conversion skipped'
    case 'error':
      return state.error ? `Conversion failed: ${state.error}` : 'Conversion failed'
  }
}
