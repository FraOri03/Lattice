import { describe, expect, it } from 'vitest'
import {
  castRays,
  collectOccluders,
  computeLightArea,
  kelvinToColor,
  type OccluderSegment,
} from './lighting'
import type { PhotoElement, PhotoLightElement, PhotoPropElement } from '@/types/photo'

const baseEl = {
  id: 'el',
  name: 'el',
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  zIndex: 1,
  locked: false,
  hidden: false,
  color: '#ffffff',
}

function light(partial: Partial<PhotoLightElement> = {}): PhotoLightElement {
  return {
    ...baseEl,
    id: 'light-1',
    type: 'light',
    x: 0,
    y: 0,
    rotation: 0, // beam points up (−y)
    lightType: 'softbox',
    intensity: 80,
    colorTemperature: 5600,
    beamAngle: 60,
    falloff: 300,
    lightHeight: 180,
    showTargetLine: false,
    ...partial,
  }
}

function wall(partial: Partial<PhotoPropElement> = {}): PhotoPropElement {
  return {
    ...baseEl,
    id: 'wall-1',
    type: 'prop',
    x: 0,
    y: -150,
    rotation: 0,
    propType: 'wall',
    customSvgPath: 'wall',
    width: 400,
    height: 20,
    ...partial,
  }
}

/** Max sample distance from the origin, parsed straight from the samples. */
const maxDist = (samples: { d: number }[]) => Math.max(...samples.map((s) => s.d))

describe('kelvinToColor', () => {
  it('maps temperature bands to warm→cool colors', () => {
    expect(kelvinToColor(2500)).toBe('#ffaa44')
    expect(kelvinToColor(3200)).toBe('#ffcc88')
    expect(kelvinToColor(5600)).toBe('#fff3e0')
    expect(kelvinToColor(6500)).toBe('#e0f7fa')
    expect(kelvinToColor(9000)).toBe('#80deea')
  })
})

describe('collectOccluders', () => {
  it('turns a wall into 4 rect segments and skips glass/open frames', () => {
    const els: PhotoElement[] = [
      wall(),
      wall({ id: 'win', customSvgPath: 'window' }),
      wall({ id: 'tripod', customSvgPath: 'tripod' }),
    ]
    expect(collectOccluders(els)).toHaveLength(4)
  })

  it('skips hidden elements, cameras and lights', () => {
    const els: PhotoElement[] = [wall({ hidden: true }), light()]
    expect(collectOccluders(els)).toHaveLength(0)
  })

  it('approximates people as small circles (8 segments)', () => {
    const person: PhotoElement = {
      ...baseEl,
      id: 'p1',
      type: 'person',
      x: 50,
      y: 50,
      rotation: 0,
      role: 'Model',
      lookAngle: 0,
      personHeight: 175,
      pose: 'standing',
    }
    const segs = collectOccluders([person])
    expect(segs).toHaveLength(8)
    // all segment endpoints sit ~18cm from the person's center
    for (const s of segs) {
      expect(Math.hypot(s.x1 - 50, s.y1 - 50)).toBeCloseTo(18, 1)
    }
  })
})

describe('castRays', () => {
  it('reaches full radius in an empty scene', () => {
    const samples = castRays(0, 0, 300, -Math.PI / 2 - 0.5, 1, [])
    expect(samples.length).toBeGreaterThan(20)
    for (const s of samples) {
      expect(s.d).toBeCloseTo(300, 6)
      expect(s.segIdx).toBe(-1)
    }
  })

  it('clips rays at a blocking segment', () => {
    // horizontal wall 100cm above the origin, beam pointing up
    const seg: OccluderSegment = { x1: -200, y1: -100, x2: 200, y2: -100 }
    const samples = castRays(0, 0, 300, -Math.PI / 2 - 0.3, 0.6, [seg])
    // the straight-up ray stops at the wall (d ≈ 100), never beyond ~107
    const up = samples.reduce((a, b) => (Math.abs(b.x) < Math.abs(a.x) ? b : a))
    expect(up.d).toBeCloseTo(100, 0)
    expect(up.segIdx).toBe(0)
    expect(maxDist(samples)).toBeLessThan(300)
  })
})

describe('computeLightArea', () => {
  it('an unobstructed cone has no bounces and a closed path', () => {
    const area = computeLightArea(light(), [])
    expect(area.bounces).toHaveLength(0)
    expect(area.path.startsWith('M 0 0')).toBe(true)
    expect(area.path.endsWith('Z')).toBe(true)
  })

  it('a wall in the beam clips the cone and produces a bounce glow', () => {
    const els: PhotoElement[] = [wall()]
    const area = computeLightArea(light(), collectOccluders(els))
    expect(area.bounces.length).toBeGreaterThan(0)
    const b = area.bounces[0]
    // the lit stretch lies on the wall's near face (y = -140)
    expect(b.y1).toBeCloseTo(-140, 0)
    expect(b.y2).toBeCloseTo(-140, 0)
    expect(b.strength).toBeGreaterThan(0)
    expect(b.strength).toBeLessThanOrEqual(1)
  })

  it('light does not pass through the wall (no sample beyond it)', () => {
    const els: PhotoElement[] = [wall()]
    const samples = castRays(
      0,
      0,
      300,
      (-90 - 30) * (Math.PI / 180),
      60 * (Math.PI / 180),
      collectOccluders(els),
    )
    // wall near face at y=-140: within the wall's x-extent nothing goes past it
    for (const s of samples) {
      if (Math.abs(s.x) < 190) expect(s.y).toBeGreaterThanOrEqual(-140.5)
    }
  })

  it('handles a 180° tube beam without degenerating', () => {
    const area = computeLightArea(light({ beamAngle: 180, falloff: 200 }), [])
    expect(area.path.length).toBeGreaterThan(100)
    expect(area.bounces).toHaveLength(0)
  })
})
