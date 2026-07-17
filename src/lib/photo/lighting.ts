import type { PhotoElement, PhotoLightElement } from '@/types/photo'

/**
 * Dynamic 2D lighting for Photo mode ("Lumen on a blueprint"): every light
 * beam is cast as a fan of rays clipped against the scene's occluders, so
 * cones stop at walls instead of passing through them, and the lit stretch
 * of a surface gets a bounce glow. Pure geometry — rendering lives in
 * PhotoSceneRender.
 *
 * World units are centimeters; angles follow the canvas convention
 * (SVG y-down, rotation 0 = beam pointing "up", i.e. −y).
 */

export interface OccluderSegment {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface BounceSegment {
  x1: number
  y1: number
  x2: number
  y2: number
  /** 0..1 — how strongly the surface is lit (distance falloff average) */
  strength: number
}

export interface LightArea {
  /** SVG path (world coords) of the visible/lit polygon */
  path: string
  /** lit stretches of occluder surfaces, for the reflection glow */
  bounces: BounceSegment[]
}

/** Approximate a Kelvin color temperature as a display color. */
export function kelvinToColor(kelvin: number): string {
  if (kelvin < 3000) return '#ffaa44'
  if (kelvin < 4500) return '#ffcc88'
  if (kelvin < 5800) return '#fff3e0'
  if (kelvin < 7500) return '#e0f7fa'
  return '#80deea'
}

const DEG = Math.PI / 180
const TAU = Math.PI * 2

const norm2pi = (a: number) => ((a % TAU) + TAU) % TAU
const r1 = (v: number) => Math.round(v * 10) / 10

/** Corners of a w×h rectangle centered on (cx,cy), rotated by rot degrees. */
function rectSegments(
  cx: number,
  cy: number,
  w: number,
  h: number,
  rotDeg: number,
): OccluderSegment[] {
  const cos = Math.cos(rotDeg * DEG)
  const sin = Math.sin(rotDeg * DEG)
  const pt = (lx: number, ly: number) => ({
    x: cx + lx * cos - ly * sin,
    y: cy + lx * sin + ly * cos,
  })
  const c = [pt(-w / 2, -h / 2), pt(w / 2, -h / 2), pt(w / 2, h / 2), pt(-w / 2, h / 2)]
  return c.map((p, i) => {
    const q = c[(i + 1) % 4]
    return { x1: p.x, y1: p.y, x2: q.x, y2: q.y }
  })
}

function circleSegments(cx: number, cy: number, r: number, n = 8): OccluderSegment[] {
  const pts = Array.from({ length: n }, (_, i) => ({
    x: cx + r * Math.cos((i / n) * TAU),
    y: cy + r * Math.sin((i / n) * TAU),
  }))
  return pts.map((p, i) => {
    const q = pts[(i + 1) % n]
    return { x1: p.x, y1: p.y, x2: q.x, y2: q.y }
  })
}

/** World-space segments from a list of local points (closed polyline). */
function polySegments(
  cx: number,
  cy: number,
  rotDeg: number,
  pts: [number, number][],
  closed: boolean,
): OccluderSegment[] {
  const cos = Math.cos(rotDeg * DEG)
  const sin = Math.sin(rotDeg * DEG)
  const world = pts.map(([lx, ly]) => ({
    x: cx + lx * cos - ly * sin,
    y: cy + lx * sin + ly * cos,
  }))
  const out: OccluderSegment[] = []
  const last = closed ? world.length : world.length - 1
  for (let i = 0; i < last; i++) {
    const p = world[i]
    const q = world[(i + 1) % world.length]
    out.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y })
  }
  return out
}

/** Sampled points of the cyclorama's curve (matches PropShape's bezier). */
function cycloramaPoints(w: number, h: number): [number, number][] {
  // M(-w/2,-h/2) C(-w/4,h/2) (w/4,h/2) (w/2,-h/2)
  const p0 = [-w / 2, -h / 2]
  const p1 = [-w / 4, h / 2]
  const p2 = [w / 4, h / 2]
  const p3 = [w / 2, -h / 2]
  const pts: [number, number][] = []
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    const mt = 1 - t
    pts.push([
      mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0],
      mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1],
    ])
  }
  return pts
}

/** Shapes that are open frames (or glass) and should not block light. */
const TRANSPARENT_PATHS = new Set(['window', 'dolly', 'slider', 'tripod', 'bicycle'])

/**
 * Convert the scene's opaque elements into world-space occluder segments.
 * People block light (their shadow on the set is real information); lights
 * and cameras never do.
 */
export function collectOccluders(elements: PhotoElement[]): OccluderSegment[] {
  const segments: OccluderSegment[] = []
  for (const el of elements) {
    if (el.hidden) continue
    if (el.type === 'camera' || el.type === 'light') continue

    if (el.type === 'person') {
      segments.push(...circleSegments(el.x, el.y, 18))
      continue
    }

    const w = el.width || 100
    const h = el.height || 100
    switch (el.customSvgPath) {
      case undefined:
      case 'box':
      case 'wall':
      case 'backdrop':
      case 'car':
      case 'sofa':
      case 'bed':
      case 'table':
      case 'chair':
      case 'motorcycle':
        segments.push(...rectSegments(el.x, el.y, w, Math.max(h, 6), el.rotation))
        break
      case 'door':
        // the swinging leaf, drawn from the hinge to the open corner
        segments.push(
          ...polySegments(el.x, el.y, el.rotation, [[-w / 2 + 10, 0], [w / 2, -w + 10]], false),
        )
        break
      case 'cyclorama':
        segments.push(...polySegments(el.x, el.y, el.rotation, cycloramaPoints(w, h), false))
        break
      case 'tree':
        segments.push(...circleSegments(el.x, el.y, w / 3, 10))
        break
      case 'rock':
        segments.push(
          ...polySegments(
            el.x,
            el.y,
            el.rotation,
            [
              [0, -h / 2],
              [w / 2.2, -h / 3],
              [w / 2, h / 4],
              [w / 5, h / 2],
              [-w / 2.5, h / 2.2],
              [-w / 2, -h / 5],
            ],
            true,
          ),
        )
        break
      default:
        if (!TRANSPARENT_PATHS.has(el.customSvgPath)) {
          segments.push(...rectSegments(el.x, el.y, w, Math.max(h, 6), el.rotation))
        }
    }
  }
  return segments
}

/** Shortest distance from a point to a segment (for radius pre-filtering). */
function distToSegment(px: number, py: number, s: OccluderSegment): number {
  const dx = s.x2 - s.x1
  const dy = s.y2 - s.y1
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / len2))
  const cx = s.x1 + t * dx
  const cy = s.y1 + t * dy
  return Math.hypot(px - cx, py - cy)
}

/**
 * Ray → segment intersection. Returns the ray parameter t (world units)
 * or Infinity when they miss.
 */
function raySegment(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  s: OccluderSegment,
): number {
  const sx = s.x2 - s.x1
  const sy = s.y2 - s.y1
  const denom = dx * sy - dy * sx
  if (Math.abs(denom) < 1e-9) return Infinity // parallel
  const qx = s.x1 - ox
  const qy = s.y1 - oy
  const t = (qx * sy - qy * sx) / denom
  const u = (qx * dy - qy * dx) / denom
  if (t > 0.01 && u >= 0 && u <= 1) return t
  return Infinity
}

export interface RaySample {
  x: number
  y: number
  /** distance from the light origin */
  d: number
  /** index of the hit segment, or -1 when the ray reached full radius */
  segIdx: number
}

/**
 * Cast the beam's fan of rays: uniform sampling for the smooth arc plus
 * extra rays aimed at segment endpoints so corners stay crisp.
 */
export function castRays(
  ox: number,
  oy: number,
  radius: number,
  startRad: number,
  beamRad: number,
  segments: OccluderSegment[],
): RaySample[] {
  const near = segments.filter((s) => distToSegment(ox, oy, s) <= radius)

  const deltas = new Set<number>()
  const uniform = Math.min(120, Math.max(24, Math.ceil(beamRad / (3 * DEG))))
  for (let i = 0; i <= uniform; i++) deltas.add((beamRad * i) / uniform)
  for (const s of near) {
    for (const [ex, ey] of [
      [s.x1, s.y1],
      [s.x2, s.y2],
    ]) {
      const delta = norm2pi(Math.atan2(ey - oy, ex - ox) - startRad)
      if (delta <= beamRad) {
        deltas.add(delta)
        if (delta - 8e-4 > 0) deltas.add(delta - 8e-4)
        if (delta + 8e-4 < beamRad) deltas.add(delta + 8e-4)
      }
    }
  }

  const sorted = [...deltas].sort((a, b) => a - b)
  const samples: RaySample[] = []
  for (const delta of sorted) {
    const a = startRad + delta
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    let best = Infinity
    let bestIdx = -1
    for (let i = 0; i < near.length; i++) {
      const t = raySegment(ox, oy, dx, dy, near[i])
      if (t < best) {
        best = t
        bestIdx = i
      }
    }
    const hit = best < radius - 0.5
    const d = hit ? best : radius
    samples.push({ x: ox + dx * d, y: oy + dy * d, d, segIdx: hit ? bestIdx : -1 })
  }
  return samples
}

/**
 * The light's visible area: a polygon fan clipped by the occluders, plus
 * the lit stretches of surfaces (grouped consecutive hits on the same
 * segment) that render as reflected-light glow.
 */
export function computeLightArea(
  light: PhotoLightElement,
  segments: OccluderSegment[],
): LightArea {
  const radius = Math.max(20, light.falloff || 300)
  const beamRad = Math.min(358, Math.max(2, light.beamAngle)) * DEG
  // canvas convention: rotation 0 points "up" (−y) → direction −90°
  const dir = (light.rotation - 90) * DEG
  const startRad = dir - beamRad / 2

  const samples = castRays(light.x, light.y, radius, startRad, beamRad, segments)

  let path = `M ${r1(light.x)} ${r1(light.y)}`
  for (const p of samples) path += ` L ${r1(p.x)} ${r1(p.y)}`
  path += ' Z'

  const bounces: BounceSegment[] = []
  let run: RaySample[] = []
  const flush = () => {
    if (run.length >= 2) {
      const first = run[0]
      const last = run[run.length - 1]
      const strength = run.reduce((acc, s) => acc + (1 - s.d / radius), 0) / run.length
      bounces.push({
        x1: r1(first.x),
        y1: r1(first.y),
        x2: r1(last.x),
        y2: r1(last.y),
        strength: Math.max(0, Math.min(1, strength)),
      })
    }
    run = []
  }
  for (const s of samples) {
    if (s.segIdx === -1) {
      flush()
    } else if (run.length && run[run.length - 1].segIdx !== s.segIdx) {
      flush()
      run.push(s)
    } else {
      run.push(s)
    }
  }
  flush()

  return { path, bounces }
}
