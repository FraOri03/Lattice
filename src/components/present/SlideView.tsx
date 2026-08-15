import {
  SLIDE_H,
  SLIDE_W,
  type PresentElement,
  type PresentSlide,
} from '@/lib/present/presentModel'
import type { ThemeTokens } from '@/lib/present/theme'
import { resolveTextRender, type DeckTextStyles, type TextRender } from '@/lib/present/textStyles'
import { docOf, linesOf, type TextLine } from '@/lib/present/richtext'
import { adjustmentFilter, cropStyle, focalPosition, isFullCrop, normalizeCrop } from '@/lib/present/media'
import type { ChartElement, TableElement } from '@/lib/present/presentModel'
import { isEmptyChart } from '@/lib/present/sheetRange'

/**
 * Shared, dependency-light slide rendering used by BOTH the presentation
 * workspace (thumbnails + canvas content + read-only fallback) and the board
 * presentation card. Kept out of PresentationWorkspace so a board card can
 * render a slide without pulling the whole editor (and its lazy chunk) into the
 * board bundle — it only needs the model + these pure render helpers.
 *
 * `ElementContent` renders just the visual, filling its parent box (no
 * position). `elementStyle` / `elementTransform` position and transform a
 * wrapper. Splitting them lets the editor canvas apply selection outlines and
 * the rotation/opacity transform exactly once (no double-transform), while
 * thumbnails compose the two via `StaticElement`.
 */

/** Absolute position + size + paint order for a wrapper box. */
export function elementStyle(el: PresentElement): React.CSSProperties {
  return {
    position: 'absolute',
    left: el.x,
    top: el.y,
    width: el.w,
    height: el.h,
    zIndex: el.z + 1,
  }
}

/** Rotation + opacity, applied once on the positioned wrapper. */
export function elementTransform(el: PresentElement): React.CSSProperties {
  const style: React.CSSProperties = {}
  if (el.rotation) style.transform = `rotate(${el.rotation}deg)`
  if (el.opacity != null && el.opacity < 1) style.opacity = el.opacity
  return style
}

/** The visual only — text / image / shape filling the parent box (100%). */
export function ElementContent({
  el,
  themeText,
  render,
  measureRef,
  src,
}: {
  el: PresentElement
  themeText: string
  /** resolved asset URL for a picture held by reference (19E.4) */
  src?: string
  /** resolved typography (19E.3); absent falls back to the flat fields */
  render?: TextRender
  /** the inner box, so the editor can measure what the text really needs */
  measureRef?: React.Ref<HTMLDivElement>
}) {
  if (el.kind === 'text') {
    const r = render
    const lines = linesOf(docOf(el))
    const clip = el.autoSize === 'clip' || el.autoSize === undefined
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent:
            r?.valign === 'middle' ? 'center' : r?.valign === 'bottom' ? 'flex-end' : 'flex-start',
          padding: r?.padding ?? 0,
          fontSize: r?.size ?? el.fontSize,
          fontFamily: r?.fontFamily ?? 'inherit',
          fontWeight: r?.weight ?? (el.bold ? 700 : 400),
          // same reason as weight: with a document, italic lives on the runs
          fontStyle: !el.doc && el.italic ? 'italic' : 'normal',
          textAlign: r?.align ?? el.align,
          color: r?.color ?? el.color ?? themeText,
          lineHeight: r?.lineHeight ?? 1.25,
          letterSpacing: r ? `${r.letterSpacing}em` : undefined,
          whiteSpace: 'pre-wrap',
          // "show overflow" has to actually show it, or the state would be a
          // label for something invisible
          overflow: clip ? 'hidden' : 'visible',
          wordBreak: 'break-word',
          boxSizing: 'border-box',
        }}
      >
        <div ref={measureRef} data-text-measure>
          {lines.length === 0 ? (
            el.text
          ) : (
            lines.map((line, i) => (
              <RichLine key={i} line={line} />
            ))
          )}
        </div>
      </div>
    )
  }
  if (el.kind === 'image') {
    const crop = normalizeCrop(el.crop)
    const filter = adjustmentFilter(el.adjustments)
    const img = (
      <img
        src={src ?? el.src}
        alt={el.alt ?? ''}
        style={{
          width: '100%',
          height: '100%',
          objectFit: el.fit ?? 'fill',
          objectPosition: focalPosition(el.focalPoint),
          display: 'block',
          filter,
          ...(isFullCrop(crop) ? {} : cropStyle(crop)),
        }}
        draggable={false}
      />
    )
    // the crop is a window onto a larger image: the frame does the clipping,
    // so the stored picture is never touched
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          position: 'relative',
          borderRadius: el.radius ?? 0,
        }}
      >
        {img}
      </div>
    )
  }
  if (el.kind === 'table') {
    return <TableContent el={el} themeText={themeText} accent={render?.color ?? themeText} />
  }
  if (el.kind === 'chart') {
    return <ChartContent el={el} themeText={themeText} />
  }
  if (el.shape === 'line') {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}>
        <div style={{ width: '100%', borderTop: `${el.strokeWidth || 2}px solid ${el.stroke ?? '#888'}` }} />
      </div>
    )
  }
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: el.fill ?? 'transparent',
        border: el.stroke ? `${el.strokeWidth || 1}px solid ${el.stroke}` : 'none',
        borderRadius: el.shape === 'ellipse' ? '50%' : 6,
        boxSizing: 'border-box',
      }}
    />
  )
}

/** A grid, drawn from the cells as captured (19E.4). */
function TableContent({
  el,
  themeText,
  accent,
}: {
  el: TableElement
  themeText: string
  accent: string
}) {
  const cols = el.cells.reduce((n, r) => Math.max(n, r.length), 0)
  return (
    <table
      style={{
        width: '100%',
        height: '100%',
        borderCollapse: 'collapse',
        color: themeText,
        fontSize: '0.8em',
        tableLayout: 'fixed',
      }}
    >
      <tbody>
        {el.cells.map((row, r) => (
          <tr key={r}>
            {Array.from({ length: cols }, (_, c) => {
              const header = el.headerRow && r === 0
              const Tag = header ? 'th' : 'td'
              return (
                <Tag
                  key={c}
                  style={{
                    border: `1px solid ${themeText}33`,
                    padding: '0.25em 0.4em',
                    textAlign: c === 0 ? 'left' : 'right',
                    fontWeight: header ? 700 : 400,
                    color: header ? accent : themeText,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {row[c] ?? ''}
                </Tag>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * A chart drawn from the element's captured data (19E.4).
 *
 * It reads nothing live. A slide showing a number cannot have that number
 * change while it is on a projector, so the data it draws is the data the
 * deck holds — refreshing it is an act taken in the editor.
 */
function ChartContent({ el, themeText }: { el: ChartElement; themeText: string }) {
  const data = el.data
  if (isEmptyChart(data)) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: themeText, opacity: 0.6, fontSize: '0.8em' }}>
        No data in this range
      </div>
    )
  }
  const W = 100
  const H = 60
  const max = Math.max(1, ...data.series.flatMap((s) => s.values))
  const groups = data.categories.length
  const palette = ['#0d99ff', '#14ae5c', '#ffa629', '#9747ff', '#f24822']

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }} role="img" aria-label={el.title ?? 'Chart'}>
      <line x1="0" y1={H - 8} x2={W} y2={H - 8} stroke={themeText} strokeOpacity="0.25" strokeWidth="0.4" />
      {el.chart === 'bar'
        ? data.series.map((s, si) =>
            s.values.map((v, i) => {
              const bw = (W / Math.max(1, groups)) / (data.series.length + 1)
              const x = (i * W) / groups + si * bw + bw * 0.4
              const h = (v / max) * (H - 12)
              return (
                <rect key={`${si}-${i}`} x={x} y={H - 8 - h} width={bw * 0.9} height={h} fill={palette[si % palette.length]} />
              )
            }),
          )
        : data.series.map((s, si) => (
            <polyline
              key={si}
              fill="none"
              stroke={palette[si % palette.length]}
              strokeWidth="1"
              points={s.values
                .map((v, i) => `${(i * W) / Math.max(1, groups - 1)},${H - 8 - (v / max) * (H - 12)}`)
                .join(' ')}
            />
          ))}
    </svg>
  )
}

/** One line of structured text: its runs, and its list marker if it has one. */
function RichLine({ line }: { line: TextLine }) {
  const body = line.runs.map((run, i) => {
    const style: React.CSSProperties = {
      fontWeight: run.bold ? 700 : undefined,
      fontStyle: run.italic ? 'italic' : undefined,
      textDecoration: run.underline ? 'underline' : undefined,
    }
    // a link is drawn as a link but never navigable from a slide surface:
    // clicking here selects the box, it does not leave the deck
    if (run.href) {
      return (
        <span key={i} style={{ ...style, textDecoration: 'underline', opacity: 0.95 }} title={run.href}>
          {run.text}
        </span>
      )
    }
    return (
      <span key={i} style={style}>
        {run.text}
      </span>
    )
  })

  if (!line.list) return <div>{body.length ? body : ' '}</div>
  return (
    <div style={{ display: 'flex', gap: '0.5em', paddingLeft: `${line.level * 1.2}em` }}>
      <span aria-hidden style={{ opacity: 0.7 }}>{line.list === 'bullet' ? '•' : '—'}</span>
      <span style={{ flex: 1 }}>{body}</span>
    </div>
  )
}

/** A positioned, transformed element (used by thumbnails / read-only render). */
export function StaticElement({
  el,
  themeText,
  render,
}: {
  el: PresentElement
  themeText: string
  render?: TextRender
}) {
  if (el.hidden) return null
  return (
    <div style={{ ...elementStyle(el), ...elementTransform(el) }}>
      <ElementContent el={el} themeText={themeText} render={render} />
    </div>
  )
}

/** Read-only mini render of a whole slide, scaled to `width`px. */
export function SlideView({
  slide,
  tokens,
  textStyles,
  decor = [],
  width,
}: {
  slide: PresentSlide
  tokens: ThemeTokens
  /** the deck's named text styles (19E.3) */
  textStyles?: DeckTextStyles
  /** master furniture, drawn with the slide but never part of it (19E.2) */
  decor?: PresentElement[]
  width: number
}) {
  const t = tokens
  const scale = width / SLIDE_W
  return (
    <div
      style={{ width, height: SLIDE_H * scale, overflow: 'hidden', position: 'relative' }}
      aria-hidden
    >
      <div
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          background: slide.background ?? t.bg,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'absolute',
          pointerEvents: 'none',
        }}
      >
        {[...slide.elements, ...decor]
          .filter((el) => !el.hidden)
          .sort((a, b) => a.z - b.z)
          .map((el) => (
            <StaticElement
              key={el.id}
              el={el}
              themeText={t.text}
              render={el.kind === 'text' ? resolveTextRender(el, tokens, textStyles) : undefined}
            />
          ))}
      </div>
    </div>
  )
}
