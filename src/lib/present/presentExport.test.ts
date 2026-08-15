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
