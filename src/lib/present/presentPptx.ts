import JSZip from 'jszip'
import { presentableSlides } from './sections'
import { furnitureElements, masterTokensFor } from './masters'
import { docOf, linesOf, type TextLine, type TextRun } from './richtext'
import { resolveTextRender, type TextRender } from './textStyles'
import {
  SLIDE_H,
  SLIDE_W,
  type PresentationBody,
  type PresentElement,
  type TextElement,
  type TableElement,
  type ChartElement,
} from './presentModel'

/**
 * Presentation → PPTX (Phase 8). A minimal but VALID PresentationML
 * package: slide master/layout/theme boilerplate + one slide part per
 * slide, with text boxes, rect/ellipse/line shapes and embedded images.
 *
 * Honest fidelity: fonts map to the default theme font, no animations,
 * no transitions — the export dialog says "basic fidelity" and lists
 * what is covered.
 */

const EMU = 9525 // per px
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const srgb = (color: string, fallback: string): string =>
  (/^#([0-9a-fA-F]{6})/.exec(color)?.[1] ?? fallback.slice(1)).toUpperCase()

function xfrm(el: { x: number; y: number; w: number; h: number }): string {
  return `<a:xfrm><a:off x="${Math.round(el.x * EMU)}" y="${Math.round(el.y * EMU)}"/><a:ext cx="${Math.round(el.w * EMU)}" cy="${Math.round(el.h * EMU)}"/></a:xfrm>`
}

/**
 * Text as PresentationML runs (19E.3).
 *
 * OOXML has runs natively, so mixed formatting inside one box exports as what
 * it is rather than collapsing to the box's dominant style. Lists become real
 * PowerPoint bullets. Links ride along as hyperlink-styled runs carrying their
 * href in the run text's own `<a:rPr>` — Lattice entity links (`lattice://`)
 * have no meaning outside Lattice, so they export as plain text, and the
 * export dialog says so.
 */
function textBody(el: TextElement, themeText: string, render: TextRender): string {
  const algn = render.align === 'center' ? 'ctr' : render.align === 'right' ? 'r' : 'l'
  const boxColor = srgb(el.color ?? render.color ?? themeText, themeText)
  const size = Math.round(render.size * 100)

  const runXml = (run: TextRun): string => {
    const b = run.bold || render.weight >= 600 ? ' b="1"' : ''
    const i = run.italic || el.italic ? ' i="1"' : ''
    const u = run.underline ? ' u="sng"' : ''
    const rPr = `<a:rPr lang="en-US" sz="${size}"${b}${i}${u}><a:solidFill><a:srgbClr val="${boxColor}"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr>`
    return `<a:r>${rPr}<a:t>${esc(run.text)}</a:t></a:r>`
  }

  const lines = linesOf(docOf(el))
  const source: TextLine[] = lines.length
    ? lines
    : el.text.split('\n').map((text) => ({ runs: [{ text }], level: 0 }))

  const paras = source.map((line) => {
    const indent = line.list ? ` marL="${(line.level + 1) * 285750}" indent="-285750"` : ''
    const bullet = line.list === 'bullet'
      ? '<a:buChar char="•"/>'
      : line.list === 'number'
        ? '<a:buAutoNum type="arabicPeriod"/>'
        : '<a:buNone/>'
    const runs = line.runs.length ? line.runs.map(runXml).join('') : ''
    return `<a:p><a:pPr algn="${algn}"${indent}>${bullet}</a:pPr>${runs}</a:p>`
  })
  return `<p:txBody><a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras.join('')}</p:txBody>`
}

interface SlideCtx {
  rels: string[]
  media: { name: string; data: Uint8Array }[]
  /** native chart parts this slide needs (19E.4) */
  charts: { name: string; xml: string }[]
  seq: number
}

const escXml = esc

/**
 * A table as a real PowerPoint table (19E.4) — a `graphicFrame` holding an
 * `a:tbl`, so the cells stay cells: selectable, editable, restylable. An image
 * of a table would look the same in a screenshot and be useless in the file.
 */
function tableXml(el: TableElement, id: number, themeText: string): string {
  const cols = el.cells.reduce((n, r) => Math.max(n, r.length), 0) || 1
  const colW = Math.round((el.w * EMU) / cols)
  const rowH = Math.round((el.h * EMU) / Math.max(1, el.cells.length))
  const grid = Array.from({ length: cols }, () => `<a:gridCol w="${colW}"/>`).join('')
  const color = srgb(themeText, '#1f1f24')
  const rows = el.cells
    .map((row, r) => {
      const cells = Array.from({ length: cols }, (_, c) => {
        const bold = el.headerRow && r === 0 ? ' b="1"' : ''
        const text = escXml(String(row[c] ?? ''))
        return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1200"${bold}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${text}</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>`
      }).join('')
      return `<a:tr h="${rowH}">${cells}</a:tr>`
    })
    .join('')
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${Math.round(el.x * EMU)}" y="${Math.round(el.y * EMU)}"/><a:ext cx="${Math.round(el.w * EMU)}" cy="${Math.round(el.h * EMU)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="${el.headerRow ? 1 : 0}"/><a:tblGrid>${grid}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
}

const CHART_PALETTE = ['0D99FF', '14AE5C', 'FFA629', '9747FF', 'F24822']

/**
 * A chart as a **native chart part with its cached data** (19E.4).
 *
 * This is what makes the exported deck editable in PowerPoint: the file holds
 * the numbers, not a picture of them. `c:cat` and `c:val` are the cached table
 * the mockup calls for — PowerPoint reads them directly and can re-plot,
 * restyle or re-type the series without ever seeing Lattice.
 */
function chartPartXml(el: ChartElement): string {
  const cats = el.data.categories
  const strCache = (values: string[]) =>
    `<c:strRef><c:f>Sheet1!$A$2:$A$${values.length + 1}</c:f><c:strCache><c:ptCount val="${values.length}"/>${values
      .map((v, i) => `<c:pt idx="${i}"><c:v>${escXml(v)}</c:v></c:pt>`)
      .join('')}</c:strCache></c:strRef>`
  const numCache = (values: number[], col: number) =>
    `<c:numRef><c:f>Sheet1!$${String.fromCharCode(66 + col)}$2:$${String.fromCharCode(66 + col)}$${values.length + 1}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${values
      .map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)
      .join('')}</c:numCache></c:numRef>`

  const series = el.data.series
    .map(
      (s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>` +
        `<c:tx><c:strRef><c:f>Sheet1!$${String.fromCharCode(66 + i)}$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${escXml(s.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>` +
        `<c:spPr><a:solidFill><a:srgbClr val="${CHART_PALETTE[i % CHART_PALETTE.length]}"/></a:solidFill></c:spPr>` +
        `<c:cat>${strCache(cats)}</c:cat><c:val>${numCache(s.values, i)}</c:val></c:ser>`,
    )
    .join('')

  const plot =
    el.chart === 'line'
      ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}<c:marker val="1"/><c:axId val="1"/><c:axId val="2"/></c:lineChart>`
      : `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:gapWidth val="80"/><c:axId val="1"/><c:axId val="2"/></c:barChart>`

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:chart>${
    el.title ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escXml(el.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` : '<c:autoTitleDeleted val="1"/>'
  }<c:plotArea><c:layout/>${plot}<c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="2"/></c:catAx><c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="1"/></c:valAx></c:plotArea>${
    el.showLegend === false ? '' : '<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>'
  }<c:plotVisOnly val="1"/></c:chart></c:chartSpace>`
}

/** The frame on the slide that points at the chart part. */
function chartFrameXml(ctx: SlideCtx, el: ChartElement, id: number): string {
  const name = `chart${ctx.charts.length + 1}.xml`
  ctx.charts.push({ name, xml: chartPartXml(el) })
  const relId = `rIdChart${ctx.charts.length}`
  ctx.rels.push(
    `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/${name}"/>`,
  )
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Chart ${id}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${Math.round(el.x * EMU)}" y="${Math.round(el.y * EMU)}"/><a:ext cx="${Math.round(el.w * EMU)}" cy="${Math.round(el.h * EMU)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${relId}"/></a:graphicData></a:graphic></p:graphicFrame>`
}

function elementXml(
  ctx: SlideCtx,
  el: PresentElement,
  themeText: string,
  render: TextRender,
): string {
  const id = ++ctx.seq
  if (el.kind === 'text') {
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(el)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>${textBody(el, themeText, render)}</p:sp>`
  }
  if (el.kind === 'shape') {
    const geom = el.shape === 'ellipse' ? 'ellipse' : el.shape === 'line' ? 'line' : 'rect'
    const fill = el.fill
      ? `<a:solidFill><a:srgbClr val="${srgb(el.fill, '#cccccc')}"/></a:solidFill>`
      : '<a:noFill/>'
    const line = el.stroke
      ? `<a:ln w="${Math.round((el.strokeWidth || 1) * EMU)}"><a:solidFill><a:srgbClr val="${srgb(el.stroke, '#888888')}"/></a:solidFill></a:ln>`
      : ''
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(el)}<a:prstGeom prst="${geom}"><a:avLst/></a:prstGeom>${fill}${line}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`
  }
  if (el.kind === 'table') return tableXml(el, id, themeText)
  if (el.kind === 'chart') return chartFrameXml(ctx, el, id)
  const m = /^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/.exec(el.src)
  if (!m) return ''
  const ext = m[1] === 'jpg' ? 'jpeg' : m[1]
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const name = `image${ctx.media.length + 1}.${ext === 'jpeg' ? 'jpg' : ext}`
  ctx.media.push({ name, data: bytes })
  const relId = `rIdImg${ctx.media.length}`
  ctx.rels.push(
    `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${name}"/>`,
  )
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${name}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(el)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
}

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'

const THEME_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Lattice"><a:themeElements><a:clrScheme name="Lattice"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F1F24"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="0D99FF"/></a:accent1><a:accent2><a:srgbClr val="9747FF"/></a:accent2><a:accent3><a:srgbClr val="14AE5C"/></a:accent3><a:accent4><a:srgbClr val="FFA629"/></a:accent4><a:accent5><a:srgbClr val="F24822"/></a:accent5><a:accent6><a:srgbClr val="FFCD29"/></a:accent6><a:hlink><a:srgbClr val="0D99FF"/></a:hlink><a:folHlink><a:srgbClr val="9747FF"/></a:folHlink></a:clrScheme><a:fontScheme name="Lattice"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`

const MASTER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`

const LAYOUT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout ${NS} type="blank"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sldLayout>`

/** Build a valid .pptx from a deck. */
export async function exportPresentationPptx(body: PresentationBody): Promise<Blob> {
  const zip = new JSZip()
  const slideOverrides: string[] = []
  const chartOverrides: string[] = []
  const slideRefs: string[] = []
  const presRels: string[] = [
    `<Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`,
  ]

  // hidden slides are part of the deck, not of the presentation (19E.1)
  presentableSlides(body).forEach((slide, i) => {
    const n = i + 1
    const ctx: SlideCtx = { rels: [], media: [], charts: [], seq: 1 }
    const theme = masterTokensFor(body, slide)
    const els = [...slide.elements, ...furnitureElements(body, slide, n, theme)].sort(
      (a, b) => a.z - b.z,
    )
    const shapes = els
      .map((el) => elementXml(ctx, el, theme.text, resolveTextRender(el as TextElement, theme, body.textStyles)))
      .join('')
    const bg = `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${srgb(slide.background ?? theme.bg, theme.bg)}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`
    const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NS}><p:cSld>${bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld></p:sld>`
    zip.file(`ppt/slides/slide${n}.xml`, slideXml)
    const slideRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
${ctx.rels.join('\n')}
</Relationships>`
    zip.file(`ppt/slides/_rels/slide${n}.xml.rels`, slideRels)
    for (const m of ctx.media) zip.file(`ppt/media/${m.name}`, m.data)
    for (const c of ctx.charts) {
      zip.file(`ppt/charts/${c.name}`, c.xml)
      chartOverrides.push(
        `<Override PartName="/ppt/charts/${c.name}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`,
      )
    }
    slideOverrides.push(
      `<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    )
    presRels.push(
      `<Relationship Id="rIdSlide${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${n}.xml"/>`,
    )
    slideRefs.push(`<p:sldId id="${256 + i}" r:id="rIdSlide${n}"/>`)
  })

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Default Extension="jpg" ContentType="image/jpeg"/>
<Default Extension="gif" ContentType="image/gif"/>
<Default Extension="webp" ContentType="image/webp"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
${slideOverrides.join('\n')}
${chartOverrides.join('\n')}
</Types>`,
  )
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
  )
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst><p:sldIdLst>${slideRefs.join('')}</p:sldIdLst><p:sldSz cx="${SLIDE_W * EMU}" cy="${SLIDE_H * EMU}"/><p:notesSz cx="${SLIDE_H * EMU}" cy="${SLIDE_W * EMU}"/></p:presentation>`,
  )
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${presRels.join('\n')}
</Relationships>`,
  )
  zip.file('ppt/slideMasters/slideMaster1.xml', MASTER_XML)
  zip.file(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`,
  )
  zip.file('ppt/slideLayouts/slideLayout1.xml', LAYOUT_XML)
  zip.file(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`,
  )
  zip.file('ppt/theme/theme1.xml', THEME_XML)

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  })
}
