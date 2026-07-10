import JSZip from 'jszip'
import { nid } from '@/lib/id'
import {
  SLIDE_H,
  SLIDE_W,
  createSlide,
  createTextElement,
  type ImageElement,
  type PresentSlide,
  type PresentationBody,
} from './presentModel'

/**
 * PPTX / ODP → PresentationBody (Phase 8).
 *
 * Honest scope: text runs with their box geometry (when present) and
 * embedded images. Masters, themes, animations, charts and grouped
 * shapes are NOT converted — every loss lands in the conversion report,
 * and the original file is always preserved as the source asset.
 */

export interface PresentImportResult {
  body: PresentationBody
  report: string[]
}

const EMU_PER_PX = 9525

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml')
}

const bytesToDataUrl = (data: Uint8Array, mime: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('image read failed'))
    const buffer = new ArrayBuffer(data.byteLength)
    new Uint8Array(buffer).set(data)
    reader.readAsDataURL(new Blob([buffer], { type: mime }))
  })

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

/* ================= PPTX ================= */

export async function importPptx(file: Blob): Promise<PresentImportResult> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const report: string[] = []

  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
  if (!slideNames.length) throw new Error('No slides found in this PPTX')

  const slides: PresentSlide[] = []
  let skippedShapes = 0
  let defaultLayouts = 0

  for (const name of slideNames) {
    const xml = parseXml(await zip.files[name].async('text'))
    const slide = createSlide()
    let z = 0
    let stackY = 60

    // relationships for this slide (images)
    const relName = name.replace('slides/', 'slides/_rels/') + '.rels'
    const relTargets = new Map<string, string>()
    if (zip.files[relName]) {
      const relXml = parseXml(await zip.files[relName].async('text'))
      for (const rel of Array.from(relXml.getElementsByTagName('Relationship'))) {
        relTargets.set(rel.getAttribute('Id') ?? '', rel.getAttribute('Target') ?? '')
      }
    }

    const readGeom = (
      holder: Element | null,
    ): { x: number; y: number; w: number; h: number } | null => {
      const off = holder?.getElementsByTagNameNS('*', 'off')[0]
      const ext = holder?.getElementsByTagNameNS('*', 'ext')[0]
      if (!off || !ext) return null
      return {
        x: Number(off.getAttribute('x')) / EMU_PER_PX,
        y: Number(off.getAttribute('y')) / EMU_PER_PX,
        w: Number(ext.getAttribute('cx')) / EMU_PER_PX,
        h: Number(ext.getAttribute('cy')) / EMU_PER_PX,
      }
    }

    // text shapes
    for (const sp of Array.from(xml.getElementsByTagNameNS('*', 'sp'))) {
      const paras = Array.from(sp.getElementsByTagNameNS('*', 'p'))
        .map((p) =>
          Array.from(p.getElementsByTagNameNS('*', 't'))
            .map((t) => t.textContent ?? '')
            .join(''),
        )
        .filter((line, i, all) => line.trim() || i < all.length - 1)
      const text = paras.join('\n').trim()
      if (!text) {
        skippedShapes++
        continue
      }
      const geom = readGeom(sp.getElementsByTagNameNS('*', 'xfrm')[0] ?? null)
      const firstSz = sp.getElementsByTagNameNS('*', 'rPr')[0]?.getAttribute('sz')
      const fontSize = firstSz ? Math.round(Number(firstSz) / 100) : 22
      if (!geom) defaultLayouts++
      slide.elements.push(
        createTextElement({
          text,
          fontSize: Math.min(72, Math.max(10, fontSize)),
          x: geom?.x ?? 80,
          y: geom?.y ?? stackY,
          w: Math.min(SLIDE_W - 40, geom?.w ?? SLIDE_W - 160),
          h: geom?.h ?? Math.max(50, paras.length * fontSize * 1.4),
          z: z++,
        }),
      )
      if (!geom) stackY += Math.max(60, paras.length * fontSize * 1.4 + 20)
    }

    // images
    for (const pic of Array.from(xml.getElementsByTagNameNS('*', 'pic'))) {
      const embed =
        pic.getElementsByTagNameNS('*', 'blip')[0]?.getAttribute('r:embed') ??
        pic.getElementsByTagNameNS('*', 'blip')[0]?.getAttributeNS(
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
          'embed',
        )
      const target = embed ? relTargets.get(embed) : undefined
      if (!target) continue
      const path = target.replace('../', 'ppt/')
      const entry = zip.files[path]
      if (!entry) continue
      const ext = path.split('.').pop()?.toLowerCase() ?? 'png'
      const mime = MIME_BY_EXT[ext]
      if (!mime) {
        report.push(`Image "${path.split('/').pop()}" uses an unsupported encoding (${ext}) and was skipped`)
        continue
      }
      const geom = readGeom(pic.getElementsByTagNameNS('*', 'xfrm')[0] ?? null)
      const src = await bytesToDataUrl(await entry.async('uint8array'), mime)
      const img: ImageElement = {
        id: nid('el'),
        kind: 'image',
        src,
        x: geom?.x ?? 120,
        y: geom?.y ?? stackY,
        w: geom?.w ?? 400,
        h: geom?.h ?? 300,
        z: z++,
      }
      slide.elements.push(img)
      if (!geom) stackY += img.h + 20
    }

    slides.push(slide)
  }

  if (skippedShapes) report.push(`${skippedShapes} empty/decorative shapes were skipped`)
  if (defaultLayouts)
    report.push(`${defaultLayouts} text boxes had no explicit geometry (inherited from layouts) and were auto-placed`)
  report.push('Masters, themes, animations, charts and grouped shapes are not converted')

  return {
    body: { app: 'lattice-present', version: 1, theme: 'plain', slides },
    report,
  }
}

/* ================= ODP ================= */

/** "2.54cm" | "1in" | "72pt" | "96px" → px @96dpi. */
function odfLenToPx(v: string | null): number | null {
  if (!v) return null
  const m = /^(-?[\d.]+)(cm|mm|in|pt|px)$/.exec(v.trim())
  if (!m) return null
  const n = Number(m[1])
  switch (m[2]) {
    case 'cm':
      return (n / 2.54) * 96
    case 'mm':
      return (n / 25.4) * 96
    case 'in':
      return n * 96
    case 'pt':
      return (n / 72) * 96
    default:
      return n
  }
}

export async function importOdp(file: Blob): Promise<PresentImportResult> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const content = zip.files['content.xml']
  if (!content) throw new Error('Not a valid ODP package (content.xml missing)')
  const xml = parseXml(await content.async('text'))
  const report: string[] = []

  const pages = Array.from(xml.getElementsByTagNameNS('*', 'page'))
  if (!pages.length) throw new Error('No slides found in this ODP')

  const slides: PresentSlide[] = []
  for (const page of pages) {
    const slide = createSlide()
    let z = 0
    let stackY = 60
    for (const frame of Array.from(page.getElementsByTagNameNS('*', 'frame'))) {
      const x = odfLenToPx(frame.getAttribute('svg:x'))
      const y = odfLenToPx(frame.getAttribute('svg:y'))
      const w = odfLenToPx(frame.getAttribute('svg:width'))
      const h = odfLenToPx(frame.getAttribute('svg:height'))

      const image = frame.getElementsByTagNameNS('*', 'image')[0]
      if (image) {
        const href =
          image.getAttribute('xlink:href') ??
          image.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
        const entry = href ? zip.files[href.replace(/^\.\//, '')] : undefined
        const ext = href?.split('.').pop()?.toLowerCase() ?? ''
        const mime = MIME_BY_EXT[ext]
        if (entry && mime) {
          slide.elements.push({
            id: nid('el'),
            kind: 'image',
            src: await bytesToDataUrl(await entry.async('uint8array'), mime),
            x: x ?? 120,
            y: y ?? stackY,
            w: w ?? 400,
            h: h ?? 300,
            z: z++,
          })
        } else if (href) {
          report.push(`Image "${href}" could not be converted`)
        }
        continue
      }

      const lines = Array.from(frame.getElementsByTagNameNS('*', 'p'))
        .map((p) => p.textContent ?? '')
        .filter(Boolean)
      const text = lines.join('\n').trim()
      if (!text) continue
      slide.elements.push(
        createTextElement({
          text,
          fontSize: 22,
          x: x ?? 80,
          y: y ?? stackY,
          w: Math.min(SLIDE_W - 40, w ?? SLIDE_W - 160),
          h: Math.min(SLIDE_H - 40, h ?? Math.max(50, lines.length * 32)),
          z: z++,
        }),
      )
      if (y == null) stackY += Math.max(60, lines.length * 32 + 20)
    }
    slides.push(slide)
  }

  report.push('ODP styles, masters and animations are not converted; font sizes use a default')

  return {
    body: { app: 'lattice-present', version: 1, theme: 'plain', slides },
    report,
  }
}
