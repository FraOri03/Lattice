/**
 * Photo studio planner (Photo mode) — domain model.
 *
 * A 2D top-down blueprint of a photo/film set: cameras, lights, people and
 * props laid out on a centimeter grid. A project owns one scene made of
 * SHOTS; every shot carries its own element layout, so switching shots
 * swaps the whole set configuration.
 */

export type PhotoElementType =
  | 'camera'
  | 'light'
  | 'person'
  | 'prop'
  | 'environment'
  | 'nature'
  | 'vehicle'
  | 'furniture'

export interface PhotoBaseElement {
  id: string
  type: PhotoElementType
  name: string
  x: number // cm
  y: number // cm
  rotation: number // degrees
  scaleX: number
  scaleY: number
  opacity: number
  zIndex: number
  locked: boolean
  hidden: boolean
  color: string
  label?: string
  notes?: string
  /** preset symbol drawn on the canvas (wall, door, car, tree…) */
  customSvgPath?: string
  /** top-down artwork in /Photoicons, by file name (see lib/photo/icons.ts) */
  iconKey?: string
  category?: string
  width?: number // cm
  height?: number // cm
}

export interface PhotoCameraElement extends PhotoBaseElement {
  type: 'camera'
  sensor: 'Full Frame' | 'APS-C' | 'Super 35' | 'Medium Format'
  focalLength: number // mm
  fov: number // degrees, derived from focalLength (full-frame equivalent)
  aperture: string // e.g. f/2.8
  iso: number
  shutter: string // e.g. 1/50s
  cameraHeight: number // cm
  tilt: number // degrees
  pan: number // degrees
  roll: number // degrees
  cameraNumber: string // "A", "B", …
  shotType: 'Close Up' | 'Medium' | 'Wide' | 'Extreme Wide' | 'Detail'
  targetDistance: number // cm
}

export type PhotoLightType =
  | 'fresnel'
  | 'led_panel'
  | 'par'
  | 'softbox'
  | 'stripbox'
  | 'beauty_dish'
  | 'open_face'
  | 'tube_light'
  | 'practical'
  | 'spot'
  | 'ellipsoidal'
  | 'sun'
  | 'moon'
  | 'bounce'

export interface PhotoLightElement extends PhotoBaseElement {
  type: 'light'
  lightType: PhotoLightType
  intensity: number // power scale 0-100
  colorTemperature: number // Kelvin (1000-10000)
  beamAngle: number // degrees (10-180)
  falloff: number // cm
  lightHeight: number // cm
  gelName?: string
  dmxChannel?: number
  showTargetLine: boolean
  targetX?: number
  targetY?: number
}

export interface PhotoPersonElement extends PhotoBaseElement {
  type: 'person'
  role:
    | 'Actor'
    | 'Extra'
    | 'Model'
    | 'Crew'
    | 'Photographer'
    | 'Assistant'
    | 'Client'
    | 'Makeup'
    | 'Hair'
  lookAngle: number // gaze direction, degrees
  personHeight: number // cm
  pose: 'standing' | 'sitting' | 'kneeling' | 'action'
}

export interface PhotoPropElement extends PhotoBaseElement {
  type: 'prop' | 'environment' | 'nature' | 'vehicle' | 'furniture'
  propType: string // table, chair, cyclorama, green_screen, wall, tree…
}

export type PhotoElement =
  | PhotoCameraElement
  | PhotoLightElement
  | PhotoPersonElement
  | PhotoPropElement

export interface PhotoShot {
  id: string
  number: number
  name: string
  description: string
  storyboardText?: string
  duration?: string // e.g. "5s", "30s"
  priority: 'High' | 'Medium' | 'Low'
  status: 'Draft' | 'Planned' | 'Approved' | 'Shot' | 'Omitted'
  colorTag?: string
  checklist: { id: string; text: string; done: boolean }[]
  /** every shot owns its full element layout */
  elements: PhotoElement[]
}

/** What gets persisted per project (everything else is editor session state). */
export interface PhotoSceneSnapshot {
  shots: PhotoShot[]
  activeShotId: string
}

export type PhotoTool = 'select' | 'pan'

/** Serialized .json scene file — same shape the standalone tool exports. */
export interface PhotoSceneExport {
  version: string
  shots: PhotoShot[]
}
