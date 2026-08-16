import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { exportPresentationPptx } from './presentPptx'
import { createSlide, createTextElement, type PresentationBody } from './presentModel'

/**
 * Export is "what an audience would see", so it has to agree with the rail
 * about which slides are part of the presentation (19E.1).
 */

const deck = (): PresentationBody => ({
  app: 'lattice-present',
  version: 3,
  theme: 'plain',
  slides: [
    createSlide({ id: 'a', elements: [createTextElement({ text: 'First' })] }),
    createSlide({ id: 'b', hidden: true, elements: [createTextElement({ text: 'Skipped' })] }),
    createSlide({ id: 'c', elements: [createTextElement({ text: 'Last' })] }),
  ],
})

/**
 * The exporter hands back a Blob; the Blob this environment produces has no
 * `arrayBuffer()`, so go through JSZip, which reads a Blob directly.
 */
const open = (blob: Blob) => JSZip.loadAsync(blob as unknown as ArrayBuffer)

const slideParts = async (blob: Blob): Promise<string[]> => {
  const zip = await open(blob)
  return Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort()
}

describe('PPTX export — hidden slides', () => {
  it('writes one part per presentable slide, not per deck slide', async () => {
    const parts = await slideParts(await exportPresentationPptx(deck()))
    expect(parts).toHaveLength(2)
  })

  it('leaves the hidden slide’s content out of the file entirely', async () => {
    const blob = await exportPresentationPptx(deck())
    const zip = await open(blob)
    const xml = await Promise.all(
      Object.keys(zip.files)
        .filter((n) => n.endsWith('.xml'))
        .map((n) => zip.files[n].async('text')),
    )
    const all = xml.join('')
    expect(all).toContain('First')
    expect(all).toContain('Last')
    expect(all).not.toContain('Skipped')
  })

  it('numbers the remaining slides contiguously, so the package stays valid', async () => {
    const parts = await slideParts(await exportPresentationPptx(deck()))
    expect(parts).toEqual(['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml'])
  })

  it('exports every slide when none is hidden', async () => {
    const body = deck()
    body.slides[1].hidden = undefined
    expect(await slideParts(await exportPresentationPptx(body))).toHaveLength(3)
  })
})

/**
 * Furniture is drawn from the master on the canvas; if the exporter drew it
 * from somewhere else — or not at all — the file would not match the screen.
 */
describe('PPTX export — master furniture (19E.2)', () => {
  const master = { id: 'm1', name: 'Content', furniture: { footerText: 'Lattice · Phase 19', slideNumber: true } }
  const footed = (): PresentationBody => {
    const body = deck()
    body.slides = body.slides.filter((s) => !s.hidden).map((s) => ({ ...s, masterId: 'm1' }))
    body.masters = [master]
    return body
  }

  const allXml = async (blob: Blob): Promise<string> => {
    const zip = await open(blob)
    const parts = await Promise.all(
      Object.keys(zip.files)
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .map((n) => zip.files[n].async('text')),
    )
    return parts.join('')
  }

  it('writes the master’s footer onto every slide that follows it', async () => {
    const xml = await allXml(await exportPresentationPptx(footed()))
    expect(xml.match(/Lattice · Phase 19/g)).toHaveLength(2)
  })

  it('numbers the slides as the master asked', async () => {
    const xml = await allXml(await exportPresentationPptx(footed()))
    expect(xml).toContain('<a:t>1</a:t>')
    expect(xml).toContain('<a:t>2</a:t>')
  })

  it('draws no furniture for a deck without masters', async () => {
    const xml = await allXml(await exportPresentationPptx(deck()))
    expect(xml).not.toContain('Lattice · Phase 19')
  })
})

/**
 * OOXML has runs natively, so mixed formatting should export as what it is
 * rather than collapsing to the box's dominant style (19E.3).
 */
describe('PPTX export — structured text (19E.3)', () => {
  const richDeck = (doc: unknown): PresentationBody => ({
    app: 'lattice-present',
    version: 5,
    theme: 'plain',
    slides: [
      createSlide({
        id: 'a',
        elements: [createTextElement({ id: 't', text: 'plain bold', doc: doc as never })],
      }),
    ],
  })

  const slideXml = async (blob: Blob): Promise<string> => {
    const zip = await open(blob)
    return zip.files['ppt/slides/slide1.xml'].async('text')
  }

  it('writes one run per formatting change, not one per box', async () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'plain ' },
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
          ],
        },
      ],
    }
    const xml = await slideXml(await exportPresentationPptx(richDeck(doc)))
    const runs = xml.match(/<a:r>/g) ?? []
    expect(runs.length).toBeGreaterThanOrEqual(2)
    expect(xml).toMatch(/b="1"[^>]*>?[\s\S]*?<a:t>bold<\/a:t>/)
    expect(xml).toContain('<a:t>plain </a:t>')
  })

  it('exports a bullet list as a real PowerPoint bullet', async () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] },
          ],
        },
      ],
    }
    const xml = await slideXml(await exportPresentationPptx(richDeck(doc)))
    expect(xml).toContain('<a:buChar char="•"/>')
    expect(xml).toContain('<a:t>one</a:t>')
  })

  it('still exports a box that only ever had a string', async () => {
    const body = richDeck(undefined)
    const xml = await slideXml(await exportPresentationPptx(body))
    expect(xml).toContain('<a:t>plain bold</a:t>')
  })
})

/**
 * A chart has to leave as a chart (19E.4): the file holds the numbers, so
 * PowerPoint can re-plot and re-type them. An image of a chart would look the
 * same in a screenshot and be useless in the file.
 */
describe('PPTX export — charts and tables (19E.4)', () => {
  const chartDeck = (): PresentationBody => ({
    app: 'lattice-present',
    version: 6,
    theme: 'plain',
    slides: [
      createSlide({
        id: 'a',
        elements: [
          {
            id: 'c1',
            kind: 'chart',
            chart: 'bar',
            title: 'Adoption',
            x: 40, y: 40, w: 400, h: 300, z: 0,
            data: {
              categories: ['Board', 'Present'],
              series: [{ name: 'Q3', values: [3120, 1480] }],
            },
          },
          {
            id: 't1',
            kind: 'table',
            headerRow: true,
            x: 500, y: 40, w: 380, h: 200, z: 1,
            cells: [['Section', 'Q3'], ['Board', '3 120']],
          },
        ],
      }),
    ],
  })

  it('writes a real chart part, not a picture', async () => {
    const zip = await open(await exportPresentationPptx(chartDeck()))
    expect(Object.keys(zip.files)).toContain('ppt/charts/chart1.xml')
    const slide = await zip.files['ppt/slides/slide1.xml'].async('text')
    expect(slide).toContain('drawingml/2006/chart')
    expect(slide).not.toContain('<p:pic>')
  })

  it('carries the cached numbers PowerPoint needs to re-plot', async () => {
    const zip = await open(await exportPresentationPptx(chartDeck()))
    const chart = await zip.files['ppt/charts/chart1.xml'].async('text')
    expect(chart).toContain('<c:barChart>')
    expect(chart).toContain('<c:v>3120</c:v>')
    expect(chart).toContain('<c:v>Board</c:v>')
    expect(chart).toContain('<c:v>Q3</c:v>')
  })

  it('declares the chart part so the package stays valid', async () => {
    const zip = await open(await exportPresentationPptx(chartDeck()))
    const types = await zip.files['[Content_Types].xml'].async('text')
    expect(types).toContain('/ppt/charts/chart1.xml')
    const rels = await zip.files['ppt/slides/_rels/slide1.xml.rels'].async('text')
    expect(rels).toContain('../charts/chart1.xml')
  })

  it('writes a table as cells, not as text in a box', async () => {
    const zip = await open(await exportPresentationPptx(chartDeck()))
    const slide = await zip.files['ppt/slides/slide1.xml'].async('text')
    expect(slide).toContain('<a:tbl>')
    expect(slide).toContain('<a:t>Section</a:t>')
    expect(slide).toContain('<a:t>3 120</a:t>')
  })
})
