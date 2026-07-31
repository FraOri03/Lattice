/** Message protocol between VideoConversionClient and video.worker.ts. */

export interface VideoWorkerConvertRequest {
  type: 'convert'
  requestId: number
  /** raw file bytes, transferred (not copied) */
  input: ArrayBuffer
  /** original filename — only used to pick ffmpeg's input demuxer by extension */
  fileName: string
}

export type VideoWorkerRequest = VideoWorkerConvertRequest

export interface VideoWorkerProgressMessage {
  type: 'progress'
  requestId: number
  /** 0-1, best-effort (accurate mainly when output duration ≈ input duration,
   *  which holds for a straight transcode) */
  fraction: number
}

export interface VideoWorkerDoneMessage {
  type: 'done'
  requestId: number
  /** converted MP4 bytes, transferred */
  output: ArrayBuffer
  /** JPEG thumbnail bytes, transferred; null if extraction failed (non-fatal) */
  thumbnail: ArrayBuffer | null
}

export interface VideoWorkerErrorMessage {
  type: 'error'
  requestId: number
  message: string
}

export type VideoWorkerResponse =
  | VideoWorkerProgressMessage
  | VideoWorkerDoneMessage
  | VideoWorkerErrorMessage
