import { describe, expect, it } from 'vitest'
import {
  PRESENT_BODY_VERSION,
  createPresentBody,
  migratePresentBody,
  normalizePresentBody,
} from './presentModel'

/**
 * The body-migration contract (Phase 0 / audit §19): always yields a valid
 * current-version body, repairs malformed geometry, and — critically — NEVER
 * drops unknown fields, so a body written by a newer build survives a
 * round-trip through an older one.
 */

describe('present body migration', () => {
  it('stamps the current version and keeps slides', () => {
    const v1 = {
      app: 'lattice-present',
      version: 1,
      theme: 'ink',
      slides: [
        {
          id: 's1',
          background: null,
          notes: 'n',
          elements: [
            { id: 'e1', kind: 'text', x: 1, y: 2, w: 3, h: 4, z: 0, text: 'hi', fontSize: 20, bold: false, italic: false, align: 'left', color: null },
          ],
        },
      ],
    }
    const out = migratePresentBody(v1)
    expect(out.version).toBe(PRESENT_BODY_VERSION)
    expect(out.theme).toBe('ink')
    expect(out.slides).toHaveLength(1)
    expect(out.slides[0].elements[0]).toMatchObject({ id: 'e1', text: 'hi' })
  })

  it('preserves unknown deck / slide / element fields', () => {
    const body = {
      app: 'lattice-present',
      version: 99,
      theme: 'plain',
      brandKit: { logo: 'x' }, // unknown deck field from a future schema
      slides: [
        {
          id: 's1',
          background: null,
          notes: '',
          layoutId: 'two-column', // unknown slide field
          elements: [
            { id: 'e1', kind: 'text', x: 0, y: 0, w: 10, h: 10, z: 0, text: 't', fontSize: 18, bold: false, italic: false, align: 'left', color: null, role: 'title' }, // unknown element field
          ],
        },
      ],
    }
    const out = migratePresentBody(body) as unknown as Record<string, unknown>
    expect(out.brandKit).toEqual({ logo: 'x' })
    const slide = (out.slides as Record<string, unknown>[])[0]
    expect(slide.layoutId).toBe('two-column')
    const el = (slide.elements as Record<string, unknown>[])[0]
    expect(el.role).toBe('title')
  })

  it('falls back to a valid deck for garbage input', () => {
    const out = migratePresentBody({ nope: true })
    expect(out.slides.length).toBeGreaterThan(0)
    expect(out.theme).toBe('plain')
    expect(out.version).toBe(PRESENT_BODY_VERSION)
  })

  it('repairs malformed element geometry and missing ids', () => {
    const body = {
      app: 'lattice-present',
      version: 1,
      theme: 'plain',
      slides: [
        {
          id: 's1',
          background: null,
          notes: '',
          elements: [
            { kind: 'shape', shape: 'rect', x: Number.NaN, y: 5, w: 'oops', h: -3, z: 1, fill: '#000', stroke: null, strokeWidth: 1 },
          ],
        },
      ],
    }
    const el = migratePresentBody(body).slides[0].elements[0]
    expect(typeof el.id).toBe('string')
    expect(el.id.length).toBeGreaterThan(0)
    expect(el.x).toBe(0) // NaN → 0
    expect(el.w).toBe(100) // invalid → default
    expect(el.h).toBe(1) // clamped to ≥1
  })

  it('coerces an invalid theme to plain', () => {
    const out = migratePresentBody({
      app: 'lattice-present',
      version: 1,
      theme: 'neon',
      slides: [{ id: 's', background: null, notes: '', elements: [] }],
    })
    expect(out.theme).toBe('plain')
  })

  it('normalizePresentBody delegates to the migration runner', () => {
    const fresh = createPresentBody('X')
    expect(normalizePresentBody(fresh).version).toBe(PRESENT_BODY_VERSION)
  })
})
