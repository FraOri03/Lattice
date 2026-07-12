import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { CARD_COLORS, type BoardNode } from '@/types/model'
import { useStore } from '@/store/useStore'
import { formatBytes, hostnameOf, toVideoEmbed } from '@/lib/media'
import { MarkdownView } from '@/components/MarkdownView'
import { useInViewport } from '@/lib/perf/useInViewport'
import { useViewerSlot } from '@/lib/perf/useViewerSlot'
import { CardChrome } from './CardChrome'
import { ThreePlaceholder } from './ThreePlaceholder'
import {
  IcCube,
  IcExternal,
  IcFile,
  IcImage,
  IcLink,
  IcNote,
  IcVideo,
} from '@/components/Icons'

// three.js is loaded ONLY through this lazy boundary (PERF-1): the scene and
// its three.js imports live in ThreeScene.tsx, so nothing here drags three
// into the main bundle.
const ThreeScene = lazy(() => import('./ThreeScene'))

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
  // Windowing for expensive media (PERF-2): don't load an off-screen player
  // at board load; once first seen it stays mounted (no reload churn), and a
  // native <video> pauses whenever it leaves the viewport.
  const { ref, onScreen } = useInViewport<HTMLDivElement>()
  const [everOnScreen, setEverOnScreen] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (onScreen) setEverOnScreen(true)
    else videoRef.current?.pause()
  }, [onScreen])
  return (
    <CardChrome
      data={data}
      selected={selected}
      icon={<IcVideo size={13} />}
      title={data.title || 'Video'}
      minWidth={220}
      minHeight={140}
    >
      <div ref={ref} className="h-full w-full">
        {embed?.kind === 'iframe' ? (
          everOnScreen ? (
            <iframe
              src={embed.src}
              className="nodrag h-full w-full"
              title={data.title || 'video'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="placeholder">
              <IcVideo size={22} />
              Scroll into view to load
            </div>
          )
        ) : embed?.kind === 'video' ? (
          <video
            ref={videoRef}
            src={embed.src}
            controls
            className="nodrag h-full w-full bg-black"
          />
        ) : (
          <div className="placeholder">
            <IcVideo size={22} />
            Paste a YouTube / Vimeo / .mp4 URL in the inspector
          </div>
        )}
      </div>
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

export function ThreeDCardNode({ id, data, selected }: Props) {
  // three.js loads + animates only while the card is on-screen and within the
  // live-viewer budget; otherwise a stable placeholder holds the card size.
  const { ref, onScreen, active } = useInViewport<HTMLDivElement>()
  const hasSlot = useViewerSlot(id, onScreen)
  const mountScene = onScreen && hasSlot
  return (
    <CardChrome
      data={data}
      selected={selected}
      icon={<IcCube size={13} />}
      title={data.title || '3D embed'}
      minWidth={200}
      minHeight={160}
    >
      <div ref={ref} className="relative h-full w-full">
        {mountScene ? (
          <Suspense fallback={<ThreePlaceholder label="Loading 3D…" />}>
            <ThreeScene color={CARD_COLORS[data.color] ?? CARD_COLORS.orange} active={active} />
          </Suspense>
        ) : (
          <ThreePlaceholder
            label="3D preview"
            hint={onScreen ? 'Paused — too many 3D views active' : 'Scroll into view to load'}
          />
        )}
        <span className="pointer-events-none absolute right-2 bottom-1.5 text-[10px] text-muted">
          drag to orbit · three.js
        </span>
      </div>
    </CardChrome>
  )
}
