/**
 * Slide media (19E.4).
 *
 * Crop, focal point and adjustments are **metadata**. The stored asset is
 * never rewritten, so nothing here can degrade a picture: re-cropping is free,
 * undo is exact, and an export reads the original at full resolution however
 * many times the frame has been reshaped.
 *
 * The arithmetic lives here so the canvas, the thumbnails and the exporters
 * all place the same pixels.
 */

export interface Crop {
  /** fractions of the source, 0–1, measured from the top-left */
  x: number
  y: number
  w: number
  h: number
}

export interface FocalPoint {
  /** fractions of the *cropped* image, 0–1 */
  x: number
  y: number
}

export interface ImageAdjustments {
  /** −100…100, 0 is untouched */
  brightness?: number
  contrast?: number
  saturation?: number
}

export type ImageFit = 'cover' | 'contain' | 'fill'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

export const FULL_CROP: Crop = { x: 0, y: 0, w: 1, h: 1 }

/** Keep a crop inside the source and never let it collapse to nothing. */
export function normalizeCrop(raw: Partial<Crop> | undefined): Crop {
  if (!raw) return FULL_CROP
  const x = clamp01(Number.isFinite(raw.x) ? (raw.x as number) : 0)
  const y = clamp01(Number.isFinite(raw.y) ? (raw.y as number) : 0)
  const w = Math.min(1 - x, Math.max(0.02, Number.isFinite(raw.w) ? (raw.w as number) : 1))
  const h = Math.min(1 - y, Math.max(0.02, Number.isFinite(raw.h) ? (raw.h as number) : 1))
  return { x, y, w, h }
}

export const isFullCrop = (crop: Crop): boolean =>
  crop.x === 0 && crop.y === 0 && crop.w === 1 && crop.h === 1

export function normalizeFocal(raw: Partial<FocalPoint> | undefined): FocalPoint {
  return {
    x: clamp01(Number.isFinite(raw?.x) ? (raw!.x as number) : 0.5),
    y: clamp01(Number.isFinite(raw?.y) ? (raw!.y as number) : 0.5),
  }
}

/**
 * A crop is expressed as a scaled, offset background — the browser does the
 * sampling, so no pixel is ever copied to show a smaller part of a picture.
 */
export function cropStyle(crop: Crop): {
  width: string
  height: string
  left: string
  top: string
  position: 'absolute'
} {
  const c = normalizeCrop(crop)
  return {
    position: 'absolute',
    width: `${(1 / c.w) * 100}%`,
    height: `${(1 / c.h) * 100}%`,
    left: `${(-c.x / c.w) * 100}%`,
    top: `${(-c.y / c.h) * 100}%`,
  }
}

/** `object-position` for the focal point, so a cover fit keeps the subject. */
export const focalPosition = (focal: FocalPoint | undefined): string => {
  const f = normalizeFocal(focal)
  return `${f.x * 100}% ${f.y * 100}%`
}

/**
 * Adjustments as a CSS filter. They are display-time only, which is exactly
 * why the original survives — and why an export has to apply the same string
 * rather than bake anything into the stored bytes.
 */
export function adjustmentFilter(adj: ImageAdjustments | undefined): string | undefined {
  if (!adj) return undefined
  const parts: string[] = []
  if (adj.brightness) parts.push(`brightness(${1 + adj.brightness / 100})`)
  if (adj.contrast) parts.push(`contrast(${1 + adj.contrast / 100})`)
  if (adj.saturation) parts.push(`saturate(${1 + adj.saturation / 100})`)
  return parts.length ? parts.join(' ') : undefined
}

export const hasAdjustments = (adj: ImageAdjustments | undefined): boolean =>
  !!adj && !!(adj.brightness || adj.contrast || adj.saturation)

/** Only values a renderer could use survive a load. */
export function sanitizeAdjustments(raw: unknown): ImageAdjustments | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const out: ImageAdjustments = {}
  for (const key of ['brightness', 'contrast', 'saturation'] as const) {
    const v = r[key]
    if (typeof v === 'number' && Number.isFinite(v) && v !== 0) {
      out[key] = Math.max(-100, Math.min(100, v))
    }
  }
  return Object.keys(out).length ? out : undefined
}

/**
 * What an exporter has to say about a picture it cannot fully reproduce.
 *
 * PPTX can carry a crop; it cannot carry a CSS filter. Rather than silently
 * ship an unadjusted image, the export reports it.
 */
export function unsupportedMediaNotes(el: {
  crop?: Crop
  adjustments?: ImageAdjustments
}): string[] {
  const notes: string[] = []
  if (hasAdjustments(el.adjustments)) {
    notes.push('image adjustments (brightness/contrast/saturation) are applied on screen only')
  }
  return notes
}
