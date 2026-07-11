import {
  SLIDE_H,
  SLIDE_W,
  THEME_COLORS,
  type PresentElement,
  type PresentSlide,
  type PresentTheme,
} from '@/lib/present/presentModel'

/**
 * Shared, dependency-light slide rendering used by BOTH the presentation
 * workspace (thumbnails + read-only fallback) and the board presentation
 * card. Kept out of PresentationWorkspace so a board card can render a
 * slide without pulling the whole editor (and its lazy chunk) into the
 * board bundle — it only needs the model + these pure render helpers.
 */

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

export function StaticElement({
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
          ...elementStyle(el),
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
        alt=""
        style={{ ...elementStyle(el), objectFit: 'fill' }}
        draggable={false}
      />
    )
  }
  const base = elementStyle(el)
  if (el.shape === 'line') {
    return (
      <div
        style={{
          ...base,
          height: 0,
          top: el.y + el.h / 2,
          borderTop: `${el.strokeWidth || 2}px solid ${el.stroke ?? '#888'}`,
        }}
      />
    )
  }
  return (
    <div
      style={{
        ...base,
        background: el.fill ?? 'transparent',
        border: el.stroke ? `${el.strokeWidth || 1}px solid ${el.stroke}` : 'none',
        borderRadius: el.shape === 'ellipse' ? '50%' : 6,
      }}
    />
  )
}

/** Read-only mini render of a whole slide, scaled to `width`px. */
export function SlideView({
  slide,
  theme,
  width,
}: {
  slide: PresentSlide
  theme: PresentTheme
  width: number
}) {
  const t = THEME_COLORS[theme]
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
        {[...slide.elements]
          .sort((a, b) => a.z - b.z)
          .map((el) => (
            <StaticElement key={el.id} el={el} themeText={t.text} />
          ))}
      </div>
    </div>
  )
}
