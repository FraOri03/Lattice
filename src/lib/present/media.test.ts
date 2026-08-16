import { describe, expect, it } from 'vitest'
import {
  FULL_CROP,
  adjustmentFilter,
  cropStyle,
  focalPosition,
  hasAdjustments,
  isFullCrop,
  normalizeCrop,
  normalizeFocal,
  sanitizeAdjustments,
  unsupportedMediaNotes,
} from './media'
import {
  detached,
  linkedItems,
  planUpdates,
  sanitizeLinkRef,
  summarizeLinks,
  syncStateOf,
  withCapturedRev,
  type LinkRef,
  type SourceState,
} from './linked'
import { chartDataOf, formatRange, isEmptyChart, parseRange, readRange } from './sheetRange'
import { createSlide, type PresentationBody } from './presentModel'
import type { SheetData } from '@/lib/sheet/sheetModel'

describe('crop', () => {
  it('leaves a whole picture whole', () => {
    expect(normalizeCrop(undefined)).toEqual(FULL_CROP)
    expect(isFullCrop(FULL_CROP)).toBe(true)
  })

  it('keeps a crop inside the source', () => {
    const c = normalizeCrop({ x: 0.8, y: 0.9, w: 1, h: 1 })
    expect(c.x + c.w).toBeLessThanOrEqual(1)
    expect(c.y + c.h).toBeLessThanOrEqual(1)
  })

  it('never lets a crop collapse to nothing', () => {
    expect(normalizeCrop({ x: 0, y: 0, w: 0, h: -3 }).w).toBeGreaterThan(0)
  })

  it('expresses a crop as a scaled offset, so no pixel is ever copied', () => {
    const s = cropStyle({ x: 0.25, y: 0, w: 0.5, h: 1 })
    expect(s.width).toBe('200%')
    expect(s.left).toBe('-50%')
    expect(s.height).toBe('100%')
  })
})

describe('focal point', () => {
  it('sits in the middle until someone moves it', () => {
    expect(normalizeFocal(undefined)).toEqual({ x: 0.5, y: 0.5 })
    expect(focalPosition(undefined)).toBe('50% 50%')
  })

  it('clamps a point that wandered out of the frame', () => {
    expect(normalizeFocal({ x: 5, y: -2 })).toEqual({ x: 1, y: 0 })
  })
})

describe('adjustments', () => {
  it('is nothing at all when nothing was adjusted', () => {
    expect(adjustmentFilter(undefined)).toBeUndefined()
    expect(adjustmentFilter({})).toBeUndefined()
    expect(hasAdjustments({ brightness: 0 })).toBe(false)
  })

  it('builds a filter only from what was actually changed', () => {
    expect(adjustmentFilter({ brightness: 8, saturation: -12 })).toBe(
      'brightness(1.08) saturate(0.88)',
    )
  })

  it('drops values a renderer could not use, and keeps the rest', () => {
    expect(sanitizeAdjustments({ brightness: 8, contrast: 'lots', saturation: 0 })).toEqual({
      brightness: 8,
    })
  })

  it('tells the exporter what it cannot carry, rather than shipping it silently', () => {
    expect(unsupportedMediaNotes({ adjustments: { contrast: 4 } })).toHaveLength(1)
    expect(unsupportedMediaNotes({})).toHaveLength(0)
  })
})

describe('linked content — where a link stands', () => {
  const sources = new Map<string, SourceState>([['sheet1', { id: 'sheet1', rev: 47, label: 'Q3 metrics' }]])
  const link = (over: Partial<LinkRef> = {}): LinkRef => ({
    mode: 'link',
    kind: 'sheet',
    id: 'sheet1',
    rev: 41,
    ...over,
  })

  it('never calls a copy out of date — it made no promise', () => {
    expect(syncStateOf(link({ mode: 'copy' }), sources)).toBe('copy')
  })

  it('reports an update when the source has moved ahead', () => {
    expect(syncStateOf(link(), sources)).toBe('update-available')
  })

  it('is in sync when the revisions agree', () => {
    expect(syncStateOf(link({ rev: 47 }), sources)).toBe('in-sync')
  })

  it('says the source is gone rather than pretending it is current', () => {
    expect(syncStateOf(link({ id: 'vanished' }), sources)).toBe('missing')
  })

  it('has nothing to say about an element with no link', () => {
    expect(syncStateOf(undefined, sources)).toBeNull()
  })
})

describe('linked content — the deck-wide picture', () => {
  const sources = new Map<string, SourceState>([
    ['sheet1', { id: 'sheet1', rev: 47, label: 'Q3 metrics' }],
    ['board1', { id: 'board1', rev: 12 }],
  ])
  const el = (id: string, linkRef: LinkRef) => ({
    id,
    kind: 'shape' as const,
    shape: 'rect' as const,
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    z: 0,
    fill: null,
    stroke: null,
    strokeWidth: 1,
    linkRef,
  })
  const body: PresentationBody = {
    app: 'lattice-present',
    version: 6,
    theme: 'plain',
    slides: [
      createSlide({ id: 's1', elements: [el('a', { mode: 'link', kind: 'sheet', id: 'sheet1', rev: 41 })] }),
      createSlide({ id: 's2', elements: [el('b', { mode: 'embed', kind: 'board', id: 'board1', rev: 12 })] }),
      createSlide({ id: 's3', elements: [el('c', { mode: 'link', kind: 'document', id: 'gone', rev: 1 })] }),
    ],
  }

  it('finds every linked element and where it sits', () => {
    const items = linkedItems(body, sources)
    expect(items.map((i) => [i.elementId, i.slideIndex, i.state])).toEqual([
      ['a', 0, 'update-available'],
      ['b', 1, 'in-sync'],
      ['c', 2, 'missing'],
    ])
  })

  it('prefers the source’s own label to whatever was cached', () => {
    expect(linkedItems(body, sources)[0].label).toBe('Q3 metrics')
  })

  it('names the slides an update would rewrite, before rewriting them', () => {
    const plan = planUpdates(body, sources)
    expect(plan.slideNumbers).toEqual([1])
    expect(plan.items).toHaveLength(1)
  })

  it('summarises the deck in one line’s worth of counts', () => {
    expect(summarizeLinks(linkedItems(body, sources))).toEqual({
      copy: 0,
      'in-sync': 1,
      'update-available': 1,
      missing: 1,
    })
  })
})

describe('linked content — the two exits', () => {
  const link: LinkRef = { mode: 'link', kind: 'sheet', id: 's', rev: 41 }

  it('catching up records the revision it caught up to', () => {
    expect(withCapturedRev(link, 47).rev).toBe(47)
  })

  it('detaching keeps the content and drops only the tie', () => {
    expect(detached(link)).toMatchObject({ mode: 'copy', id: 's' })
  })
})

describe('sanitizeLinkRef', () => {
  it('keeps a well-formed link', () => {
    expect(sanitizeLinkRef({ mode: 'link', kind: 'sheet', id: 'x', ref: 'A1:B2', rev: 3 })).toEqual({
      mode: 'link',
      kind: 'sheet',
      id: 'x',
      ref: 'A1:B2',
      rev: 3,
    })
  })

  it('refuses a link it could never resolve', () => {
    expect(sanitizeLinkRef({ mode: 'link', kind: 'sheet' })).toBeUndefined()
    expect(sanitizeLinkRef({ mode: 'mirror', kind: 'sheet', id: 'x' })).toBeUndefined()
  })
})

describe('sheet ranges', () => {
  it('parses a named range and round-trips it', () => {
    const r = parseRange('Revenue!B2:E8')!
    expect(r).toMatchObject({ sheet: 'Revenue', r0: 1, c0: 1, r1: 7, c1: 4 })
    expect(formatRange(r)).toBe('Revenue!B2:E8')
  })

  it('accepts a bare range and a single cell', () => {
    expect(parseRange('B2:C3')).toMatchObject({ r0: 1, c0: 1, r1: 2, c1: 2 })
    expect(parseRange('B2')).toMatchObject({ r0: 1, c0: 1, r1: 1, c1: 1 })
  })

  it('orders the corners however they were written', () => {
    expect(parseRange('E8:B2')).toMatchObject({ r0: 1, c0: 1, r1: 7, c1: 4 })
  })

  it('says nothing rather than guessing at nonsense', () => {
    expect(parseRange('not a range')).toBeNull()
    expect(parseRange('')).toBeNull()
  })
})

describe('reading a range into a chart', () => {
  const sheet: SheetData = {
    id: 'sh',
    name: 'Revenue',
    rows: 10,
    cols: 5,
    cells: {
      '0:0': { v: 'Section' },
      '0:1': { v: 'Q2' },
      '0:2': { v: 'Q3' },
      '1:0': { v: 'Board' },
      '1:1': { v: 2410 },
      '1:2': { v: 3120 },
      '2:0': { v: 'Present' },
      '2:1': { v: '640' },
      '2:2': { v: '1 480' },
    },
    colW: {},
    rowH: {},
  }

  it('reads the block, empty cells included', () => {
    const table = readRange(sheet, parseRange('A1:C3')!)
    expect(table.rows).toHaveLength(3)
    expect(table.rows[1]).toEqual(['Board', 2410, 3120])
  })

  it('takes the header row as series names and the first column as categories', () => {
    const data = chartDataOf(readRange(sheet, parseRange('A1:C3')!))
    expect(data.categories).toEqual(['Board', 'Present'])
    expect(data.series.map((s) => s.name)).toEqual(['Q2', 'Q3'])
  })

  it('reads numbers a person typed with spaces or commas', () => {
    const data = chartDataOf(readRange(sheet, parseRange('A1:C3')!))
    expect(data.series[1].values).toEqual([3120, 1480])
  })

  it('treats an empty range as nothing to draw, not as an error', () => {
    const data = chartDataOf(readRange(sheet, parseRange('E9:E9')!))
    expect(isEmptyChart(data)).toBe(true)
  })
})
