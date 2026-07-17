import { useMemo } from 'react'
import {
  collectOccluders,
  computeLightArea,
  kelvinToColor,
} from '@/lib/photo/lighting'
import type {
  PhotoCameraElement,
  PhotoElement,
  PhotoLightElement,
  PhotoPersonElement,
  PhotoPropElement,
  PhotoShot,
} from '@/types/photo'

/**
 * Shared presentational pieces for the photo scene: element glyphs, the
 * dynamic lighting layer and a read-only fit-to-bounds preview. Used by
 * the interactive PhotoCanvas and by the board's photo card.
 */

const isPropLike = (el: PhotoElement): el is PhotoPropElement =>
  el.type === 'prop' ||
  el.type === 'environment' ||
  el.type === 'nature' ||
  el.type === 'vehicle' ||
  el.type === 'furniture'

/** Preset prop symbols (walls, doors, vehicles, furniture…). */
function PropShape({ el, selected }: { el: PhotoPropElement; selected: boolean }) {
  const width = el.width || 100
  const height = el.height || 100
  const strokeColor = selected ? 'var(--accent)' : el.color
  const fillColor = `${el.color}33`

  switch (el.customSvgPath) {
    case 'wall':
      return (
        <rect
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          fill={el.color}
          fillOpacity={0.55}
          stroke={strokeColor}
          strokeWidth={2}
          rx={2}
        />
      )
    case 'door':
      return (
        <g>
          <line x1={-width / 2} y1={0} x2={-width / 2 + 10} y2={0} stroke={el.color} strokeWidth={6} />
          <line x1={-width / 2 + 10} y1={0} x2={width / 2} y2={-width + 10} stroke={strokeColor} strokeWidth={3} />
          <path
            d={`M ${-width / 2 + 10} 0 A ${width - 10} ${width - 10} 0 0 1 ${width / 2} 0`}
            fill="none"
            stroke={strokeColor}
            strokeOpacity={0.5}
            strokeWidth={1}
            strokeDasharray="4,4"
          />
        </g>
      )
    case 'window':
      return (
        <g>
          <rect
            x={-width / 2}
            y={-height / 2}
            width={width}
            height={height}
            fill="#0ea5e933"
            stroke={selected ? 'var(--accent)' : '#38bdf8'}
            strokeWidth={2}
          />
          <line x1={-width / 2} y1={0} x2={width / 2} y2={0} stroke="#38bdf8" strokeWidth={1} />
        </g>
      )
    case 'cyclorama':
      return (
        <path
          d={`M ${-width / 2} ${-height / 2} C ${-width / 4} ${height / 2}, ${width / 4} ${height / 2}, ${width / 2} ${-height / 2}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth={4}
        />
      )
    case 'backdrop':
      return (
        <line
          x1={-width / 2}
          y1={0}
          x2={width / 2}
          y2={0}
          stroke={strokeColor}
          strokeWidth={8}
          strokeLinecap="round"
        />
      )
    case 'car':
      return (
        <g opacity={el.opacity}>
          <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={25} fill={fillColor} stroke={strokeColor} strokeWidth={3} />
          <path
            d={`M ${-width / 5} ${-height / 2.5} L ${width / 5} ${-height / 2.5} Q ${width / 4} 0, ${width / 5} ${height / 2.5} L ${-width / 5} ${height / 2.5} Z`}
            fill={el.color}
            fillOpacity={0.35}
            stroke={strokeColor}
            strokeWidth={1.5}
          />
          <line x1={-width / 2} y1={-height / 3} x2={-width / 4} y2={-height / 3} stroke={strokeColor} strokeWidth={1.5} />
          <line x1={-width / 2} y1={height / 3} x2={-width / 4} y2={height / 3} stroke={strokeColor} strokeWidth={1.5} />
          <ellipse cx={-width / 2 + 10} cy={-height / 2.8} rx={12} ry={6} fill="#fbbf24" />
          <ellipse cx={-width / 2 + 10} cy={height / 2.8} rx={12} ry={6} fill="#fbbf24" />
        </g>
      )
    case 'motorcycle':
      return (
        <g>
          <rect x={-width / 2} y={-10} width={width} height={20} rx={5} fill={fillColor} stroke={strokeColor} strokeWidth={2} />
          <circle cx={-width / 2 + 20} cy={0} r={15} fill="none" stroke={strokeColor} strokeWidth={2} />
          <circle cx={width / 2 - 20} cy={0} r={15} fill="none" stroke={strokeColor} strokeWidth={2} />
          <line x1={-10} y1={-25} x2={-10} y2={25} stroke={strokeColor} strokeWidth={3} />
        </g>
      )
    case 'bicycle':
      return (
        <g>
          <line x1={-width / 2} y1={0} x2={width / 2} y2={0} stroke={strokeColor} strokeWidth={3} />
          <circle cx={-width / 2} cy={0} r={12} fill="none" stroke={strokeColor} strokeWidth={2} />
          <circle cx={width / 2} cy={0} r={12} fill="none" stroke={strokeColor} strokeWidth={2} />
          <line x1={-15} y1={-15} x2={15} y2={15} stroke={strokeColor} strokeWidth={1.5} />
        </g>
      )
    case 'tree':
      return (
        <g>
          <circle cx={0} cy={0} r={width / 2} fill="#16653433" stroke={strokeColor} strokeWidth={2} strokeDasharray="6,3" />
          <circle cx={0} cy={0} r={width / 3} fill="#15803d55" stroke={strokeColor} strokeWidth={1.5} />
          <circle cx={0} cy={0} r={12} fill="#78350f" />
        </g>
      )
    case 'rock':
      return (
        <polygon
          points={`0,${-height / 2} ${width / 2.2},${-height / 3} ${width / 2},${height / 4} ${width / 5},${height / 2} ${-width / 2.5},${height / 2.2} ${-width / 2},${-height / 5}`}
          fill="#52525b55"
          stroke={strokeColor}
          strokeWidth={2}
        />
      )
    case 'table':
      return (
        <g>
          <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={5} fill={fillColor} stroke={strokeColor} strokeWidth={2} />
          <circle cx={0} cy={0} r={15} fill="none" stroke={strokeColor} strokeWidth={1} strokeDasharray="3,3" />
          <circle cx={-width / 3} cy={0} r={10} fill="none" stroke={strokeColor} strokeWidth={1} />
          <circle cx={width / 3} cy={0} r={10} fill="none" stroke={strokeColor} strokeWidth={1} />
        </g>
      )
    case 'chair':
      return (
        <g>
          <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={8} fill={fillColor} stroke={strokeColor} strokeWidth={2} />
          <path d={`M ${-width / 2} ${-height / 2.5} Q 0 ${-height / 2}, ${width / 2} ${-height / 2.5}`} fill="none" stroke={strokeColor} strokeWidth={2} />
          <line x1={-width / 2} y1={-height / 4} x2={-width / 2} y2={height / 4} stroke={strokeColor} strokeWidth={1.5} />
          <line x1={width / 2} y1={-height / 4} x2={width / 2} y2={height / 4} stroke={strokeColor} strokeWidth={1.5} />
        </g>
      )
    case 'sofa':
      return (
        <g>
          <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={6} fill={fillColor} stroke={strokeColor} strokeWidth={2.5} />
          <rect x={-width / 2 + 10} y={-height / 2 + 5} width={width - 20} height={20} fill="none" stroke={strokeColor} strokeWidth={1.5} />
          <rect x={-width / 2 + 3} y={-height / 2 + 3} width={12} height={height - 6} fill="none" stroke={strokeColor} strokeWidth={1.5} />
          <rect x={width / 2 - 15} y={-height / 2 + 3} width={12} height={height - 6} fill="none" stroke={strokeColor} strokeWidth={1.5} />
        </g>
      )
    case 'bed':
      return (
        <g>
          <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={4} fill={fillColor} stroke={strokeColor} strokeWidth={2} />
          <rect x={-width / 2 + 15} y={-height / 2 + 10} width={width / 2.8} height={35} rx={5} fill="none" stroke={strokeColor} strokeWidth={1.5} />
          <rect x={width / 2 - width / 2.8 - 15} y={-height / 2 + 10} width={width / 2.8} height={35} rx={5} fill="none" stroke={strokeColor} strokeWidth={1.5} />
          <line x1={-width / 2} y1={-height / 8} x2={width / 2} y2={-height / 8} stroke={strokeColor} strokeWidth={1.5} />
        </g>
      )
    case 'dolly':
      return (
        <g>
          <line x1={-width / 2} y1={-15} x2={width / 2} y2={-15} stroke={strokeColor} strokeWidth={3} />
          <line x1={-width / 2} y1={15} x2={width / 2} y2={15} stroke={strokeColor} strokeWidth={3} />
          {Array.from({ length: 8 }).map((_, i) => {
            const xPos = -width / 2 + (width / 7) * i
            return <line key={i} x1={xPos} y1={-25} x2={xPos} y2={25} stroke={strokeColor} strokeWidth={1.5} />
          })}
        </g>
      )
    case 'slider':
      return (
        <g>
          <line x1={-width / 2} y1={0} x2={width / 2} y2={0} stroke={strokeColor} strokeWidth={4} strokeLinecap="round" />
          <circle cx={-width / 2} cy={0} r={5} fill={strokeColor} />
          <circle cx={width / 2} cy={0} r={5} fill={strokeColor} />
          <rect x={-15} y={-8} width={30} height={16} rx={2} fill={fillColor} stroke={strokeColor} strokeWidth={1.5} />
        </g>
      )
    case 'tripod':
      return (
        <g>
          <circle cx={0} cy={0} r={10} fill={strokeColor} />
          <line x1={0} y1={0} x2={-width / 2} y2={-height / 2} stroke={strokeColor} strokeWidth={2.5} />
          <line x1={0} y1={0} x2={width / 2} y2={-height / 2} stroke={strokeColor} strokeWidth={2.5} />
          <line x1={0} y1={0} x2={0} y2={height / 2} stroke={strokeColor} strokeWidth={2.5} />
        </g>
      )
    default:
      return (
        <g>
          <rect
            x={-width / 2}
            y={-height / 2}
            width={width}
            height={height}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={2}
            rx={4}
          />
          <line x1={-width / 2} y1={-height / 2} x2={width / 2} y2={height / 2} stroke={strokeColor} strokeWidth={0.5} opacity={0.5} />
          <line x1={width / 2} y1={-height / 2} x2={-width / 2} y2={height / 2} stroke={strokeColor} strokeWidth={0.5} opacity={0.5} />
        </g>
      )
  }
}

/**
 * The element's glyph in its LOCAL frame (the parent applies
 * translate/rotate). Light beams are NOT drawn here — they live in the
 * world-space LightingLayer so occluders can clip them.
 */
export function ElementGlyph({ el, selected }: { el: PhotoElement; selected: boolean }) {
  const glyphStroke = selected ? 'var(--accent)' : el.color

  if (el.type === 'camera') {
    const cam = el as PhotoCameraElement
    return (
      <>
        {/* FOV wedge + focus line (framing intent, not light — unclipped) */}
        <g style={{ pointerEvents: 'none' }}>
          <path
            d={(() => {
              const r = cam.targetDistance
              const halfFov = ((cam.fov * Math.PI) / 180) / 2
              const x1 = r * Math.sin(-halfFov)
              const y1 = -r * Math.cos(halfFov)
              const x2 = r * Math.sin(halfFov)
              const y2 = -r * Math.cos(halfFov)
              return `M 0 0 L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`
            })()}
            fill="rgba(16, 185, 129, 0.12)"
            stroke="#10b981"
            strokeOpacity={0.3}
            strokeWidth={1}
          />
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={-cam.targetDistance}
            stroke="#10b981"
            strokeOpacity={0.6}
            strokeWidth={1}
            strokeDasharray="5,5"
          />
          <circle cx={0} cy={-cam.targetDistance} r={4} fill="#10b981" />
        </g>
        <g opacity={el.opacity}>
          <rect x={-8} y={-35} width={16} height={15} rx={2} style={{ fill: 'var(--panel)' }} stroke={glyphStroke} strokeWidth={2} />
          <rect x={-18} y={-22} width={36} height={24} rx={4} style={{ fill: 'var(--panel)' }} stroke={glyphStroke} strokeWidth={3} />
          <circle cx={-10} cy={-22} r={3} fill="#10b981" />
          <circle cx={10} cy={-12} r={2} fill="#22c55e" />
          <text
            x={0}
            y={-4}
            style={{ fill: 'var(--ink)' }}
            fontSize={10}
            fontWeight="bold"
            textAnchor="middle"
            fontFamily="monospace"
          >
            {cam.cameraNumber || 'A'}
          </text>
        </g>
      </>
    )
  }

  if (el.type === 'light') {
    const light = el as PhotoLightElement
    const col = kelvinToColor(light.colorTemperature)
    const bulbStroke = selected ? 'var(--accent)' : '#fbbf24'
    return (
      <g opacity={el.opacity}>
        {light.lightType === 'softbox' || light.lightType === 'stripbox' ? (
          <g>
            <line x1={0} y1={0} x2={0} y2={20} style={{ stroke: 'var(--muted)' }} strokeWidth={2} />
            <rect x={-30} y={-10} width={60} height={20} rx={3} style={{ fill: 'var(--panel)' }} stroke={selected ? 'var(--accent)' : col} strokeWidth={2.5} />
            <ellipse cx={0} cy={0} rx={15} ry={4} fill={col} opacity={0.6} />
          </g>
        ) : light.lightType === 'tube_light' ? (
          <line
            x1={-40}
            y1={0}
            x2={40}
            y2={0}
            stroke={selected ? 'var(--accent)' : col}
            strokeWidth={8}
            strokeLinecap="round"
          />
        ) : (
          <g>
            <path d="M -18 -8 A 18 18 0 0 0 18 -8" fill="none" style={{ stroke: 'var(--muted)' }} strokeWidth={2} />
            <rect x={-12} y={-18} width={24} height={22} rx={2} style={{ fill: 'var(--panel)' }} stroke={bulbStroke} strokeWidth={2} />
            <line x1={-12} y1={-18} x2={-22} y2={-28} style={{ stroke: 'var(--muted)' }} strokeWidth={2.5} />
            <line x1={12} y1={-18} x2={22} y2={-28} style={{ stroke: 'var(--muted)' }} strokeWidth={2.5} />
          </g>
        )}
      </g>
    )
  }

  if (el.type === 'person') {
    const pers = el as PhotoPersonElement
    return (
      <g opacity={el.opacity}>
        <path
          d="M -24 5 C -24 -15, 24 -15, 24 5 Z"
          style={{ fill: 'var(--panel)' }}
          stroke={glyphStroke}
          strokeWidth={2.5}
        />
        <circle
          cx={0}
          cy={-4}
          r={11}
          style={{ fill: 'var(--panel)' }}
          stroke={glyphStroke}
          strokeWidth={2.5}
        />
        <polygon
          points="-3,-15 0,-25 3,-15"
          fill={el.color}
          transform={`rotate(${pers.lookAngle - 90}, 0, -4)`}
        />
      </g>
    )
  }

  if (isPropLike(el)) return <PropShape el={el} selected={selected} />
  return null
}

/**
 * World-space dynamic lighting: each visible light's beam is clipped
 * against the scene's occluders (walls, backdrops, furniture, people…)
 * and the lit stretch of a surface gets a reflected-light glow.
 * Render this INSIDE the world transform group, beneath the glyphs.
 */
export function LightingLayer({ elements }: { elements: PhotoElement[] }) {
  const lit = useMemo(() => {
    const visible = elements.filter((el) => !el.hidden)
    const occluders = collectOccluders(visible)
    return visible
      .filter((el): el is PhotoLightElement => el.type === 'light')
      .map((light) => ({
        light,
        col: kelvinToColor(light.colorTemperature),
        area: computeLightArea(light, occluders),
      }))
  }, [elements])

  return (
    <g style={{ pointerEvents: 'none' }}>
      {lit.map(({ light, col, area }) => (
        <g key={light.id} opacity={light.opacity}>
          <path
            d={area.path}
            fill={col}
            fillOpacity={0.06 + 0.1 * (light.intensity / 100)}
            stroke={col}
            strokeOpacity={0.35}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          {area.bounces.map((b, i) => (
            <g key={i}>
              {/* wide soft halo + narrow hot core = reflected light */}
              <line
                x1={b.x1}
                y1={b.y1}
                x2={b.x2}
                y2={b.y2}
                stroke={col}
                strokeWidth={7}
                strokeOpacity={(0.1 + 0.3 * b.strength) * (light.intensity / 100)}
                strokeLinecap="round"
              />
              <line
                x1={b.x1}
                y1={b.y1}
                x2={b.x2}
                y2={b.y2}
                stroke={col}
                strokeWidth={2.5}
                strokeOpacity={(0.35 + 0.5 * b.strength) * (light.intensity / 100)}
                strokeLinecap="round"
              />
            </g>
          ))}
        </g>
      ))}
    </g>
  )
}

/**
 * Read-only fit-to-bounds rendering of one shot — the board card preview.
 * No labels, no interaction; lighting and glyphs match the canvas.
 */
export function PhotoScenePreview({
  shots,
  shotId,
  className,
}: {
  shots: PhotoShot[]
  shotId?: string | null
  className?: string
}) {
  const shot = shots.find((s) => s.id === shotId) ?? shots[0]
  const elements = useMemo(
    () => (shot?.elements ?? []).filter((el) => !el.hidden),
    [shot],
  )

  const viewBox = useMemo(() => {
    if (!elements.length) return '-300 -300 600 600'
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const el of elements) {
      let e = Math.max(el.width || 0, el.height || 0) / 2 + 45
      if (el.type === 'light') e = Math.max(e, (el as PhotoLightElement).falloff || 300)
      if (el.type === 'camera')
        e = Math.max(e, (el as PhotoCameraElement).targetDistance || 250)
      minX = Math.min(minX, el.x - e)
      minY = Math.min(minY, el.y - e)
      maxX = Math.max(maxX, el.x + e)
      maxY = Math.max(maxY, el.y + e)
    }
    const pad = 30
    return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`
  }, [elements])

  return (
    <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" className={className}>
      <LightingLayer elements={elements} />
      {elements
        .slice()
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((el) => (
          <g key={el.id} transform={`translate(${el.x}, ${el.y}) rotate(${el.rotation})`}>
            <ElementGlyph el={el} selected={false} />
          </g>
        ))}
    </svg>
  )
}
