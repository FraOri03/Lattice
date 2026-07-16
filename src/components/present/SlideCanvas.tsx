import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  SLIDE_H,
  SLIDE_W,
  THEME_COLORS,
  type PresentElement,
  type PresentSlide,
  type PresentTheme,
} from '@/lib/present/presentModel'
import {
  RESIZE_HANDLES,
  clampPosition,
  rectOf,
  rectsIntersect,
  resizeRect,
  unionBounds,
  type Rect,
  type ResizeHandle,
} from '@/lib/present/geometry'
import { DEFAULT_SNAP_THRESHOLD, computeSnap, type Guide } from '@/lib/present/snapping'
import { ElementContent, elementStyle, elementTransform } from './SlideView'

/**
 * The editable slide canvas (Phase 1). Professional-grade interaction on the
 * 960×540 surface: single / shift / marquee selection, group move with smart
 * guides + snapping, eight-handle resize (Shift = aspect, Alt = from center),
 * rotation, and inline text editing. All geometry math lives in the pure
 * `geometry` / `snapping` modules; this component is the thin React shell that
 * turns pointer events into history commits.
 */

const ACCENT = '#0d99ff' // === --accent in both themes
const GUIDE = '#f24822'
const HANDLE_PX = 9
const ROTATE_OFFSET_PX = 20
const SNAP_PX = DEFAULT_SNAP_THRESHOLD

const HANDLE_CURSOR: Record<ResizeHandle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
}

const HANDLE_POS: Record<ResizeHandle, { left: string; top: string }> = {
  nw: { left: '0%', top: '0%' },
  n: { left: '50%', top: '0%' },
  ne: { left: '100%', top: '0%' },
  e: { left: '100%', top: '50%' },
  se: { left: '100%', top: '100%' },
  s: { left: '50%', top: '100%' },
  sw: { left: '0%', top: '100%' },
  w: { left: '0%', top: '50%' },
}

type Gesture =
  | {
      kind: 'move'
      origins: Map<string, { x: number; y: number }>
      startX: number
      startY: number
      moved: boolean
      wasSelected: boolean
      hitId: string
    }
  | { kind: 'resize'; id: string; handle: ResizeHandle; orig: Rect; startX: number; startY: number }
  | { kind: 'rotate'; id: string; cx: number; cy: number; startAngle: number; origRotation: number }

export interface SlideCanvasProps {
  slide: PresentSlide
  theme: PresentTheme
  readOnly: boolean
  scale: number
  snapEnabled: boolean
  selectedIds: Set<string>
  editingTextId: string | null
  onSelectChange: (ids: Set<string>) => void
  onEditText: (id: string | null) => void
  /** replace the current slide's elements (one history entry per coalesceKey) */
  setSlideElements: (next: PresentElement[], opts?: { coalesceKey?: string }) => void
  onSeal: () => void
}

let gestureSeq = 0

export function SlideCanvas({
  slide,
  theme,
  readOnly,
  scale,
  snapEnabled,
  selectedIds,
  editingTextId,
  onSelectChange,
  onEditText,
  setSlideElements,
  onSeal,
}: SlideCanvasProps) {
  const t = THEME_COLORS[theme]
  const innerRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [guides, setGuides] = useState<Guide[]>([])
  const [marquee, setMarquee] = useState<Rect | null>(null)

  const visible = useMemo(
    () => [...slide.elements].filter((e) => !e.hidden).sort((a, b) => a.z - b.z),
    [slide.elements],
  )
  const single = selectedIds.size === 1 ? visible.find((e) => selectedIds.has(e.id)) ?? null : null

  const toSlideXY = (clientX: number, clientY: number) => {
    const rect = innerRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale }
  }

  // Gesture handlers are created as locals per gesture so add/removeEventListener
  // always reference the same function identity (survives re-renders mid-drag).
  const runGesture = (g: Gesture) => {
    const id = ++gestureSeq
    const key = `gesture-${id}`
    gesture.current = g

    const move = (ev: PointerEvent) => {
      const cur = gesture.current
      if (!cur) return

      if (cur.kind === 'move') {
        if (!cur.moved && Math.abs(ev.clientX - cur.startX) + Math.abs(ev.clientY - cur.startY) < 3)
          return
        cur.moved = true
        const dx = (ev.clientX - cur.startX) / scale
        const dy = (ev.clientY - cur.startY) / scale
        const rawRects: Rect[] = []
        for (const e of visible) {
          const o = cur.origins.get(e.id)
          if (o) rawRects.push({ x: o.x + dx, y: o.y + dy, w: e.w, h: e.h })
        }
        const rawBounds = unionBounds(rawRects)
        const others = visible.filter((e) => !cur.origins.has(e.id)).map(rectOf)
        const snap = snapEnabled
          ? computeSnap(rawBounds, others, SNAP_PX / scale)
          : { dx: 0, dy: 0, guides: [] as Guide[] }
        const clamped = clampPosition(
          rawBounds.x + snap.dx,
          rawBounds.y + snap.dy,
          rawBounds.w,
          rawBounds.h,
        )
        const offX = clamped.x - rawBounds.x
        const offY = clamped.y - rawBounds.y
        const next = slide.elements.map((e) => {
          const o = cur.origins.get(e.id)
          return o ? { ...e, x: Math.round(o.x + dx + offX), y: Math.round(o.y + dy + offY) } : e
        })
        setGuides(snap.guides)
        setSlideElements(next, { coalesceKey: key })
        return
      }

      if (cur.kind === 'resize') {
        const dx = (ev.clientX - cur.startX) / scale
        const dy = (ev.clientY - cur.startY) / scale
        const r = resizeRect(cur.orig, cur.handle, dx, dy, {
          aspect: ev.shiftKey,
          fromCenter: ev.altKey,
        })
        setSlideElements(
          slide.elements.map((e) => (e.id === cur.id ? { ...e, x: r.x, y: r.y, w: r.w, h: r.h } : e)),
          { coalesceKey: key },
        )
        return
      }

      // rotate
      const angle = (Math.atan2(ev.clientY - cur.cy, ev.clientX - cur.cx) * 180) / Math.PI
      let rotation = Math.round(cur.origRotation + (angle - cur.startAngle))
      if (ev.shiftKey) rotation = Math.round(rotation / 15) * 15
      rotation = ((rotation % 360) + 360) % 360
      setSlideElements(
        slide.elements.map((e) => (e.id === cur.id ? { ...e, rotation } : e)),
        { coalesceKey: key },
      )
    }

    const up = () => {
      const cur = gesture.current
      if (cur && cur.kind === 'move' && !cur.moved && cur.wasSelected && selectedIds.size > 1) {
        // a plain click on an already-multi-selected element reduces to just it
        onSelectChange(new Set([cur.hitId]))
      }
      gesture.current = null
      setGuides([])
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onSeal()
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onElementPointerDown = (e: ReactPointerEvent, el: PresentElement) => {
    if (readOnly || el.locked || editingTextId === el.id) return
    e.stopPropagation()
    e.preventDefault()
    if (e.shiftKey) {
      const next = new Set(selectedIds)
      if (next.has(el.id)) next.delete(el.id)
      else next.add(el.id)
      onSelectChange(next)
      return
    }
    const wasSelected = selectedIds.has(el.id)
    const selection = wasSelected ? selectedIds : new Set([el.id])
    if (!wasSelected) onSelectChange(selection)
    const origins = new Map<string, { x: number; y: number }>()
    for (const s of visible) if (selection.has(s.id)) origins.set(s.id, { x: s.x, y: s.y })
    runGesture({
      kind: 'move',
      origins,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      wasSelected,
      hitId: el.id,
    })
  }

  const onResizePointerDown = (e: ReactPointerEvent, el: PresentElement, handle: ResizeHandle) => {
    if (readOnly || el.locked) return
    e.stopPropagation()
    e.preventDefault()
    runGesture({ kind: 'resize', id: el.id, handle, orig: rectOf(el), startX: e.clientX, startY: e.clientY })
  }

  const onRotatePointerDown = (e: ReactPointerEvent, el: PresentElement) => {
    if (readOnly || el.locked) return
    e.stopPropagation()
    e.preventDefault()
    const rect = innerRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = rect.left + (el.x + el.w / 2) * scale
    const cy = rect.top + (el.y + el.h / 2) * scale
    const startAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI
    runGesture({ kind: 'rotate', id: el.id, cx, cy, startAngle, origRotation: el.rotation ?? 0 })
  }

  const onBackgroundPointerDown = (e: ReactPointerEvent) => {
    if (editingTextId) onEditText(null)
    if (readOnly) {
      onSelectChange(new Set())
      return
    }
    const additive = e.shiftKey
    const baseline = additive ? new Set(selectedIds) : new Set<string>()
    if (!additive) onSelectChange(new Set())
    const start = toSlideXY(e.clientX, e.clientY)
    const move = (ev: PointerEvent) => {
      const cur = toSlideXY(ev.clientX, ev.clientY)
      const rect: Rect = {
        x: Math.min(start.x, cur.x),
        y: Math.min(start.y, cur.y),
        w: Math.abs(cur.x - start.x),
        h: Math.abs(cur.y - start.y),
      }
      setMarquee(rect)
      const hit = new Set(baseline)
      for (const el of visible) if (rectsIntersect(rectOf(el), rect)) hit.add(el.id)
      onSelectChange(hit)
    }
    const up = () => {
      setMarquee(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const inv = 1 / scale // counter-scale for constant on-screen handle/guide size

  return (
    <div style={{ width: SLIDE_W * scale, height: SLIDE_H * scale, position: 'relative' }}>
      <div
        ref={innerRef}
        role="application"
        aria-label="Slide canvas"
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          background: slide.background ?? t.bg,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'absolute',
          borderRadius: 6,
          boxShadow: '0 6px 30px rgba(0,0,0,.25)',
          overflow: 'hidden',
        }}
        onPointerDown={onBackgroundPointerDown}
      >
        {visible.map((el) => {
          const isSelected = selectedIds.has(el.id)
          const isEditing = el.id === editingTextId
          return (
            <div
              key={el.id}
              style={{
                ...elementStyle(el),
                ...elementTransform(el),
                cursor: readOnly || el.locked ? 'default' : 'move',
                outline: isSelected ? `${1.5 * inv}px solid ${ACCENT}` : 'none',
                outlineOffset: 2 * inv,
              }}
              onPointerDown={(e) => onElementPointerDown(e, el)}
              onDoubleClick={(e) => {
                e.stopPropagation()
                if (!readOnly && el.kind === 'text' && !el.locked) onEditText(el.id)
              }}
            >
              {isEditing && el.kind === 'text' ? (
                <textarea
                  autoFocus
                  value={el.text}
                  aria-label="Edit text"
                  style={{
                    width: '100%',
                    height: '100%',
                    fontSize: el.fontSize,
                    fontWeight: el.bold ? 700 : 400,
                    fontStyle: el.italic ? 'italic' : 'normal',
                    textAlign: el.align,
                    color: el.color ?? t.text,
                    lineHeight: 1.25,
                    background: 'transparent',
                    border: `${inv}px dashed ${ACCENT}`,
                    outline: 'none',
                    resize: 'none',
                    fontFamily: 'inherit',
                    padding: 0,
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const value = e.target.value
                    setSlideElements(
                      slide.elements.map((x) =>
                        x.id === el.id && x.kind === 'text' ? { ...x, text: value } : x,
                      ),
                      { coalesceKey: `text-${el.id}` },
                    )
                  }}
                  onBlur={() => {
                    onEditText(null)
                    onSeal()
                  }}
                />
              ) : (
                <ElementContent el={el} themeText={t.text} />
              )}

              {/* single-selection transform handles */}
              {single?.id === el.id && !isEditing && !readOnly && !el.locked && (
                <>
                  <span
                    role="presentation"
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: -ROTATE_OFFSET_PX * inv,
                      width: HANDLE_PX * inv,
                      height: HANDLE_PX * inv,
                      transform: 'translate(-50%,-50%)',
                      borderRadius: '50%',
                      border: `${2 * inv}px solid ${ACCENT}`,
                      background: '#fff',
                      cursor: 'grab',
                      zIndex: 100,
                    }}
                    onPointerDown={(e) => onRotatePointerDown(e, el)}
                  />
                  {RESIZE_HANDLES.map((h) => (
                    <span
                      key={h}
                      role="presentation"
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: HANDLE_POS[h].left,
                        top: HANDLE_POS[h].top,
                        width: HANDLE_PX * inv,
                        height: HANDLE_PX * inv,
                        transform: 'translate(-50%,-50%)',
                        borderRadius: 2 * inv,
                        border: `${2 * inv}px solid ${ACCENT}`,
                        background: '#fff',
                        cursor: HANDLE_CURSOR[h],
                        zIndex: 100,
                      }}
                      onPointerDown={(e) => onResizePointerDown(e, el, h)}
                    />
                  ))}
                </>
              )}
            </div>
          )
        })}

        {/* multi-selection union bounds (dashed, no handles) */}
        {selectedIds.size > 1 && (
          <MultiBounds elements={visible.filter((e) => selectedIds.has(e.id))} inv={inv} />
        )}

        {/* live smart guides */}
        {guides.map((g, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              background: GUIDE,
              pointerEvents: 'none',
              zIndex: 120,
              ...(g.axis === 'x'
                ? { left: g.pos, top: g.from, width: Math.max(1, inv), height: g.to - g.from }
                : { top: g.pos, left: g.from, height: Math.max(1, inv), width: g.to - g.from }),
            }}
          />
        ))}

        {/* marquee */}
        {marquee && (
          <div
            style={{
              position: 'absolute',
              left: marquee.x,
              top: marquee.y,
              width: marquee.w,
              height: marquee.h,
              border: `${inv}px solid ${ACCENT}`,
              background: 'rgba(13,153,255,.10)',
              pointerEvents: 'none',
              zIndex: 110,
            }}
          />
        )}
      </div>
    </div>
  )
}

function MultiBounds({ elements, inv }: { elements: PresentElement[]; inv: number }) {
  const b = unionBounds(elements.map(rectOf))
  return (
    <div
      style={{
        position: 'absolute',
        left: b.x,
        top: b.y,
        width: b.w,
        height: b.h,
        border: `${1.5 * inv}px dashed ${ACCENT}`,
        pointerEvents: 'none',
        zIndex: 90,
      }}
    />
  )
}
