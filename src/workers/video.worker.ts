/// <reference lib="webworker" />
/**
 * Video upload conversion worker.
 *
 * Transcodes an uploaded video to a web-friendly H.264/AAC MP4 via
 * ffmpeg.wasm (single-thread core — no SharedArrayBuffer, so it needs no
 * COOP/COEP page headers, which would otherwise break cross-origin
 * WebEmbed iframes elsewhere in the app) and extracts a JPEG thumbnail
 * from the result. All of it runs here, off the main thread; see
 * VideoConversionClient for the queueing/transport side.
 *
 * The ffmpeg-core build (~30 MB of JS+WASM) is fetched lazily on the
 * first job and reused for the life of this worker. It is loaded from
 * jsDelivr, version-pinned to the exact @ffmpeg/core release this code was
 * written against — self-hosting it as a bundled asset was investigated
 * but has real Vite build friction (see docs/integrations.md); this is
 * the pattern ffmpeg.wasm's own documentation recommends.
 */
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'
import { thumbnailArgs, transcodeArgs, CONVERT_TIMEOUT_MS } from '@/lib/video/videoConversion'
import type {
  VideoWorkerRequest,
  VideoWorkerResponse,
} from './videoWorkerProtocol'

const ctx = self as unknown as DedicatedWorkerGlobalScope

const CORE_VERSION = '0.12.10'
/**
 * The **esm** build, not the umd one, and that is load-bearing.
 *
 * @ffmpeg/ffmpeg always spawns its own inner worker with `type: "module"`,
 * so `importScripts()` — the path the umd build exists for — is not
 * available to it. Its loader tries `importScripts` first, catches, and
 * falls back to `await import(coreURL)`; the umd bundle ends in a UMD
 * wrapper with no ES export, so that import yields `default: undefined`
 * and the load dies with "failed to import ffmpeg-core.js". The esm bundle
 * ends in `export default createFFmpegCore` and is what that fallback — the
 * only path this ever takes — actually needs.
 *
 * Its own `/umd/` → `/esm/` self-correction only fires when no coreURL is
 * passed at all, so handing it a umd blob URL is precisely what defeats it.
 */
const CORE_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`

/**
 * A core that never finishes loading would otherwise leave every card
 * stuck on "Converting…" forever — `load()` has no timeout of its own, and
 * a worker that fails to boot never answers at all.
 */
const LOAD_TIMEOUT_MS = 90_000

let ffmpegPromise: Promise<FFmpeg> | null = null

function loadFFmpeg(): Promise<FFmpeg> {
  ffmpegPromise ??= (async () => {
    const ffmpeg = new FFmpeg()
    ffmpeg.on('log', ({ message }) => console.log('[video.worker:ffmpeg]', message))
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    ])
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        ffmpeg.load({ coreURL, wasmURL }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Timed out loading the video conversion engine')),
            LOAD_TIMEOUT_MS,
          )
        }),
      ])
    } catch (err) {
      // a failed load must not be cached as a permanently rejected promise:
      // Retry has to be able to try the download again
      ffmpegPromise = null
      ffmpeg.terminate()
      throw err
    } finally {
      clearTimeout(timer)
    }
    return ffmpeg
  })()
  return ffmpegPromise
}

function extOf(name: string): string {
  const m = name.match(/\.([^.]+)$/)
  return m ? m[1].toLowerCase() : 'mp4'
}

/** Read back a virtual-FS file as a plain, transferable ArrayBuffer. */
function toArrayBuffer(data: Uint8Array | string): ArrayBuffer {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  // .slice() so the transfer never carries a view onto a larger buffer
  // than the data itself (or a SharedArrayBuffer, which isn't transferable)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** Best-effort virtual-FS cleanup so a long worker life doesn't accumulate files. */
async function cleanup(ffmpeg: FFmpeg, names: string[]): Promise<void> {
  for (const name of names) {
    try {
      await ffmpeg.deleteFile(name)
    } catch {
      /* file was never written, or already gone — fine either way */
    }
  }
}

async function handleConvert(msg: VideoWorkerRequest): Promise<void> {
  const { requestId } = msg
  const ffmpeg = await loadFFmpeg()

  const onProgress = ({ progress }: { progress: number }) => {
    const fraction = Math.min(1, Math.max(0, progress))
    const res: VideoWorkerResponse = { type: 'progress', requestId, fraction }
    ctx.postMessage(res)
  }
  ffmpeg.on('progress', onProgress)

  const inputName = `input.${extOf(msg.fileName)}`
  const outputName = 'output.mp4'
  const thumbName = 'thumb.jpg'

  try {
    await ffmpeg.writeFile(inputName, new Uint8Array(msg.input))

    const code = await ffmpeg.exec(transcodeArgs(inputName, outputName), CONVERT_TIMEOUT_MS)
    if (code !== 0) {
      throw new Error(`ffmpeg exited with code ${code} — the source format may be unsupported`)
    }
    const output = toArrayBuffer(await ffmpeg.readFile(outputName))

    // a missing/failed thumbnail must never fail the conversion itself
    let thumbnail: ArrayBuffer | null = null
    try {
      const thumbCode = await ffmpeg.exec(thumbnailArgs(outputName, thumbName, 1), 30_000)
      if (thumbCode === 0) thumbnail = toArrayBuffer(await ffmpeg.readFile(thumbName))
    } catch {
      thumbnail = null
    }

    const res: VideoWorkerResponse = { type: 'done', requestId, output, thumbnail }
    ctx.postMessage(res, thumbnail ? [output, thumbnail] : [output])
  } finally {
    ffmpeg.off('progress', onProgress)
    await cleanup(ffmpeg, [inputName, outputName, thumbName])
  }
}

ctx.onmessage = (ev: MessageEvent<VideoWorkerRequest>) => {
  const msg = ev.data
  if (msg.type !== 'convert') return
  handleConvert(msg).catch((err: unknown) => {
    const res: VideoWorkerResponse = {
      type: 'error',
      requestId: msg.requestId,
      message: err instanceof Error ? err.message : 'Video conversion failed',
    }
    ctx.postMessage(res)
  })
}
