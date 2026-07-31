/**
 * Thin client over the video conversion Web Worker. ffmpeg.wasm runs
 * entirely inside that worker — even though the single-thread core has no
 * SharedArrayBuffer/thread pool of its own, wrapping it in a
 * Lattice-owned dedicated worker (mirroring GraphWorkerClient) is what
 * actually keeps `.exec()`'s synchronous WASM execution off the main
 * thread, regardless of whatever worker ffmpeg.wasm may or may not spawn
 * internally.
 *
 * The worker module is imported lazily via `new URL(...)` so Vite emits it
 * as its own chunk — the ~30 MB ffmpeg-core download only happens once a
 * video is actually uploaded, not on app load.
 *
 * Jobs run ONE AT A TIME: a single loaded ffmpeg instance is reused
 * (loading the core is itself a multi-MB fetch), and running several
 * transcodes concurrently in one tab risks real memory/CPU pressure.
 * Callers queued behind another job simply wait; the caller decides what
 * "queued" should look like in its own UI.
 */
import type {
  VideoWorkerRequest,
  VideoWorkerResponse,
} from '@/workers/videoWorkerProtocol'

export interface ConvertVideoResult {
  output: Blob
  thumbnail: Blob | null
}

export interface ConvertVideoOptions {
  onProgress?: (fraction: number) => void
}

type QueueItem = {
  file: File
  resolve: (v: ConvertVideoResult) => void
  reject: (err: unknown) => void
  onProgress?: (fraction: number) => void
}

class VideoConversionClient {
  private worker: Worker | null = null
  private unavailable = false
  private nextId = 1
  private queue: QueueItem[] = []
  private active: { requestId: number; item: QueueItem } | null = null

  /** False once a worker has failed to construct — callers should skip
   *  conversion rather than fall back to blocking the main thread. */
  get isAvailable(): boolean {
    return !this.unavailable
  }

  private ensureWorker(): Worker | null {
    if (this.unavailable) return null
    if (this.worker) return this.worker
    try {
      this.worker = new Worker(new URL('../../workers/video.worker.ts', import.meta.url), {
        type: 'module',
      })
      this.worker.onmessage = (ev: MessageEvent<VideoWorkerResponse>) => this.handleMessage(ev.data)
      this.worker.onerror = () => this.fail(new Error('Video conversion worker crashed'))
      return this.worker
    } catch {
      this.unavailable = true
      return null
    }
  }

  private handleMessage(msg: VideoWorkerResponse) {
    if (!this.active || this.active.requestId !== msg.requestId) return
    const { item } = this.active
    if (msg.type === 'progress') {
      item.onProgress?.(msg.fraction)
      return
    }
    this.active = null
    if (msg.type === 'done') {
      item.resolve({
        output: new Blob([msg.output], { type: 'video/mp4' }),
        thumbnail: msg.thumbnail ? new Blob([msg.thumbnail], { type: 'image/jpeg' }) : null,
      })
    } else {
      item.reject(new Error(msg.message))
    }
    this.runNext()
  }

  /** Worker construction or transport itself failed — nothing is salvageable. */
  private fail(err: unknown) {
    this.unavailable = true
    if (this.active) this.active.item.reject(err)
    this.active = null
    for (const item of this.queue) item.reject(err)
    this.queue = []
    this.worker?.terminate()
    this.worker = null
  }

  private runNext() {
    if (this.active || !this.queue.length) return
    const worker = this.ensureWorker()
    const item = this.queue.shift()!
    if (!worker) {
      item.reject(new Error('Video conversion worker is unavailable'))
      this.runNext()
      return
    }
    const requestId = this.nextId++
    this.active = { requestId, item }
    void item.file.arrayBuffer().then(
      (input) => {
        // still the active job? (a fail() between the read and now would
        // have already rejected it)
        if (this.active?.requestId !== requestId) return
        const req: VideoWorkerRequest = {
          type: 'convert',
          requestId,
          input,
          fileName: item.file.name,
        }
        worker.postMessage(req, [input])
      },
      (err: unknown) => {
        if (this.active?.requestId === requestId) this.active = null
        item.reject(err)
        this.runNext()
      },
    )
  }

  /**
   * Convert one video file to a web-friendly H.264/AAC MP4, plus a JPEG
   * thumbnail when extraction succeeds. Rejects if no worker is
   * available — callers should treat that as "skip conversion, keep the
   * original," never as a reason to run ffmpeg on the main thread.
   */
  convert(file: File, opts: ConvertVideoOptions = {}): Promise<ConvertVideoResult> {
    if (this.unavailable) return Promise.reject(new Error('Video conversion worker is unavailable'))
    return new Promise<ConvertVideoResult>((resolve, reject) => {
      this.queue.push({ file, resolve, reject, onProgress: opts.onProgress })
      this.runNext()
    })
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    this.active = null
    this.queue = []
  }
}

/** Shared singleton — one worker, one ffmpeg load, for the whole app. */
export const videoConversionClient = new VideoConversionClient()
