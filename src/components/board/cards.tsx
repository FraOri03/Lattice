import { useEffect, useRef } from 'react'
import type { NodeProps } from '@xyflow/react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CARD_COLORS, type BoardNode } from '@/types/model'
import { useStore } from '@/store/useStore'
import { formatBytes, hostnameOf, toVideoEmbed } from '@/lib/media'
import { MarkdownView } from '@/components/MarkdownView'
import { CardChrome } from './CardChrome'
import {
  IcCube,
  IcExternal,
  IcFile,
  IcImage,
  IcLink,
  IcNote,
  IcVideo,
} from '@/components/Icons'

type Props = NodeProps<BoardNode>

/* ---------------- note ---------------- */

export function NoteCardNode({ data, selected }: Props) {
  const note = useStore((s) => (data.noteId ? s.notes[data.noteId] : undefined))
  const openNote = useStore((s) => s.openNote)

  return (
    <CardChrome
      data={data}
      selected={selected}
      icon={<IcNote size={13} />}
      title={note?.title ?? 'Missing note'}
      minWidth={200}
      minHeight={120}
    >
      {note ? (
        <div
          className="nowheel h-full overflow-y-auto px-3 py-2"
          onDoubleClick={() => openNote(note.id)}
          title="Double-click to open in editor"
        >
          {note.content.trim() ? (
            <MarkdownView content={note.content} className="text-[12.5px]" />
          ) : (
            <div className="placeholder">Empty note — double-click to write</div>
          )}
        </div>
      ) : (
        <div className="placeholder">This note was deleted</div>
      )}
    </CardChrome>
  )
}

/* ---------------- image ---------------- */

export function ImageCardNode({ data, selected }: Props) {
  return (
    <CardChrome
      data={data}
      selected={selected}
      icon={<IcImage size={13} />}
      title={data.title || 'Image'}
      minWidth={140}
      minHeight={100}
    >
      {data.src ? (
        <div className="flex h-full flex-col">
          <img
            src={data.src}
            alt={data.caption || data.title || 'image'}
            className="min-h-0 w-full flex-1 object-cover"
            draggable={false}
          />
          {data.caption && (
            <div className="border-t border-bord px-3 py-1.5 text-[11px] text-muted">
              {data.caption}
            </div>
          )}
        </div>
      ) : (
        <div className="placeholder">
          <IcImage size={22} />
          No image yet — set a URL in the inspector, or drop a file on the canvas
        </div>
      )}
    </CardChrome>
  )
}

/* ---------------- video ---------------- */

export function VideoCardNode({ data, selected }: Props) {
  const embed = toVideoEmbed(data.url || data.src)
  return (
    <CardChrome
      data={data}
      selected={selected}
      icon={<IcVideo size={13} />}
      title={data.title || 'Video'}
      minWidth={220}
      minHeight={140}
    >
      {embed?.kind === 'iframe' ? (
        <iframe
          src={embed.src}
          className="nodrag h-full w-full"
          title={data.title || 'video'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : embed?.kind === 'video' ? (
        <video src={embed.src} controls className="nodrag h-full w-full bg-black" />
      ) : (
        <div className="placeholder">
          <IcVideo size={22} />
          Paste a YouTube / Vimeo / .mp4 URL in the inspector
        </div>
      )}
    </CardChrome>
  )
}

/* ---------------- link ---------------- */

export function LinkCardNode({ data, selected }: Props) {
  return (
    <CardChrome
      data={data}
      selected={selected}
      icon={<IcLink size={13} />}
      title={data.title || 'Link'}
      minWidth={200}
      minHeight={72}
    >
      {data.url ? (
        <a
          href={data.url}
          target="_blank"
          rel="noreferrer"
          className="nodrag flex h-full items-center gap-3 px-3 py-2 hover:bg-panel2"
        >
          <span
            className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-white"
            style={{ background: CARD_COLORS[data.color] ?? CARD_COLORS.gray }}
          >
            <IcExternal size={14} />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">
              {data.title || hostnameOf(data.url)}
            </span>
            <span className="block truncate text-[11px] text-muted">
              {hostnameOf(data.url)}
            </span>
          </span>
        </a>
      ) : (
        <div className="placeholder">Paste a URL in the inspector</div>
      )}
    </CardChrome>
  )
}

/* ---------------- file ---------------- */

export function FileCardNode({ data, selected }: Props) {
  const isPdf = data.mime === 'application/pdf' && !!data.src
  return (
    <CardChrome
      data={data}
      selected={selected}
      icon={<IcFile size={13} />}
      title={data.fileName || data.title || 'File'}
      minWidth={180}
      minHeight={100}
    >
      {isPdf ? (
        <iframe
          src={data.src}
          className="nodrag nowheel h-full w-full"
          title={data.fileName || 'pdf'}
        />
      ) : (
        <div className="placeholder">
          <IcFile size={26} />
          <span className="max-w-full truncate font-medium text-ink">
            {data.fileName || 'No file'}
          </span>
          <span className="text-[11px]">
            {data.mime || 'unknown type'}
            {data.size ? ` · ${formatBytes(data.size)}` : ''}
          </span>
        </div>
      )}
    </CardChrome>
  )
}

/* ---------------- 3D embed ---------------- */

function ThreeScene({ color }: { color: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null)

  useEffect(() => {
    const host = hostRef.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.set(0, 1.4, 4.2)

    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const key = new THREE.DirectionalLight(0xffffff, 1.8)
    key.position.set(3, 4, 5)
    scene.add(key)

    const geo = new THREE.TorusKnotGeometry(0.9, 0.3, 140, 20)
    const mat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.35,
      roughness: 0.25,
    })
    matRef.current = mat
    scene.add(new THREE.Mesh(geo, mat))

    const grid = new THREE.GridHelper(10, 20, 0x555555, 0x3a3a3a)
    grid.position.y = -1.5
    scene.add(grid)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.autoRotate = true
    controls.autoRotateSpeed = 1.5

    let raf = 0
    const loop = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth
      const h = host.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    ro.observe(host)
    loop()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      geo.dispose()
      mat.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      matRef.current = null
    }
  }, [])

  useEffect(() => {
    matRef.current?.color.set(color)
  }, [color])

  return (
    <div
      ref={hostRef}
      className="nodrag nowheel h-full w-full overflow-hidden [&>canvas]:block"
    />
  )
}

export function ThreeDCardNode({ data, selected }: Props) {
  return (
    <CardChrome
      data={data}
      selected={selected}
      icon={<IcCube size={13} />}
      title={data.title || '3D embed'}
      minWidth={200}
      minHeight={160}
    >
      <ThreeScene color={CARD_COLORS[data.color] ?? CARD_COLORS.orange} />
      <span className="pointer-events-none absolute right-2 bottom-1.5 text-[10px] text-muted">
        drag to orbit · three.js
      </span>
    </CardChrome>
  )
}
