import { useEffect, useRef } from 'react'
import { CARD_COLORS, type CardColor } from '@/types/model'
import type { LatticeGraphNode } from '@/lib/graph/graphTypes'
import type { LayoutPositions } from '@/lib/graph/forceLayout'

const W = 150
const H = 110

/** Overview dot-cloud of the whole graph — clusters and shape at a glance. */
export function GraphMinimap({
  nodes,
  positions,
}: {
  nodes: LatticeGraphNode[]
  positions: LayoutPositions
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    if (!nodes.length) return

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of nodes) {
      const p = positions[n.id]
      if (!p) continue
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    if (!Number.isFinite(minX)) return
    const gw = Math.max(1, maxX - minX)
    const gh = Math.max(1, maxY - minY)
    const scale = Math.min((W - 12) / gw, (H - 12) / gh)
    const ox = (W - gw * scale) / 2 - minX * scale
    const oy = (H - gh * scale) / 2 - minY * scale

    // sample at most ~1500 dots for extreme graphs
    const stride = Math.max(1, Math.floor(nodes.length / 1500))
    for (let i = 0; i < nodes.length; i += stride) {
      const n = nodes[i]
      const p = positions[n.id]
      if (!p) continue
      ctx.fillStyle = CARD_COLORS[(n.colorToken as CardColor) ?? 'gray'] ?? CARD_COLORS.gray
      ctx.globalAlpha = 0.8
      ctx.beginPath()
      ctx.arc(p.x * scale + ox, p.y * scale + oy, 1.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [nodes, positions])

  return (
    <div className="absolute bottom-3 left-3 z-20 overflow-hidden rounded-lg border border-bord bg-panel/90 shadow-lg backdrop-blur">
      <canvas ref={ref} style={{ width: W, height: H }} aria-hidden />
    </div>
  )
}
