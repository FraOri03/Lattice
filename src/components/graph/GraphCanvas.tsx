import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CARD_COLORS, type CardColor } from '@/types/model'
import type { GraphViewSettings, LatticeGraphEdge, LatticeGraphNode } from '@/lib/graph/graphTypes'
import type { LayoutPositions } from '@/lib/graph/forceLayout'
import { edgeStyle } from './graphVisuals'

export interface GraphCameraApi {
  fit: () => void
  reset: () => void
  zoomBy: (factor: number) => void
  centerOn: (nodeId: string) => void
}

interface Pt {
  x: number
  y: number
}

interface GraphCanvasProps {
  nodes: LatticeGraphNode[]
  edges: LatticeGraphEdge[]
  positions: LayoutPositions
  settings: GraphViewSettings
  selectedId: string | null
  focusId: string | null
  hoveredId: string | null
  searchMatchIds: Set<string> | null
  onSelect: (id: string | null) => void
  onOpen: (node: LatticeGraphNode, opts: { split: boolean }) => void
  onHover: (id: string | null, screen?: Pt) => void
  onPinNode: (id: string, pos: Pt) => void
  onKeyboardFocus: (node: LatticeGraphNode | null) => void
  apiRef?: (api: GraphCameraApi | null) => void
}

const MIN_ZOOM = 0.05
const MAX_ZOOM = 4
const LABEL_CAP = 70

function themeColors() {
  const s = getComputedStyle(document.documentElement)
  const v = (n: string, f: string) => s.getPropertyValue(n).trim() || f
  return {
    bg: v('--bg', '#1b1b1f'),
    panel: v('--panel', '#232327'),
    bord: v('--bord', '#38383e'),
    ink: v('--ink', '#e8e8ea'),
    muted: v('--muted', '#97979f'),
    accent: v('--accent', '#0d99ff'),
  }
}

function colorForNode(node: LatticeGraphNode, accent: string, muted: string): string {
  const token = node.colorToken
  if (token === 'tag') return accent
  if (token === 'project') return muted
  return CARD_COLORS[(token as CardColor) ?? 'gray'] ?? CARD_COLORS.gray
}

/**
 * Canvas 2D relationship renderer. A static, precomputed force layout (no
 * perpetual physics), viewport culling, capped labels, pan/zoom, node drag
 * (which pins), plus full keyboard traversal and an aria-live status line —
 * so the graph is explorable without a mouse and never repeats the Board's
 * historical keyboard gap.
 */
export function GraphCanvas(props: GraphCanvasProps) {
  const {
    nodes,
    edges,
    positions,
    settings,
    selectedId,
    focusId,
    hoveredId,
    searchMatchIds,
    onSelect,
    onOpen,
    onHover,
    onPinNode,
    onKeyboardFocus,
    apiRef,
  } = props

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const drawRef = useRef<() => void>(() => {})
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 })
  const sizeRef = useRef({ w: 800, h: 600 })
  const dragRef = useRef<
    | { kind: 'pan'; startX: number; startY: number; camX: number; camY: number }
    | { kind: 'node'; id: string; moved: boolean; pos: Pt }
    | null
  >(null)
  const [kbdFocusId, setKbdFocusId] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')

  const posById = useMemo(() => new Map(Object.entries(positions)), [positions])
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  // undirected adjacency for neighbourhood highlight + keyboard traversal
  const adjacency = useMemo(() => {
    const adj = new Map<string, Set<string>>()
    for (const n of nodes) adj.set(n.id, new Set())
    for (const e of edges) {
      adj.get(e.source)?.add(e.target)
      adj.get(e.target)?.add(e.source)
    }
    return adj
  }, [nodes, edges])

  // stable ordered list for Up/Down traversal
  const ordered = useMemo(
    () => [...nodes].sort((a, b) => a.label.localeCompare(b.label)),
    [nodes],
  )

  const activeId = hoveredId ?? selectedId ?? kbdFocusId ?? focusId
  const highlightSet = useMemo(() => {
    if (!activeId) return null
    const set = new Set<string>([activeId])
    for (const nb of adjacency.get(activeId) ?? []) set.add(nb)
    return set
  }, [activeId, adjacency])

  /* ---------------- geometry ---------------- */

  const worldToScreen = useCallback((wx: number, wy: number): Pt => {
    const { x, y, zoom } = cameraRef.current
    const { w, h } = sizeRef.current
    return { x: (wx - x) * zoom + w / 2, y: (wy - y) * zoom + h / 2 }
  }, [])

  const screenToWorld = useCallback((sx: number, sy: number): Pt => {
    const { x, y, zoom } = cameraRef.current
    const { w, h } = sizeRef.current
    return { x: (sx - w / 2) / zoom + x, y: (sy - h / 2) / zoom + y }
  }, [])

  const nodeRadius = useCallback(
    (node: LatticeGraphNode) =>
      settings.nodeSizeMode === 'fixed' ? 8 : (node.size ?? 6),
    [settings.nodeSizeMode],
  )

  const fitView = useCallback(
    () => {
      if (!nodes.length) return
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const n of nodes) {
        const p = posById.get(n.id)
        if (!p) continue
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      }
      if (!Number.isFinite(minX)) return
      const { w, h } = sizeRef.current
      const gw = Math.max(1, maxX - minX)
      const gh = Math.max(1, maxY - minY)
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((w - 120) / gw, (h - 120) / gh)))
      cameraRef.current = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom }
      draw()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, posById],
  )

  /* ---------------- drawing ---------------- */

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { w, h } = sizeRef.current
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const t = themeColors()
    const { zoom } = cameraRef.current

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const dim = (base: string, on: boolean) => {
      ctx.globalAlpha = on ? 1 : 0.18
      return base
    }

    // edges first
    const edgeCap = nodes.length > 6000 ? 15000 : edges.length
    let drawn = 0
    for (const e of edges) {
      if (drawn++ > edgeCap) break
      const a = posById.get(e.source)
      const b = posById.get(e.target)
      if (!a || !b) continue
      const sa = worldToScreen(a.x, a.y)
      const sb = worldToScreen(b.x, b.y)
      // cull edges entirely off-screen
      if (
        (sa.x < -20 && sb.x < -20) ||
        (sa.x > w + 20 && sb.x > w + 20) ||
        (sa.y < -20 && sb.y < -20) ||
        (sa.y > h + 20 && sb.y > h + 20)
      )
        continue
      const lit =
        !highlightSet || (highlightSet.has(e.source) && highlightSet.has(e.target))
      ctx.strokeStyle = dim(lit && highlightSet ? t.accent : t.bord, !highlightSet || lit)
      ctx.lineWidth = (lit && highlightSet ? 1.4 : 1) * Math.min(1.6, Math.max(0.5, zoom))
      const dash = edgeStyle(e.kind).dash
      ctx.setLineDash(dash.map((d) => d * Math.max(0.6, Math.min(2, zoom))))
      ctx.beginPath()
      ctx.moveTo(sa.x, sa.y)
      ctx.lineTo(sb.x, sb.y)
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    // nodes
    const labelCandidates: { node: LatticeGraphNode; s: Pt; r: number }[] = []
    for (const node of nodes) {
      const p = posById.get(node.id)
      if (!p) continue
      const s = worldToScreen(p.x, p.y)
      const r = Math.max(2.5, nodeRadius(node) * Math.min(1.8, Math.max(0.35, zoom)))
      if (s.x < -r || s.x > w + r || s.y < -r || s.y > h + r) continue
      const on = !highlightSet || highlightSet.has(node.id)
      const isSel = node.id === selectedId
      const isFocus = node.id === focusId
      const isKbd = node.id === kbdFocusId
      const isMatch = searchMatchIds?.has(node.id) ?? false
      const color = colorForNode(node, t.accent, t.muted)

      ctx.globalAlpha = on ? 1 : 0.2

      // focus halo
      if (isFocus || isKbd) {
        ctx.beginPath()
        ctx.arc(s.x, s.y, r + 6, 0, Math.PI * 2)
        ctx.fillStyle = t.accent
        ctx.globalAlpha = 0.16
        ctx.fill()
        ctx.globalAlpha = on ? 1 : 0.2
      }

      ctx.beginPath()
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2)
      if (node.kind === 'board') {
        // board: larger outlined node (shape redundancy, not colour-only)
        ctx.fillStyle = t.panel
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = color
        ctx.stroke()
      } else {
        ctx.fillStyle = color
        ctx.fill()
      }

      if (isMatch) {
        ctx.lineWidth = 2.5
        ctx.strokeStyle = '#ffcd29'
        ctx.beginPath()
        ctx.arc(s.x, s.y, r + 2.5, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (isSel) {
        ctx.lineWidth = 2.5
        ctx.strokeStyle = t.accent
        ctx.beginPath()
        ctx.arc(s.x, s.y, r + 3.5, 0, Math.PI * 2)
        ctx.stroke()
      }

      if (on || isSel || isMatch) {
        labelCandidates.push({ node, s, r })
      }
    }
    ctx.globalAlpha = 1

    // labels — capped, prioritised by relevance then degree
    if (settings.showLabels !== 'none') {
      const prioritized = labelCandidates
        .map((c) => ({
          ...c,
          score:
            (c.node.id === selectedId ? 1000 : 0) +
            (c.node.id === activeId ? 800 : 0) +
            (searchMatchIds?.has(c.node.id) ? 600 : 0) +
            (highlightSet?.has(c.node.id) ? 300 : 0) +
            (c.node.degree ?? 0),
        }))
        .sort((a, b) => b.score - a.score)

      const showAll = settings.showLabels === 'all'
      const showSelected = settings.showLabels === 'selected'
      const zoomedEnough = zoom > 0.55
      // smart mode still labels the most important nodes when zoomed out —
      // just fewer of them, so the graph is never completely unlabelled
      const cap = showAll
        ? Math.min(labelCandidates.length, 260)
        : showSelected
          ? labelCandidates.length
          : zoomedEnough
            ? LABEL_CAP
            : 26
      let shown = 0
      ctx.font = '11px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      for (const c of prioritized) {
        if (shown >= cap) break
        const relevant =
          c.node.id === selectedId ||
          c.node.id === activeId ||
          (searchMatchIds?.has(c.node.id) ?? false) ||
          (highlightSet?.has(c.node.id) ?? false)
        if (showSelected && !relevant) continue
        const label = c.node.label.length > 26 ? c.node.label.slice(0, 25) + '…' : c.node.label
        const ty = c.s.y + c.r + 2
        ctx.globalAlpha = 1
        ctx.fillStyle = t.bg
        ctx.lineWidth = 3
        ctx.strokeStyle = t.bg
        ctx.strokeText(label, c.s.x, ty)
        ctx.fillStyle = highlightSet && !highlightSet.has(c.node.id) ? t.muted : t.ink
        ctx.fillText(label, c.s.x, ty)
        shown++
      }
    }
    ctx.globalAlpha = 1
  }, [
    nodes,
    edges,
    posById,
    highlightSet,
    selectedId,
    focusId,
    kbdFocusId,
    searchMatchIds,
    settings.showLabels,
    activeId,
    nodeRadius,
    worldToScreen,
  ])

  // keep a stable pointer to the latest draw so sizing can redraw without
  // re-subscribing the ResizeObserver on every draw-identity change
  drawRef.current = draw

  /* ---------------- sizing ---------------- */

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      sizeRef.current = { w: rect.width, h: rect.height }
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      drawRef.current()
    }
    resize() // size synchronously on mount — don't wait for RO's first delivery
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // fit whenever the layout (positions) changes structurally
  const posKey = useMemo(() => `${nodes.length}:${Object.keys(positions).length}`, [nodes.length, positions])
  useEffect(() => {
    fitView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posKey])

  // redraw on selection/hover/search changes (cheap; no perpetual loop)
  useEffect(() => {
    draw()
  }, [draw])

  // expose camera API to the toolbar
  useEffect(() => {
    if (!apiRef) return
    const api: GraphCameraApi = {
      fit: () => fitView(),
      reset: () => {
        cameraRef.current = { x: 0, y: 0, zoom: 1 }
        fitView()
      },
      zoomBy: (factor) => {
        cameraRef.current.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cameraRef.current.zoom * factor))
        draw()
      },
      centerOn: (id) => {
        const p = posById.get(id)
        if (p) {
          cameraRef.current.x = p.x
          cameraRef.current.y = p.y
          draw()
        }
      },
    }
    apiRef(api)
    return () => apiRef(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiRef, fitView, posById])

  /* ---------------- hit testing ---------------- */

  const nodeAt = useCallback(
    (sx: number, sy: number): LatticeGraphNode | null => {
      const world = screenToWorld(sx, sy)
      let best: LatticeGraphNode | null = null
      let bestDist = Infinity
      for (const node of nodes) {
        const p = posById.get(node.id)
        if (!p) continue
        const r = nodeRadius(node) + 6 / cameraRef.current.zoom
        const d = (p.x - world.x) ** 2 + (p.y - world.y) ** 2
        if (d <= r * r && d < bestDist) {
          bestDist = d
          best = node
        }
      }
      return best
    },
    [nodes, posById, nodeRadius, screenToWorld],
  )

  /* ---------------- pointer interaction ---------------- */

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const hit = nodeAt(sx, sy)
    if (hit) {
      const p = posById.get(hit.id)!
      dragRef.current = { kind: 'node', id: hit.id, moved: false, pos: { ...p } }
    } else {
      dragRef.current = {
        kind: 'pan',
        startX: sx,
        startY: sy,
        camX: cameraRef.current.x,
        camY: cameraRef.current.y,
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const drag = dragRef.current
    if (!drag) {
      const hit = nodeAt(sx, sy)
      onHover(hit?.id ?? null, hit ? { x: e.clientX, y: e.clientY } : undefined)
      if (canvasRef.current) canvasRef.current.style.cursor = hit ? 'pointer' : 'grab'
      return
    }
    if (drag.kind === 'pan') {
      const { zoom } = cameraRef.current
      cameraRef.current.x = drag.camX - (sx - drag.startX) / zoom
      cameraRef.current.y = drag.camY - (sy - drag.startY) / zoom
      draw()
    } else {
      const world = screenToWorld(sx, sy)
      drag.pos = world
      drag.moved = true
      posById.set(drag.id, world) // live override; pinned on release
      draw()
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    if (drag.kind === 'node') {
      if (drag.moved) {
        onPinNode(drag.id, drag.pos)
      } else {
        const node = nodeById.get(drag.id)
        if (node) {
          setKbdFocusId(drag.id)
          onSelect(drag.id)
        }
      }
    } else if (drag.kind === 'pan') {
      const rect = canvasRef.current!.getBoundingClientRect()
      const movedX = Math.abs(e.clientX - rect.left - drag.startX)
      const movedY = Math.abs(e.clientY - rect.top - drag.startY)
      if (movedX < 3 && movedY < 3) onSelect(null) // click empty clears
    }
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const hit = nodeAt(e.clientX - rect.left, e.clientY - rect.top)
    if (hit) onOpen(hit, { split: e.ctrlKey || e.metaKey })
  }

  const onWheel = (e: React.WheelEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const before = screenToWorld(sx, sy)
    const factor = Math.exp(-e.deltaY * 0.0015)
    cameraRef.current.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cameraRef.current.zoom * factor))
    const after = screenToWorld(sx, sy)
    cameraRef.current.x += before.x - after.x
    cameraRef.current.y += before.y - after.y
    draw()
  }

  /* ---------------- keyboard ---------------- */

  const focusNode = useCallback(
    (id: string | null) => {
      setKbdFocusId(id)
      const node = id ? (nodeById.get(id) ?? null) : null
      onKeyboardFocus(node)
      if (id) {
        const p = posById.get(id)
        if (p) {
          cameraRef.current.x = p.x
          cameraRef.current.y = p.y
          draw()
        }
        if (node) {
          const deg = node.degree ?? 0
          setAnnounce(`${node.label}, ${node.subtitle ?? node.kind}, ${deg} link${deg === 1 ? '' : 's'}`)
        }
      }
    },
    [nodeById, posById, onKeyboardFocus, draw],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!ordered.length) return
    const currentIndex = kbdFocusId ? ordered.findIndex((n) => n.id === kbdFocusId) : -1
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const delta = e.key === 'ArrowDown' ? 1 : -1
      const next = ordered[(currentIndex + delta + ordered.length) % ordered.length]
      focusNode(next.id)
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      if (!kbdFocusId) {
        focusNode(ordered[0].id)
        return
      }
      const neighbors = [...(adjacency.get(kbdFocusId) ?? [])].sort()
      if (!neighbors.length) return
      const cur = neighbors.indexOf(kbdFocusId)
      const delta = e.key === 'ArrowRight' ? 1 : -1
      const idx = cur === -1 ? (e.key === 'ArrowRight' ? 0 : neighbors.length - 1) : cur + delta
      const nb = neighbors[(idx + neighbors.length) % neighbors.length]
      focusNode(nb)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const node = kbdFocusId ? nodeById.get(kbdFocusId) : null
      if (node) onOpen(node, { split: e.ctrlKey || e.metaKey })
    } else if (e.key === ' ') {
      e.preventDefault()
      if (kbdFocusId) onSelect(kbdFocusId)
    } else if (e.key === 'Escape') {
      onSelect(null)
      focusNode(null)
    } else if (e.key === '+' || e.key === '=') {
      cameraRef.current.zoom = Math.min(MAX_ZOOM, cameraRef.current.zoom * 1.2)
      draw()
    } else if (e.key === '-') {
      cameraRef.current.zoom = Math.max(MIN_ZOOM, cameraRef.current.zoom / 1.2)
      draw()
    } else if (e.key === 'f') {
      fitView()
    }
  }

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden bg-bg"
      role="application"
      aria-label="Project relationship graph. Use arrow keys to move between nodes, Enter to open, Space to select."
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={() => {
        if (!kbdFocusId && ordered.length) focusNode(ordered[0].id)
      }}
    >
      <canvas
        ref={canvasRef}
        className="block touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => onHover(null)}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
      />
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
    </div>
  )
}
