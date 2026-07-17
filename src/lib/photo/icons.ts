import type { PhotoElement, PhotoLightType } from '@/types/photo'

/**
 * The set artwork in /Photoicons: real gear hand-drawn from above, one file
 * per library preset. Vite turns each PNG into a hashed asset URL at build
 * time, so the drawings ship as ordinary bundled assets.
 */
const FILES = import.meta.glob('/Photoicons/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/** "/Photoicons/DSLR Camera.png" → "dslr camera" */
const keyOf = (path: string) => path.split('/').pop()!.replace(/\.png$/i, '').toLowerCase()

const URLS: Record<string, string> = Object.fromEntries(
  Object.entries(FILES).map(([path, url]) => [keyOf(path), url]),
)

/**
 * Where a drawing's front points, in element degrees (0 = up, the canvas
 * convention). The artwork follows no single convention, so it is recorded
 * per file: bodies look right down their lens, crew are drawn facing the
 * bottom of the frame, and the photographer already aims up his own.
 *
 * Light fixtures are deliberately absent: they are face-on illustrations
 * with no in-plane direction — what shows a lamp's aim is its beam, and the
 * lighting layer draws that.
 */
const FACING: Record<string, number> = {
  'dslr camera': 90,
  'mirrorless camera': 90,
  'cinema camera': 90,
  'drone camera': 180, // the gimbal hangs off the near side
  actor: 180,
  model: 180,
  extra: 180,
  'director-assistant': 180,
}

export interface PhotoIcon {
  url: string
  /** degrees to spin the artwork so its front matches the element's */
  correction: number
}

/** Artwork by file name, e.g. "beauty dish". */
export function photoIcon(key: string | undefined): PhotoIcon | undefined {
  if (!key) return undefined
  const k = key.toLowerCase()
  const url = URLS[k]
  return url ? { url, correction: -(FACING[k] ?? 0) } : undefined
}

/* Fallbacks, so elements that never came from a preset — AI layouts, the
   toolbar's quick-add, imported scenes — still get their artwork. */

const LIGHT_ICON: Record<PhotoLightType, string> = {
  softbox: 'softbox',
  stripbox: 'stripbox',
  fresnel: 'fresnel light',
  par: 'fresnel light',
  led_panel: 'led panel 1x1',
  open_face: 'led panel 1x1',
  practical: 'led panel 1x1',
  tube_light: 'tube light rgb',
  spot: 'spotlight-profile',
  ellipsoidal: 'spotlight-profile',
  beauty_dish: 'beauty dish',
  sun: 'sunlight directional',
  moon: 'sunlight directional',
  bounce: 'bounce board white',
}

const ROLE_ICON: Record<string, string> = {
  Actor: 'actor',
  Model: 'model',
  Extra: 'extra',
  Photographer: 'photographer',
  Assistant: 'director-assistant',
  Crew: 'director-assistant',
  Client: 'director-assistant',
  Makeup: 'director-assistant',
  Hair: 'director-assistant',
}

const PROP_ICON: Record<string, string> = {
  car: 'car sedan',
  motorcycle: 'motorbike',
  bicycle: 'bicycle',
  tree: 'tree large',
  rock: 'rock',
  cyclorama: 'cyclorama curved',
  dolly: 'dolly track',
  slider: 'slider',
  tripod: 'tripod',
}

/**
 * The artwork to draw for an element, or undefined when it keeps its vector
 * symbol. Backdrops always keep theirs: seen from above a backdrop IS a
 * line, while its drawing is a face-on elevation.
 */
export function resolvePhotoIcon(el: PhotoElement): PhotoIcon | undefined {
  if (el.customSvgPath === 'backdrop') return undefined
  const explicit = photoIcon(el.iconKey)
  if (explicit) return explicit
  if (el.type === 'light') return photoIcon(LIGHT_ICON[el.lightType])
  if (el.type === 'person') return photoIcon(ROLE_ICON[el.role])
  if (el.type === 'camera') return photoIcon('dslr camera')
  // the shape's own name is tried last, so dropping "table.png" into
  // /Photoicons is all it takes to give the table preset a drawing
  return photoIcon(PROP_ICON[el.customSvgPath ?? ''] ?? el.customSvgPath)
}

/**
 * The box, in centimeters, the artwork is fitted inside (preserving its
 * aspect). Gear keeps the symbolic size of the vector glyph it replaces —
 * drawings are stylised, so a 12:1 tube light would otherwise shrink to a
 * speck. Props are drawn at their real footprint, which is what they were
 * sized for: a 440cm sedan is a 450px drawing.
 */
export function photoIconBox(el: PhotoElement): { w: number; h: number } {
  if (el.type === 'camera') return { w: 46, h: 46 }
  if (el.type === 'light') return { w: 72, h: 72 }
  if (el.type === 'person') return { w: 56, h: 56 }
  return { w: el.width || 100, h: el.height || 100 }
}
