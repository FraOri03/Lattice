import {
  SLIDE_H,
  SLIDE_W,
  THEME_COLORS,
  type PresentationBody,
  type PresentElement,
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
  const theme = THEME_COLORS[body.theme]

  body.slides.forEach((slide, i) => {
    if (i > 0) doc.addPage([SLIDE_W, SLIDE_H], 'landscape')
    doc.setFillColor(hex(slide.background ?? theme.bg, theme.bg))
    doc.rect(0, 0, SLIDE_W, SLIDE_H, 'F')

    const els = [...slide.elements].sort((a, b) => a.z - b.z)
    for (const el of els) drawElement(doc, el, theme.text)
  })

  doc.setProperties({ title })
  return doc.output('blob')
}

function drawElement(
  doc: import('jspdf').jsPDF,
  el: PresentElement,
  themeText: string,
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
      doc.setTextColor(hex(el.color ?? themeText, themeText))
      doc.setFont(
        'helvetica',
        el.bold && el.italic ? 'bolditalic' : el.bold ? 'bold' : el.italic ? 'italic' : 'normal',
      )
      doc.setFontSize(el.fontSize)
      const lineHeight = el.fontSize * 1.25
      const lines = doc.splitTextToSize(el.text, el.w) as string[]
      lines.forEach((line, i) => {
        const y = el.y + el.fontSize + i * lineHeight
        if (y > el.y + el.h + lineHeight) return
        const x =
          el.align === 'center' ? el.x + el.w / 2 : el.align === 'right' ? el.x + el.w : el.x
        doc.text(line, x, y, { align: el.align })
      })
      return
    }
  }
}
