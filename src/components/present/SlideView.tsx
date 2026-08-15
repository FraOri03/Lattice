import {
  SLIDE_H,
  SLIDE_W,
  type PresentElement,
  type PresentSlide,
} from '@/lib/present/presentModel'
import type { ThemeTokens } from '@/lib/present/theme'

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
}: {
  el: PresentElement
  themeText: string
}) {
  if (el.kind === 'text') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          fontSize: el.fontSize,
          fontWeight: el.bold ? 700 : 400,
          fontStyle: el.italic ? 'italic' : 'normal',
          textAlign: el.align,
          color: el.color ?? themeText,
          lineHeight: 1.25,
          whiteSpace: 'pre-wrap',
          overflow: 'hidden',
          wordBreak: 'break-word',
        }}
      >
        {el.text}
      </div>
    )
  }
  if (el.kind === 'image') {
    return (
      <img
        src={el.src}
        alt={el.alt ?? ''}
        style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
        draggable={false}
      />
    )
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

/** A positioned, transformed element (used by thumbnails / read-only render). */
export function StaticElement({
  el,
  themeText,
}: {
  el: PresentElement
  themeText: string
}) {
  if (el.hidden) return null
  return (
    <div style={{ ...elementStyle(el), ...elementTransform(el) }}>
      <ElementContent el={el} themeText={themeText} />
    </div>
  )
}

/** Read-only mini render of a whole slide, scaled to `width`px. */
export function SlideView({
  slide,
  tokens,
  decor = [],
  width,
}: {
  slide: PresentSlide
  tokens: ThemeTokens
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
            <StaticElement key={el.id} el={el} themeText={t.text} />
          ))}
      </div>
    </div>
  )
}
