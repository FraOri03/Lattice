import { describe, expect, it } from 'vitest'
import {
  assignSlideToSection,
  moveSection,
  presentableSlides,
  removeSection,
  renameSection,
  sectionRuns,
  setSectionCollapsed,
  startSectionAt,
} from './sections'
import type { PresentSlide, PresentationBody } from './presentModel'

const slide = (id: string, extra: Partial<PresentSlide> = {}): PresentSlide => ({
  id,
  background: null,
  notes: '',
  elements: [],
  ...extra,
})

const deck = (slides: PresentSlide[], sections?: PresentationBody['sections']): PresentationBody => ({
  app: 'lattice-present',
  version: 3,
  theme: 'plain',
  slides,
  ...(sections ? { sections } : {}),
})

describe('sectionRuns', () => {
  it('gives one unsectioned run when nobody made a section', () => {
    const runs = sectionRuns(deck([slide('a'), slide('b')]))
    expect(runs).toHaveLength(1)
    expect(runs[0].section).toBeNull()
    expect(runs[0].slides.map((s) => s.slide.id)).toEqual(['a', 'b'])
  })

  it('keeps each slide’s real deck index, so the rail can act on it', () => {
    const body = deck(
      [slide('a'), slide('b', { sectionId: 's1' }), slide('c', { sectionId: 's1' })],
      [{ id: 's1', title: 'Middle' }],
    )
    const runs = sectionRuns(body)
    expect(runs.map((r) => r.section?.title ?? null)).toEqual([null, 'Middle'])
    expect(runs[1].slides.map((s) => s.index)).toEqual([1, 2])
  })

  it('splits a broken-up section into separate runs instead of lying about order', () => {
    const body = deck(
      [
        slide('a', { sectionId: 's1' }),
        slide('b'),
        slide('c', { sectionId: 's1' }),
      ],
      [{ id: 's1', title: 'Split' }],
    )
    const runs = sectionRuns(body)
    expect(runs).toHaveLength(3)
    expect(runs.map((r) => r.slides.map((s) => s.slide.id))).toEqual([['a'], ['b'], ['c']])
  })

  it('treats a slide pointing at a missing section as unsectioned, never dropping it', () => {
    const runs = sectionRuns(deck([slide('a', { sectionId: 'gone' })]))
    expect(runs[0].section).toBeNull()
    expect(runs[0].slides).toHaveLength(1)
  })
})

describe('startSectionAt', () => {
  it('takes the rest of the current run and stops at the next boundary', () => {
    const body = deck(
      [slide('a'), slide('b'), slide('c'), slide('d', { sectionId: 's9' })],
      [{ id: 's9', title: 'Later' }],
    )
    const next = startSectionAt(body, 1, 'New')
    const created = next.sections!.find((s) => s.title === 'New')!
    expect(next.slides.map((s) => s.sectionId)).toEqual([
      undefined,
      created.id,
      created.id,
      's9',
    ])
  })

  it('is a no-op on an index that does not exist', () => {
    const body = deck([slide('a')])
    expect(startSectionAt(body, 7)).toBe(body)
  })
})

describe('moveSection', () => {
  const body = deck(
    [
      slide('a', { sectionId: 's1' }),
      slide('b', { sectionId: 's1' }),
      slide('c', { sectionId: 's2' }),
    ],
    [
      { id: 's1', title: 'One' },
      { id: 's2', title: 'Two' },
    ],
  )

  it('carries every slide of the run with it', () => {
    const moved = moveSection(body, 's1', 1)
    expect(moved.slides.map((s) => s.id)).toEqual(['c', 'a', 'b'])
  })

  it('refuses to walk off either end', () => {
    expect(moveSection(body, 's1', -1)).toBe(body)
    expect(moveSection(body, 's2', 1)).toBe(body)
  })

  it('ignores a section that is not there', () => {
    expect(moveSection(body, 'nope', 1)).toBe(body)
  })
})

describe('removeSection', () => {
  it('drops the heading and keeps every slide in place', () => {
    const body = deck(
      [slide('a', { sectionId: 's1' }), slide('b', { sectionId: 's1' })],
      [{ id: 's1', title: 'Gone' }],
    )
    const next = removeSection(body, 's1')
    expect(next.slides.map((s) => s.id)).toEqual(['a', 'b'])
    expect(next.slides.every((s) => s.sectionId === undefined)).toBe(true)
    expect(next.sections).toBeUndefined()
  })
})

describe('rename and collapse', () => {
  const body = deck([slide('a', { sectionId: 's1' })], [{ id: 's1', title: 'Old' }])

  it('renames in place', () => {
    expect(renameSection(body, 's1', 'New').sections![0].title).toBe('New')
  })

  it('stores collapsed only when true, so the default stays absent', () => {
    expect(setSectionCollapsed(body, 's1', true).sections![0].collapsed).toBe(true)
    expect(setSectionCollapsed(body, 's1', false).sections![0].collapsed).toBeUndefined()
  })
})

describe('assignSlideToSection', () => {
  it('moves one slide in and back out', () => {
    const body = deck([slide('a')], [{ id: 's1', title: 'S' }])
    const inside = assignSlideToSection(body, 'a', 's1')
    expect(inside.slides[0].sectionId).toBe('s1')
    expect(assignSlideToSection(inside, 'a', undefined).slides[0].sectionId).toBeUndefined()
  })
})

describe('presentableSlides', () => {
  it('leaves hidden slides in the deck and out of the presentation', () => {
    const body = deck([slide('a'), slide('b', { hidden: true }), slide('c')])
    expect(body.slides).toHaveLength(3)
    expect(presentableSlides(body).map((s) => s.id)).toEqual(['a', 'c'])
  })
})
