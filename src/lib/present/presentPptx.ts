import JSZip from 'jszip'
import {
  SLIDE_H,
  SLIDE_W,
  THEME_COLORS,
  type PresentationBody,
  type PresentElement,
  type TextElement,
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

function textBody(el: TextElement, themeText: string): string {
  const algn = el.align === 'center' ? 'ctr' : el.align === 'right' ? 'r' : 'l'
  const color = srgb(el.color ?? themeText, themeText)
  const paras = el.text.split('\n').map((line) => {
    const rPr = `<a:rPr lang="en-US" sz="${Math.round(el.fontSize * 100)}"${el.bold ? ' b="1"' : ''}${el.italic ? ' i="1"' : ''}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr>`
    return `<a:p><a:pPr algn="${algn}"/><a:r>${rPr}<a:t>${esc(line)}</a:t></a:r></a:p>`
  })
  return `<p:txBody><a:bodyPr wrap="square"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras.join('')}</p:txBody>`
}

interface SlideCtx {
  rels: string[]
  media: { name: string; data: Uint8Array }[]
  seq: number
}

function elementXml(ctx: SlideCtx, el: PresentElement, themeText: string): string {
  const id = ++ctx.seq
  if (el.kind === 'text') {
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(el)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>${textBody(el, themeText)}</p:sp>`
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
  // image
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
  const theme = THEME_COLORS[body.theme]
  const zip = new JSZip()
  const slideOverrides: string[] = []
  const slideRefs: string[] = []
  const presRels: string[] = [
    `<Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`,
  ]

  body.slides.forEach((slide, i) => {
    const n = i + 1
    const ctx: SlideCtx = { rels: [], media: [], seq: 1 }
    const els = [...slide.elements].sort((a, b) => a.z - b.z)
    const shapes = els.map((el) => elementXml(ctx, el, theme.text)).join('')
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
