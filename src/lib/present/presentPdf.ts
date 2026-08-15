import { presentableSlides } from './sections'
import { furnitureElements, masterTokensFor } from './masters'
import { docOf, linesOf, type TextLine } from './richtext'
import { resolveTextRender, type TextRender } from './textStyles'
import {
  SLIDE_H,
  SLIDE_W,
  type PresentationBody,
  type PresentElement,
  type TextElement,
} from './presentModel'

/**
 * Presentation → PDF (Phase 8). Slides are absolutely-positioned boxes
 * on a fixed canvas, which maps 1:1 onto jsPDF drawing calls — real
 * vector output, not screenshots. jsPDF loads lazily (own chunk).
 */

function hex(color: string, fallback: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : fallback
}

export async function exportPresentationPdf(
  title: string,
  body: PresentationBody,
): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [SLIDE_W, SLIDE_H],
    compress: true,
  })
  // hidden slides are part of the deck, not of the presentation (19E.1)
  presentableSlides(body).forEach((slide, i) => {
    // each slide paints with its own master's tokens (19E.2), so a deck of
    // several masters exports the way it looks
    const theme = masterTokensFor(body, slide)
    if (i > 0) doc.addPage([SLIDE_W, SLIDE_H], 'landscape')
    doc.setFillColor(hex(slide.background ?? theme.bg, theme.bg))
    doc.rect(0, 0, SLIDE_W, SLIDE_H, 'F')

    const els = [...slide.elements, ...furnitureElements(body, slide, i + 1, theme)].sort(
      (a, b) => a.z - b.z,
    )
    for (const el of els) {
      drawElement(doc, el, theme.text, resolveTextRender(el as TextElement, theme, body.textStyles))
    }
  })

  doc.setProperties({ title })
  return doc.output('blob')
}

/**
 * Draw a text box run by run (19E.3).
 *
 * jsPDF wraps a string, not a sequence of styled runs, so the wrapping is done
 * here: each run is split into words, measured with its own font set, and laid
 * into visual lines. Without this a box with mixed formatting would have to
 * collapse to one style, and the PDF would stop matching the canvas.
 */
function drawRichText(
  doc: import('jspdf').jsPDF,
  el: PresentElement & { kind: 'text' },
  themeText: string,
  render: TextRender,
): void {
  const size = render.size
  const color = hex(el.color ?? render.color ?? themeText, themeText)
  doc.setTextColor(color)
  doc.setFontSize(size)

  const face = (run: { bold?: boolean; italic?: boolean }) => {
    const bold = run.bold || render.weight >= 600
    const italic = run.italic || el.italic
    doc.setFont('helvetica', bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal')
  }

  type Piece = { text: string; bold?: boolean; italic?: boolean; width: number }
  const lineHeight = size * render.lineHeight
  const maxWidth = el.w - (render.padding ?? 0) * 2
  const sourceLines = linesOf(docOf(el))
  const lines: TextLine[] = sourceLines.length
    ? sourceLines
    : el.text.split('\n').map((text) => ({ runs: [{ text }], level: 0 }))

  let y = el.y + (render.padding ?? 0) + size
  for (const line of lines) {
    const marker = line.list ? (line.list === 'bullet' ? '•  ' : '—  ') : ''
    const indent = (render.padding ?? 0) + line.level * size
    // break every run into words, keeping each word's own styling
    const words: Piece[] = []
    let first = true
    for (const run of line.runs) {
      face(run)
      for (const word of run.text.split(/(\s+)/)) {
        if (!word) continue
        const text = first && marker ? marker + word : word
        first = false
        words.push({ text, bold: run.bold, italic: run.italic, width: doc.getTextWidth(text) })
      }
    }
    if (!words.length) {
      y += lineHeight
      continue
    }
    // pack words into visual lines
    const visual: Piece[][] = [[]]
    let used = 0
    for (const w of words) {
      if (used + w.width > maxWidth && visual[visual.length - 1].length) {
        visual.push([])
        used = 0
      }
      visual[visual.length - 1].push(w)
      used += w.width
    }
    for (const vline of visual) {
      if (y > el.y + el.h + lineHeight) return
      const total = vline.reduce((n, w) => n + w.width, 0)
      let x = el.x + indent
      if (render.align === 'center') x = el.x + (el.w - total) / 2
      else if (render.align === 'right') x = el.x + el.w - total - (render.padding ?? 0)
      for (const w of vline) {
        face(w)
        doc.text(w.text, x, y)
        x += w.width
      }
      y += lineHeight
    }
  }
}

function drawElement(
  doc: import('jspdf').jsPDF,
  el: PresentElement,
  themeText: string,
  render: TextRender,
): void {
  switch (el.kind) {
    case 'shape': {
      const fill = el.fill ? hex(el.fill, '#cccccc') : null
      const stroke = el.stroke ? hex(el.stroke, '#888888') : null
      if (fill) doc.setFillColor(fill)
      if (stroke) {
        doc.setDrawColor(stroke)
        doc.setLineWidth(el.strokeWidth || 1)
      }
      const style = fill && stroke ? 'FD' : fill ? 'F' : 'S'
      if (el.shape === 'rect') doc.rect(el.x, el.y, el.w, el.h, style)
      else if (el.shape === 'ellipse')
        doc.ellipse(el.x + el.w / 2, el.y + el.h / 2, el.w / 2, el.h / 2, style)
      else {
        doc.setDrawColor(stroke ?? '#888888')
        doc.setLineWidth(el.strokeWidth || 2)
        doc.line(el.x, el.y + el.h / 2, el.x + el.w, el.y + el.h / 2)
      }
      return
    }
    case 'image': {
      try {
        const format = el.src.includes('image/png')
          ? 'PNG'
          : el.src.includes('image/webp')
            ? 'WEBP'
            : 'JPEG'
        doc.addImage(el.src, format, el.x, el.y, el.w, el.h)
      } catch {
        // unsupported encoding: draw a labelled placeholder, never fail the deck
        doc.setDrawColor('#bbbbbb')
        doc.rect(el.x, el.y, el.w, el.h, 'S')
        doc.setFontSize(10)
        doc.setTextColor('#888888')
        doc.text('image', el.x + 6, el.y + 14)
      }
      return
    }
    case 'text': {
      drawRichText(doc, el, themeText, render)
      return
    }
  }
}
