/** File readers and media URL helpers. */

/** Files bigger than this are rejected — localStorage persistence is the MVP backend. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/**
 * Read an image file, downscaling to maxDim so large photos
 * do not blow up localStorage quota.
 */
export async function readImageScaled(file: File, maxDim = 1600): Promise<string> {
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return readFileAsDataUrl(file)
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error(`Could not decode image ${file.name}`))
      el.src = url
    })
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
    if (scale === 1 && file.size < 512 * 1024) return readFileAsDataUrl(file)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const keepPng = file.type === 'image/png'
    return canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export interface VideoEmbed {
  kind: 'iframe' | 'video'
  src: string
}

/** Turn a pasted URL into something embeddable, or null if we can't. */
export function toVideoEmbed(url?: string): VideoEmbed | null {
  if (!url) return null
  if (url.startsWith('data:video')) return { kind: 'video', src: url }
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/,
  )
  if (yt) return { kind: 'iframe', src: `https://www.youtube.com/embed/${yt[1]}` }
  const vimeo = url.match(/vimeo\.com\/(\d+)/)
  if (vimeo) return { kind: 'iframe', src: `https://player.vimeo.com/video/${vimeo[1]}` }
  if (/\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(url)) return { kind: 'video', src: url }
  return null
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function formatBytes(n?: number): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
