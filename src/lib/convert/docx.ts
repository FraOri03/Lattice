import JSZip from 'jszip'
import type { JSONContent } from '@tiptap/core'

/**
 * Tiptap JSON → DOCX (Phase 8). A real, valid WordprocessingML package
 * built in the browser with JSZip — no fake export.
 *
 * Covered: headings 1-6, paragraphs, bold/italic/underline/strike,
 * inline code (mono + shading), hyperlinks (real w:hyperlink + rels),
 * bullet/ordered/task lists with nesting, blockquotes, code blocks,
 * horizontal rules, basic tables, data-URL images (embedded in
 * word/media), wikilinks (as [[text]]), callouts (quoted + labelled).
 *
 * Honest limitations (also listed on the adapter): asset embeds export
 * as a reference line; comments/track-changes/columns don't exist in
 * Lattice documents; image dimensions default to 400×300 when unknown.
 */

const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const PX_EMU = 9525

interface DocxCtx {
  rels: string[]
  media: { name: string; data: Uint8Array; contentType: string }[]
  relSeq: number
}

function runProps(marks: JSONContent['marks']): string {
  let out = ''
  for (const m of marks ?? []) {
    switch (m.type) {
      case 'bold':
        out += '<w:b/>'
        break
      case 'italic':
        out += '<w:i/>'
        break
      case 'underline':
        out += '<w:u w:val="single"/>'
        break
      case 'strike':
        out += '<w:strike/>'
        break
      case 'code':
        out +=
          '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:shd w:val="clear" w:fill="F2F2F2"/>'
        break
    }
  }
  return out ? `<w:rPr>${out}</w:rPr>` : ''
}

function textRun(text: string, marks: JSONContent['marks']): string {
  return `<w:r>${runProps(marks)}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
}

function dataUrlToBytes(url: string): { data: Uint8Array; contentType: string } | null {
  const m = /^data:([^;,]+);base64,(.+)$/.exec(url)
  if (!m) return null
  try {
    const bin = atob(m[2])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { data: bytes, contentType: m[1] }
  } catch {
    return null
  }
}

function imageRun(ctx: DocxCtx, src: string): string {
  const parsed = dataUrlToBytes(src)
  if (!parsed) {
    // remote/unresolvable images become their URL, never a broken package
    return textRun(`[image: ${src.slice(0, 120)}]`, [])
  }
  const ext = parsed.contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
  const name = `image${ctx.media.length + 1}.${ext}`
  ctx.media.push({ name, data: parsed.data, contentType: parsed.contentType })
  const relId = `rIdMedia${ctx.media.length}`
  ctx.rels.push(
    `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`,
  )
  const w = 400 * PX_EMU
  const h = 300 * PX_EMU
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${w}" cy="${h}"/><wp:docPr id="${ctx.media.length}" name="${name}"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${ctx.media.length}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  )
}

function inlineContent(ctx: DocxCtx, node: JSONContent): string {
  return (node.content ?? [])
    .map((child) => {
      if (child.type === 'text') {
        const link = child.marks?.find((m) => m.type === 'link')
        if (link) {
          const relId = `rIdLink${++ctx.relSeq}`
          ctx.rels.push(
            `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(String(link.attrs?.href ?? ''))}" TargetMode="External"/>`,
          )
          const marks = (child.marks ?? []).filter((m) => m.type !== 'link')
          return `<w:hyperlink r:id="${relId}"><w:r><w:rPr><w:color w:val="0D99FF"/><w:u w:val="single"/>${runProps(marks).replace(/<\/?w:rPr>/g, '')}</w:rPr><w:t xml:space="preserve">${esc(child.text ?? '')}</w:t></w:r></w:hyperlink>`
        }
        return textRun(child.text ?? '', child.marks)
      }
      if (child.type === 'wikilink')
        return textRun(`[[${String(child.attrs?.target ?? '')}]]`, [])
      if (child.type === 'hardBreak') return '<w:r><w:br/></w:r>'
      if (child.type === 'image') return imageRun(ctx, String(child.attrs?.src ?? ''))
      return inlineContent(ctx, child)
    })
    .join('')
}

function para(ctx: DocxCtx, node: JSONContent, pPr = ''): string {
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${inlineContent(ctx, node)}</w:p>`
}

function listItems(
  ctx: DocxCtx,
  node: JSONContent,
  numId: number,
  level: number,
  checkbox = false,
): string {
  return (node.content ?? [])
    .map((li) => {
      const checked = li.attrs?.checked === true
      return (li.content ?? [])
        .map((child, i) => {
          if (child.type === 'paragraph' && i === 0) {
            const prefixRun = checkbox ? textRun(checked ? '☑ ' : '☐ ', []) : ''
            return `<w:p><w:pPr><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>${prefixRun}${inlineContent(ctx, child)}</w:p>`
          }
          if (child.type === 'bulletList') return listItems(ctx, child, 1, level + 1)
          if (child.type === 'orderedList') return listItems(ctx, child, 2, level + 1)
          if (child.type === 'taskList') return listItems(ctx, child, 1, level + 1, true)
          return blockContent(ctx, child)
        })
        .join('')
    })
    .join('')
}

function tableXml(ctx: DocxCtx, node: JSONContent): string {
  const rows = (node.content ?? [])
    .map((row) => {
      const cells = (row.content ?? [])
        .map((cell) => {
          const isHeader = cell.type === 'tableHeader'
          const content =
            (cell.content ?? [])
              .map((c) =>
                para(ctx, c, isHeader ? '' : ''),
              )
              .join('') || '<w:p/>'
          const shd = isHeader ? '<w:shd w:val="clear" w:fill="EFEFEF"/>' : ''
          return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${shd}</w:tcPr>${content}</w:tc>`
        })
        .join('')
      return `<w:tr>${cells}</w:tr>`
    })
    .join('')
  const borders =
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:color="BBBBBB"/>`)
      .join('') +
    '</w:tblBorders>'
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${borders}</w:tblPr>${rows}</w:tbl>`
}

function blockContent(ctx: DocxCtx, node: JSONContent): string {
  switch (node.type) {
    case 'paragraph':
      return para(ctx, node)
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)))
      return para(ctx, node, `<w:pStyle w:val="Heading${level}"/>`)
    }
    case 'blockquote':
      return (node.content ?? [])
        .map((c) =>
          c.type === 'paragraph'
            ? para(ctx, c, '<w:pStyle w:val="Quote"/>')
            : blockContent(ctx, c),
        )
        .join('')
    case 'codeBlock': {
      const text = (node.content ?? []).map((c) => c.text ?? '').join('')
      return text
        .split('\n')
        .map(
          (line) =>
            `<w:p><w:pPr><w:pStyle w:val="CodeBlock"/></w:pPr>${textRun(line, [{ type: 'code' }])}</w:p>`,
        )
        .join('')
    }
    case 'horizontalRule':
      return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:color="BBBBBB"/></w:pBdr></w:pPr></w:p>'
    case 'bulletList':
      return listItems(ctx, node, 1, 0)
    case 'orderedList':
      return listItems(ctx, node, 2, 0)
    case 'taskList':
      return listItems(ctx, node, 1, 0, true)
    case 'table':
      return tableXml(ctx, node)
    case 'callout': {
      const kind = String(node.attrs?.kind ?? 'info')
      return (node.content ?? [])
        .map((c, i) =>
          para(
            ctx,
            i === 0
              ? {
                  ...c,
                  content: [
                    { type: 'text', text: `${kind.toUpperCase()}: `, marks: [{ type: 'bold' }] },
                    ...(c.content ?? []),
                  ],
                }
              : c,
            '<w:pStyle w:val="Quote"/>',
          ),
        )
        .join('')
    }
    case 'image':
      return `<w:p>${imageRun(ctx, String(node.attrs?.src ?? ''))}</w:p>`
    case 'assetEmbed':
      return para(ctx, {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `[embedded Lattice asset ${String(node.attrs?.assetId ?? '')}]`,
            marks: [{ type: 'italic' }],
          },
        ],
      })
    default:
      return para(ctx, node)
  }
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
${[1, 2, 3, 4, 5, 6]
  .map(
    (l) =>
      `<w:style w:type="paragraph" w:styleId="Heading${l}"><w:name w:val="heading ${l}"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="${l - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${[36, 32, 28, 26, 24, 23][l - 1]}"/></w:rPr></w:style>`,
  )
  .join('\n')}
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="480"/><w:pBdr><w:left w:val="single" w:sz="12" w:color="0D99FF"/></w:pBdr></w:pPr><w:rPr><w:color w:val="555555"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:fill="F4F4F6"/><w:spacing w:after="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="20"/></w:rPr></w:style>
</w:styles>`

const NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="1">
${[0, 1, 2, 3]
  .map(
    (l) =>
      `<w:lvl w:ilvl="${l}"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:pPr><w:ind w:left="${720 * (l + 1)}" w:hanging="360"/></w:pPr></w:lvl>`,
  )
  .join('')}
</w:abstractNum>
<w:abstractNum w:abstractNumId="2">
${[0, 1, 2, 3]
  .map(
    (l) =>
      `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${l + 1}."/><w:pPr><w:ind w:left="${720 * (l + 1)}" w:hanging="360"/></w:pPr></w:lvl>`,
  )
  .join('')}
</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>
</w:numbering>`

/** Build a valid .docx package from a Tiptap document. */
export async function docJsonToDocxBlob(body: JSONContent): Promise<Blob> {
  const ctx: DocxCtx = { rels: [], media: [], relSeq: 0 }
  const bodyXml = (body.content ?? []).map((n) => blockContent(ctx, n)).join('\n')

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
<w:body>
${bodyXml}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
</w:body>
</w:document>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Default Extension="jpg" ContentType="image/jpeg"/>
<Default Extension="gif" ContentType="image/gif"/>
<Default Extension="webp" ContentType="image/webp"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
${ctx.rels.join('\n')}
</Relationships>`

  const zip = new JSZip()
  zip.file('[Content_Types].xml', contentTypes)
  zip.file('_rels/.rels', rootRels)
  zip.file('word/document.xml', documentXml)
  zip.file('word/_rels/document.xml.rels', docRels)
  zip.file('word/styles.xml', STYLES_XML)
  zip.file('word/numbering.xml', NUMBERING_XML)
  for (const m of ctx.media) zip.file(`word/media/${m.name}`, m.data)

  return zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}
