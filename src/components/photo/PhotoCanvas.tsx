import { useEffect, useRef, useState } from 'react'
import { usePhotoStore } from '@/store/photoStore'
import { ElementGlyph, LightingLayer } from '@/components/photo/PhotoSceneRender'
import type { PhotoElement } from '@/types/photo'

/**
 * The 2D top-down set canvas: SVG world in centimeters with pan/zoom,
 * drag-to-move and a rotation handle. Glyphs and the dynamic lighting
 * layer are shared with the board card preview (PhotoSceneRender).
 */
export function PhotoCanvas() {
  const shots = usePhotoStore((s) => s.shots)
  const activeShotId = usePhotoStore((s) => s.activeShotId)
  const selectedElementId = usePhotoStore((s) => s.selectedElementId)
  const canvasScale = usePhotoStore((s) => s.canvasScale)
  const canvasTranslateX = usePhotoStore((s) => s.canvasTranslateX)
  const canvasTranslateY = usePhotoStore((s) => s.canvasTranslateY)
  const tool = usePhotoStore((s) => s.tool)
  const gridVisible = usePhotoStore((s) => s.gridVisible)
  const gridSnap = usePhotoStore((s) => s.gridSnap)
  const rulersVisible = usePhotoStore((s) => s.rulersVisible)
  const selectElement = usePhotoStore((s) => s.selectElement)
  const updateElement = usePhotoStore((s) => s.updateElement)
  const pushHistory = usePhotoStore((s) => s.pushHistory)
  const setCanvasTransform = usePhotoStore((s) => s.setCanvasTransform)

  const currentShot = shots.find((s) => s.id === activeShotId) ?? shots[0]
  const elements = currentShot?.elements ?? []

  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<SVGSVGElement | null>(null)

  const [draggedElementId, setDraggedElementId] = useState<string | null>(null)
  const [dragStartOffset, setDragStartOffset] = useState({ x: 0, y: 0 })
  const [isRotating, setIsRotating] = useState(false)
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null)
  const [spacePressed, setSpacePressed] = useState(false)

  // Space = temporary hand tool (ignored while typing in a field)
  useEffect(() => {
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e.target)) {
        setSpacePressed(true)
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePressed(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Wheel zoom around the pointer. Native non-passive listener — React's
  // root wheel handler is passive, so preventDefault would be ignored there.
  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const st = usePhotoStore.getState()
      const rect = node.getBoundingClientRect()
      const pointerX = e.clientX - rect.left
      const pointerY = e.clientY - rect.top
      const canvasX = (pointerX - st.canvasTranslateX) / st.canvasScale
      const canvasY = (pointerY - st.canvasTranslateY) / st.canvasScale
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
      const newScale = Math.max(0.05, Math.min(20, st.canvasScale * zoomFactor))
      st.setCanvasTransform(
        newScale,
        pointerX - canvasX * newScale,
        pointerY - canvasY * newScale,
      )
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [])

  /** Screen pixels → world centimeters. */
  const getCanvasCoords = (e: React.MouseEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 }
    const rect = canvasRef.current.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left - canvasTranslateX) / canvasScale,
      y: (e.clientY - rect.top - canvasTranslateY) / canvasScale,
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (spacePressed || tool === 'pan' || e.button === 1) {
      setPanStart({ x: e.clientX - canvasTranslateX, y: e.clientY - canvasTranslateY })
      e.preventDefault()
      return
    }
    if (e.target === canvasRef.current || (e.target as SVGElement).id === 'photo-grid-bg') {
      selectElement(null)
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (panStart) {
      setCanvasTransform(canvasScale, e.clientX - panStart.x, e.clientY - panStart.y)
      return
    }
    if (!draggedElementId) return
    const coords = getCanvasCoords(e)
    const targetEl = elements.find((el) => el.id === draggedElementId)
    if (!targetEl) return

    if (isRotating) {
      const angleRad = Math.atan2(coords.y - targetEl.y, coords.x - targetEl.x)
      // The handle sits ABOVE the element (local −y), whose world angle is
      // rotation − 90°; solving pointerAngle = rotation − 90 gives +90 here.
      // (−90 was the old bug: every grab flipped the element by 180°.)
      let angleDeg = Math.round((angleRad * 180) / Math.PI) + 90
      angleDeg = ((angleDeg % 360) + 360) % 360
      if (e.shiftKey) angleDeg = Math.round(angleDeg / 15) * 15
      updateElement(draggedElementId, { rotation: angleDeg })
    } else {
      let newX = coords.x - dragStartOffset.x
      let newY = coords.y - dragStartOffset.y
      if (gridSnap) {
        const snap = e.shiftKey ? 50 : 10 // cm
        newX = Math.round(newX / snap) * snap
        newY = Math.round(newY / snap) * snap
      }
      updateElement(draggedElementId, { x: newX, y: newY })
    }
  }

  const handleMouseUp = () => {
    if (panStart) setPanStart(null)
    if (draggedElementId) {
      setDraggedElementId(null)
      setIsRotating(false)
      pushHistory() // one undo step per completed drag/rotate
    }
  }

  const handleElementMouseDown = (
    el: PhotoElement,
    e: React.MouseEvent,
    isRotationTrigger = false,
  ) => {
    e.stopPropagation()
    if (spacePressed || tool === 'pan') return
    selectElement(el.id)
    const coords = getCanvasCoords(e)
    if (isRotationTrigger) {
      setIsRotating(true)
      setDraggedElementId(el.id)
    } else {
      if (el.locked) return
      setIsRotating(false)
      setDraggedElementId(el.id)
      setDragStartOffset({ x: coords.x - el.x, y: coords.y - el.y })
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-bg select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: spacePressed || tool === 'pan' ? 'grab' : 'default' }}
    >
      <svg ref={canvasRef} className="absolute top-0 left-0 h-full w-full">
        {gridVisible && (
          <defs>
            {/* 1m major grid, 10cm minor dots */}
            <pattern
              id="photo-minor-grid"
              width={10 * canvasScale}
              height={10 * canvasScale}
              patternUnits="userSpaceOnUse"
            >
              <circle
                cx={5 * canvasScale}
                cy={5 * canvasScale}
                r={0.8}
                style={{ fill: 'var(--ink)' }}
                fillOpacity={0.09}
              />
            </pattern>
            <pattern
              id="photo-major-grid"
              width={100 * canvasScale}
              height={100 * canvasScale}
              patternUnits="userSpaceOnUse"
              x={canvasTranslateX}
              y={canvasTranslateY}
            >
              <rect
                width={100 * canvasScale}
                height={100 * canvasScale}
                fill="url(#photo-minor-grid)"
              />
              <line
                x1={0}
                y1={0}
                x2={100 * canvasScale}
                y2={0}
                style={{ stroke: 'var(--bord)' }}
                strokeOpacity={0.7}
                strokeWidth={1}
              />
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={100 * canvasScale}
                style={{ stroke: 'var(--bord)' }}
                strokeOpacity={0.7}
                strokeWidth={1}
              />
            </pattern>
          </defs>
        )}

        <rect
          id="photo-grid-bg"
          width="100%"
          height="100%"
          fill={gridVisible ? 'url(#photo-major-grid)' : 'transparent'}
        />

        {/* origin axes (world 0,0) */}
        <g opacity={0.18} style={{ pointerEvents: 'none' }}>
          <line
            x1={canvasTranslateX}
            y1={0}
            x2={canvasTranslateX}
            y2="100%"
            style={{ stroke: 'var(--accent)' }}
            strokeWidth={1.5}
            strokeDasharray="4,4"
          />
          <line
            x1={0}
            y1={canvasTranslateY}
            x2="100%"
            y2={canvasTranslateY}
            style={{ stroke: 'var(--accent)' }}
            strokeWidth={1.5}
            strokeDasharray="4,4"
          />
          <circle
            cx={canvasTranslateX}
            cy={canvasTranslateY}
            r={8}
            fill="none"
            style={{ stroke: 'var(--accent)' }}
            strokeWidth={1.5}
          />
        </g>

        <g transform={`translate(${canvasTranslateX}, ${canvasTranslateY}) scale(${canvasScale})`}>
          {/* dynamic light: beams clipped by walls & co., with bounce glow */}
          <LightingLayer elements={elements} />

          {elements
            .filter((el) => !el.hidden)
            .slice()
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((el) => {
              const isSelected = selectedElementId === el.id

              return (
                <g
                  key={el.id}
                  transform={`translate(${el.x}, ${el.y}) rotate(${el.rotation})`}
                  onMouseDown={(e) => handleElementMouseDown(el, e)}
                  style={{ cursor: el.locked ? 'not-allowed' : 'move' }}
                >
                  <ElementGlyph el={el} selected={isSelected} />

                  {/* name label (kept horizontal) */}
                  <g transform={`rotate(${-el.rotation})`} style={{ pointerEvents: 'none' }}>
                    <rect
                      x={-50}
                      y={el.type === 'camera' ? 22 : 28}
                      width={100}
                      height={16}
                      rx={4}
                      style={{ fill: 'var(--panel)', stroke: 'var(--bord)' }}
                      fillOpacity={0.9}
                      strokeWidth={0.5}
                    />
                    <text
                      x={0}
                      y={el.type === 'camera' ? 34 : 40}
                      style={{ fill: isSelected ? 'var(--ink)' : 'var(--muted)' }}
                      fontSize={8}
                      fontFamily="sans-serif"
                      fontWeight={isSelected ? 'bold' : 'normal'}
                      textAnchor="middle"
                    >
                      {el.label || el.name}
                    </text>
                  </g>

                  {/* selection ring + rotation handle */}
                  {isSelected && !el.locked && (
                    <g style={{ pointerEvents: 'auto' }}>
                      <circle
                        cx={0}
                        cy={0}
                        r={el.type === 'camera' ? 28 : 34}
                        fill="none"
                        style={{ stroke: 'var(--accent)' }}
                        strokeWidth={1}
                        strokeDasharray="4,2"
                      />
                      <line
                        x1={0}
                        y1={el.type === 'camera' ? -28 : -34}
                        x2={0}
                        y2={el.type === 'camera' ? -50 : -56}
                        style={{ stroke: 'var(--accent)' }}
                        strokeWidth={1.5}
                      />
                      <circle
                        cx={0}
                        cy={el.type === 'camera' ? -50 : -56}
                        r={6}
                        style={{ fill: 'var(--accent)', stroke: 'var(--panel)' }}
                        strokeWidth={1.5}
                        className="cursor-alias"
                        onMouseDown={(e) => handleElementMouseDown(el, e, true)}
                      >
                        <title>Drag to rotate (Shift snaps to 15°)</title>
                      </circle>
                    </g>
                  )}
                </g>
              )
            })}
        </g>
      </svg>

      {/* meter rulers */}
      {rulersVisible && (
        <div className="pointer-events-none absolute top-0 left-0 h-full w-full">
          <div className="absolute top-0 left-0 flex h-5 w-full items-center overflow-hidden border-b border-bord bg-panel/90 font-mono text-[9px] text-muted">
            <div className="flex h-full w-5 flex-none items-center justify-center border-r border-bord bg-panel2 font-bold">
              m
            </div>
            <div className="relative h-full w-full">
              {Array.from({ length: 41 }).map((_, i) => {
                const offset = canvasTranslateX + (i - 20) * 100 * canvasScale
                if (offset < 0 || offset > 4000) return null
                return (
                  <div
                    key={i}
                    className="absolute bottom-0 flex h-full flex-col justify-end border-l border-bord pb-0.5"
                    style={{ left: `${offset}px` }}
                  >
                    <span className="pl-1 leading-none">{i - 20}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="absolute top-5 left-0 h-[calc(100%-20px)] w-5 overflow-hidden border-r border-bord bg-panel/90 font-mono text-[9px] text-muted">
            <div className="relative h-full w-full">
              {Array.from({ length: 31 }).map((_, i) => {
                const offset = canvasTranslateY + (i - 15) * 100 * canvasScale - 20
                if (offset < 0 || offset > 3000) return null
                return (
                  <div
                    key={i}
                    className="absolute left-0 w-full border-t border-bord pt-0.5 pl-0.5"
                    style={{ top: `${offset}px` }}
                  >
                    <span className="block leading-none">{i - 15}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* zoom readout */}
      <div className="absolute bottom-3 left-8 z-10 flex items-center gap-2.5 rounded-lg border border-bord bg-panel/95 px-2.5 py-1 text-[11px] text-muted shadow-md">
        <span className="font-mono">{Math.round(canvasScale * 100)}%</span>
        <button
          className="cursor-pointer rounded-md border border-bord bg-panel2 px-1.5 py-0.5 text-[10px] hover:text-ink"
          onClick={() => setCanvasTransform(1, 400, 300)}
          title="Reset zoom & position"
        >
          Reset
        </button>
        <span className="text-[10px]">1 square = 1 m</span>
      </div>
    </div>
  )
}
