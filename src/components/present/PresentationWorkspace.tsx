import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import type { PresentationDocMeta } from '@/types/model'
import { downloadBlob, slugify } from '@/lib/download'
import { presenceService } from '@/lib/collab/PresenceService'
import { nid } from '@/lib/id'
import {
  THEME_COLORS,
  createSlide,
  createTextElement,
  type PresentElement,
  type PresentSlide,
  type PresentTheme,
  type ShapeElement,
} from '@/lib/present/presentModel'
import { clampPosition, normalizedZ, rectOf } from '@/lib/present/geometry'
import { alignElements, distributeElements, type AlignEdge, type DistributeAxis } from '@/lib/present/align'
import { toast } from '@/components/ui/Toaster'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { ToolbarDivider } from '@/components/ui/ToolbarDivider'
import { ActionIcon } from '@/components/ActionIcons'
import {
  IcAlignBottom,
  IcAlignCenter,
  IcAlignLeft,
  IcAlignMiddle,
  IcAlignRight,
  IcAlignTop,
  IcCircle,
  IcCopy,
  IcDistributeH,
  IcDistributeV,
  IcEye,
  IcImage,
  IcLine,
  IcLock,
  IcMagnet,
  IcPlus,
  IcRedo,
  IcSquare,
  IcTrash,
  IcUndo,
  IcUnlock,
  IcX,
  IcZoomIn,
  IcZoomOut,
} from '@/components/Icons'
import { SlideView } from './SlideView'
import { SlideCanvas } from './SlideCanvas'
import { useDeckHistory } from './useDeckHistory'

/**
 * PresentationWorkspace (Phase 1) — the precise, non-destructive slide editor.
 * Undo/redo (history hook), multi-select + marquee, snapping + smart guides,
 * alignment/distribution, keyboard nudge, constrained resize, rotation, zoom,
 * layer ops and a contextual inspector. Deck state lives in `useDeckHistory`;
 * the canvas interaction is `SlideCanvas`; the geometry is pure + tested.
 */

const MIN_ZOOM = 0.1
const MAX_ZOOM = 4
const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))

type LayerMode = 'front' | 'back' | 'forward' | 'backward'

/** Recompute z after a layer op so order stays contiguous (audit DM-8). */
function reorderZ(elements: PresentElement[], ids: Set<string>, mode: LayerMode): PresentElement[] {
  const maxZ = elements.reduce((m, e) => Math.max(m, e.z), 0)
  const bumped = elements.map((e) => {
    if (!ids.has(e.id)) return e
    let z = e.z
    if (mode === 'front') z = maxZ + 1
    else if (mode === 'back') z = -1
    else if (mode === 'forward') z = e.z + 1.5
    else z = e.z - 1.5
    return { ...e, z }
  })
  const zmap = normalizedZ(bumped)
  return bumped.map((e) => ({ ...e, z: zmap.get(e.id) ?? e.z }))
}

export default function PresentationWorkspace({ meta }: { meta: PresentationDocMeta }) {
  const updatePresentMeta = useStore((s) => s.updatePresentMeta)
  const closePresent = useStore((s) => s.closePresent)
  const { body, apply, undo, redo, seal, flush, canUndo, canRedo, readOnly } = useDeckHistory(meta)

  const [slideIndex, setSlideIndex] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [zoom, setZoom] = useState<number | 'fit'>('fit')
  const [fitScale, setFitScale] = useState(0.6)
  const [snapEnabled, setSnapEnabled] = useState(true)

  const scrollRef = useRef<HTMLDivElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const replaceTarget = useRef<string | null>(null)
  const clipboard = useRef<PresentElement[]>([])
  const nudgeTimer = useRef<number | undefined>(undefined)
  const fitScaleRef = useRef(fitScale)
  fitScaleRef.current = fitScale

  // presence: which deck is open
  useEffect(() => {
    presenceService.setEditing({ kind: 'doc', id: meta.id, title: meta.title })
    return () => presenceService.setEditing(undefined)
  }, [meta.id, meta.title])

  // reset transient view state when switching decks
  useEffect(() => {
    setSlideIndex(0)
    setSelectedIds(new Set())
    setEditingTextId(null)
  }, [meta.id])

  // fit-to-viewport scale
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const compute = () => {
      const pad = 56
      setFitScale(
        Math.max(0.1, Math.min((el.clientWidth - pad) / 960, (el.clientHeight - pad) / 540, 1.5)),
      )
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Ctrl/Cmd + wheel zoom (native listener so we can preventDefault)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom((z) => clampZoom((z === 'fit' ? fitScaleRef.current : z) * (e.deltaY < 0 ? 1.1 : 0.9)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const scale = zoom === 'fit' ? fitScale : zoom
  const si = body ? Math.min(slideIndex, body.slides.length - 1) : 0
  const slide: PresentSlide | null = body ? body.slides[si] : null
  const theme: PresentTheme = body?.theme ?? 'plain'
  const themeColors = THEME_COLORS[theme]

  const elements = slide?.elements ?? []
  const maxZ = elements.reduce((m, e) => Math.max(m, e.z), 0)
  const selectedEls = useMemo(
    () => elements.filter((e) => selectedIds.has(e.id)),
    [elements, selectedIds],
  )
  const selected = selectedEls.length === 1 ? selectedEls[0] : null

  /* ---------- mutation helpers (all through history) ---------- */

  const setSlideElements = (next: PresentElement[], opts?: { coalesceKey?: string }) =>
    apply((b) => ({ ...b, slides: b.slides.map((s, i) => (i === si ? { ...s, elements: next } : s)) }), opts)

  const patchSlide = (fn: (s: PresentSlide) => PresentSlide, opts?: { coalesceKey?: string }) =>
    apply((b) => ({ ...b, slides: b.slides.map((s, i) => (i === si ? fn(s) : s)) }), opts)

  const patchElement = (
    id: string,
    fn: (e: PresentElement) => PresentElement,
    opts?: { coalesceKey?: string },
  ) => setSlideElements(elements.map((e) => (e.id === id ? fn(e) : e)), opts)

  const patchOne = (fn: (e: PresentElement) => PresentElement, opts?: { coalesceKey?: string }) => {
    if (selected) patchElement(selected.id, fn, opts)
  }
  const patchSelected = (fn: (e: PresentElement) => PresentElement, opts?: { coalesceKey?: string }) =>
    setSlideElements(elements.map((e) => (selectedIds.has(e.id) ? fn(e) : e)), opts)

  const addElement = (el: PresentElement) => {
    setSlideElements([...elements, el])
    setSelectedIds(new Set([el.id]))
    setEditingTextId(null)
  }

  const addText = () => addElement(createTextElement({ z: maxZ + 1 }))

  const addShape = (shape: ShapeElement['shape']) =>
    addElement({
      id: nid('el'),
      kind: 'shape',
      shape,
      x: 320,
      y: 180,
      w: shape === 'line' ? 320 : 280,
      h: shape === 'line' ? 4 : 160,
      z: maxZ + 1,
      fill: shape === 'line' ? null : themeColors.accent + '55',
      stroke: themeColors.accent,
      strokeWidth: 2,
    })

  const onPickImage = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    if (file.size > 4 * 1024 * 1024) {
      toast.warning('Image too large', 'Slide images are limited to 4 MB.')
      return
    }
    const src = await new Promise<string>((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.readAsDataURL(file)
    })
    const target = replaceTarget.current
    replaceTarget.current = null
    if (target) {
      patchElement(target, (e) => (e.kind === 'image' ? { ...e, src } : e))
      return
    }
    addElement({ id: nid('el'), kind: 'image', src, x: 280, y: 130, w: 400, h: 280, z: maxZ + 1 })
  }

  /* ---------- selection-level operations ---------- */

  const goToSlide = (i: number) => {
    setSlideIndex(i)
    setSelectedIds(new Set())
    setEditingTextId(null)
    seal()
  }

  const selectAll = () =>
    setSelectedIds(new Set(elements.filter((e) => !e.hidden && !e.locked).map((e) => e.id)))

  const deleteSelection = () => {
    if (!selectedIds.size) return
    setSlideElements(elements.filter((e) => !selectedIds.has(e.id)))
    setSelectedIds(new Set())
  }

  const cloneEls = (src: PresentElement[], offset: number): PresentElement[] =>
    src.map((e, i) => ({
      ...(JSON.parse(JSON.stringify(e)) as PresentElement),
      id: nid('el'),
      x: e.x + offset,
      y: e.y + offset,
      z: maxZ + 1 + i,
    }))

  const duplicateSelection = () => {
    if (!selectedEls.length) return
    const copies = cloneEls(selectedEls, 16)
    setSlideElements([...elements, ...copies])
    setSelectedIds(new Set(copies.map((c) => c.id)))
  }

  const copySelection = () => {
    if (!selectedEls.length) return
    clipboard.current = selectedEls.map((e) => JSON.parse(JSON.stringify(e)) as PresentElement)
    toast.info(`Copied ${selectedEls.length} element${selectedEls.length === 1 ? '' : 's'}`)
  }

  const pasteClipboard = () => {
    if (!clipboard.current.length) return
    const copies = cloneEls(clipboard.current, 24)
    setSlideElements([...elements, ...copies])
    setSelectedIds(new Set(copies.map((c) => c.id)))
  }

  const nudge = (dx: number, dy: number) => {
    patchSelected(
      (e) => {
        const p = clampPosition(e.x + dx, e.y + dy, e.w, e.h)
        return { ...e, x: p.x, y: p.y }
      },
      { coalesceKey: 'nudge' },
    )
    window.clearTimeout(nudgeTimer.current)
    nudgeTimer.current = window.setTimeout(() => seal(), 500)
  }

  const layer = (mode: LayerMode) => {
    if (!selectedIds.size) return
    setSlideElements(reorderZ(elements, selectedIds, mode))
  }

  const align = (edge: AlignEdge) => {
    if (selectedEls.length < 2) return
    const map = alignElements(selectedEls.map((e) => ({ id: e.id, ...rectOf(e) })), edge)
    setSlideElements(elements.map((e) => (map.has(e.id) ? { ...e, ...map.get(e.id)! } : e)))
  }

  const distribute = (axis: DistributeAxis) => {
    if (selectedEls.length < 3) return
    const map = distributeElements(selectedEls.map((e) => ({ id: e.id, ...rectOf(e) })), axis)
    setSlideElements(elements.map((e) => (map.has(e.id) ? { ...e, ...map.get(e.id)! } : e)))
  }

  const toggleFlag = (flag: 'locked' | 'hidden') => {
    if (!selectedEls.length) return
    const anyOff = selectedEls.some((e) => !e[flag])
    patchSelected((e) => ({ ...e, [flag]: anyOff }))
    if (flag === 'locked' && anyOff) setSelectedIds(new Set())
  }

  /* ---------- slide-list operations ---------- */

  const addSlide = () => {
    apply((b) => {
      const slides = [...b.slides]
      slides.splice(si + 1, 0, createSlide())
      return { ...b, slides }
    })
    goToSlide(si + 1)
  }

  const duplicateSlide = (i: number) =>
    apply((b) => {
      const copy: PresentSlide = JSON.parse(JSON.stringify(b.slides[i]))
      copy.id = nid('slide')
      copy.elements = copy.elements.map((e) => ({ ...e, id: nid('el') }))
      const slides = [...b.slides]
      slides.splice(i + 1, 0, copy)
      return { ...b, slides }
    })

  const moveSlide = (i: number, dir: -1 | 1) => {
    const j = i + dir
    apply((b) => {
      const slides = [...b.slides]
      ;[slides[i], slides[j]] = [slides[j], slides[i]]
      return { ...b, slides }
    })
    goToSlide(j)
  }

  const deleteSlide = async (i: number) => {
    if (!body || body.slides.length <= 1) {
      toast.warning('A deck needs at least one slide')
      return
    }
    if (!(await confirmDialog({ title: `Delete slide ${i + 1}?`, confirmLabel: 'Delete slide', danger: true })))
      return
    apply((b) => ({ ...b, slides: b.slides.filter((_, j) => j !== i) }))
    goToSlide(Math.max(0, i > 0 ? i - 1 : 0))
  }

  /* ---------- export ---------- */

  const exportPdf = async () => {
    if (!body) return
    flush()
    const { exportPresentationPdf } = await import('@/lib/present/presentPdf')
    downloadBlob(`${slugify(meta.title)}.pdf`, await exportPresentationPdf(meta.title, body))
  }
  const exportPptx = async () => {
    if (!body) return
    flush()
    const { exportPresentationPptx } = await import('@/lib/present/presentPptx')
    downloadBlob(`${slugify(meta.title)}.pptx`, await exportPresentationPptx(body))
    toast.info('PPTX exported (basic fidelity)', 'Text, shapes and images are covered; themes/animations are not.')
  }

  /* ---------- keyboard (stable listener → latest handler) ---------- */

  const kb = useRef<(e: KeyboardEvent) => void>(() => {})
  kb.current = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null
    const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    if (typing) return
    const mod = e.ctrlKey || e.metaKey

    if (mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault()
      e.shiftKey ? redo() : undo()
      return
    }
    if (mod && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault()
      redo()
      return
    }
    if (e.key === 'Escape') {
      setEditingTextId(null)
      setSelectedIds(new Set())
      return
    }
    if (mod && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault()
      selectAll()
      return
    }
    if (readOnly) return
    if (mod && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault()
      duplicateSelection()
      return
    }
    if (mod && (e.key === 'c' || e.key === 'C')) {
      copySelection()
      return
    }
    if (mod && (e.key === 'v' || e.key === 'V')) {
      pasteClipboard()
      return
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size) {
      e.preventDefault()
      deleteSelection()
      return
    }
    if (e.key === ']') {
      e.preventDefault()
      layer(mod ? 'front' : 'forward')
      return
    }
    if (e.key === '[') {
      e.preventDefault()
      layer(mod ? 'back' : 'backward')
      return
    }
    if (selectedIds.size && e.key.startsWith('Arrow')) {
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
      if (dx || dy) nudge(dx, dy)
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => kb.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!body || !slide) {
    return (
      <section className="flex h-full min-w-0 flex-1 items-center justify-center bg-panel text-xs text-muted">
        Loading presentation…
      </section>
    )
  }

  const zoomPct = Math.round(scale * 100)
  const multi = selectedEls.length >= 2

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-panel">
      {/* ---------- top app bar ---------- */}
      <div className="flex flex-none items-center gap-1.5 border-b border-bord px-3 py-1.5">
        <input
          className="min-w-0 flex-1 bg-transparent text-[14px] font-bold outline-none"
          value={meta.title}
          readOnly={readOnly}
          onChange={(e) => updatePresentMeta(meta.id, { title: e.target.value })}
          aria-label="Presentation title"
        />

        {!readOnly && (
          <>
            <button
              className="icon-btn"
              title="Undo (Ctrl/Cmd+Z)"
              aria-label="Undo"
              disabled={!canUndo}
              onClick={undo}
            >
              <IcUndo size={14} />
            </button>
            <button
              className="icon-btn"
              title="Redo (Ctrl/Cmd+Shift+Z)"
              aria-label="Redo"
              disabled={!canRedo}
              onClick={redo}
            >
              <IcRedo size={14} />
            </button>
            <ToolbarDivider />
          </>
        )}

        <button className="icon-btn" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom(clampZoom(scale / 1.2))}>
          <IcZoomOut size={14} />
        </button>
        <button
          className="min-w-[3.2rem] rounded-md px-1 text-center text-[11.5px] text-muted hover:text-ink"
          title="Fit to viewport"
          onClick={() => setZoom('fit')}
        >
          {zoomPct}%
        </button>
        <button className="icon-btn" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom(clampZoom(scale * 1.2))}>
          <IcZoomIn size={14} />
        </button>
        <button className="btn !px-2 !py-1 text-[11px]" title="Actual size (100%)" onClick={() => setZoom(1)}>
          100%
        </button>

        <ToolbarDivider />
        <label className="flex items-center gap-1 text-[11px] text-muted">
          Theme
          <select
            className="field h-6 w-24 cursor-pointer px-1 py-0 text-[11.5px]"
            value={body.theme}
            disabled={readOnly}
            onChange={(e) => apply((b) => ({ ...b, theme: e.target.value as PresentTheme }))}
          >
            <option value="plain">Plain</option>
            <option value="ink">Ink</option>
            <option value="accent">Deep blue</option>
          </select>
        </label>
        <ToolbarDivider />
        <button className="btn" title="Export as PDF" onClick={() => void exportPdf()}>
          <ActionIcon.Export size={12} /> PDF
        </button>
        <button className="btn" title="Export as PPTX — basic fidelity" onClick={() => void exportPptx()}>
          <ActionIcon.Export size={12} /> PPTX
        </button>
        <button className="icon-btn" title="Close presentation" aria-label="Close presentation" onClick={closePresent}>
          <IcX size={14} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ---------- slide navigator ---------- */}
        <aside className="flex w-44 flex-none flex-col border-r border-bord">
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {body.slides.map((s, i) => (
              <div
                key={s.id}
                className={`group relative mb-2 cursor-pointer overflow-hidden rounded-lg border ${
                  i === si ? 'border-accent' : 'border-bord hover:border-muted'
                }`}
                onClick={() => goToSlide(i)}
                role="button"
                aria-label={`Slide ${i + 1}`}
                aria-current={i === si}
              >
                <SlideView slide={s} theme={body.theme} width={156} />
                <span className="absolute top-1 left-1 rounded bg-panel/85 px-1 text-[9px] font-bold">
                  {i + 1}
                </span>
                {!readOnly && (
                  <span className="absolute right-1 bottom-1 hidden gap-0.5 group-hover:flex">
                    <button
                      className="icon-btn h-5 w-5 bg-panel/90"
                      title="Move slide up"
                      aria-label={`Move slide ${i + 1} up`}
                      disabled={i === 0}
                      onClick={(e) => {
                        e.stopPropagation()
                        moveSlide(i, -1)
                      }}
                    >
                      ↑
                    </button>
                    <button
                      className="icon-btn h-5 w-5 bg-panel/90"
                      title="Move slide down"
                      aria-label={`Move slide ${i + 1} down`}
                      disabled={i === body.slides.length - 1}
                      onClick={(e) => {
                        e.stopPropagation()
                        moveSlide(i, 1)
                      }}
                    >
                      ↓
                    </button>
                    <button
                      className="icon-btn h-5 w-5 bg-panel/90"
                      title="Duplicate slide"
                      aria-label={`Duplicate slide ${i + 1}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        duplicateSlide(i)
                      }}
                    >
                      <IcCopy size={10} />
                    </button>
                    <button
                      className="icon-btn h-5 w-5 bg-panel/90 text-[#f24822]"
                      title="Delete slide"
                      aria-label={`Delete slide ${i + 1}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        void deleteSlide(i)
                      }}
                    >
                      <IcTrash size={10} />
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
          {!readOnly && (
            <button className="btn m-2 flex-none" onClick={addSlide}>
              <IcPlus size={12} /> Add slide
            </button>
          )}
        </aside>

        {/* ---------- canvas column ---------- */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!readOnly && (
            <div className="doc-toolbar flex-none">
              <button className="tbtn px-2" title="Add text box" onClick={addText}>
                + Text
              </button>
              <button className="tbtn px-2" title="Add image" onClick={() => imageInput.current?.click()}>
                <IcImage size={12} /> Image
              </button>
              <ToolbarDivider />
              <button className="tbtn" title="Add rectangle" aria-label="Add rectangle" onClick={() => addShape('rect')}>
                <IcSquare size={13} />
              </button>
              <button className="tbtn" title="Add ellipse" aria-label="Add ellipse" onClick={() => addShape('ellipse')}>
                <IcCircle size={13} />
              </button>
              <button className="tbtn" title="Add line" aria-label="Add line" onClick={() => addShape('line')}>
                <IcLine size={13} />
              </button>
              <ToolbarDivider />
              <button
                className={`tbtn ${snapEnabled ? 'is-active' : ''}`}
                title="Snapping & smart guides"
                aria-pressed={snapEnabled}
                onClick={() => setSnapEnabled((v) => !v)}
              >
                <IcMagnet size={13} />
              </button>

              {multi && (
                <>
                  <ToolbarDivider />
                  <button className="tbtn" title="Align left" aria-label="Align left" onClick={() => align('left')}>
                    <IcAlignLeft size={13} />
                  </button>
                  <button className="tbtn" title="Align horizontal centers" aria-label="Align horizontal centers" onClick={() => align('hcenter')}>
                    <IcAlignCenter size={13} />
                  </button>
                  <button className="tbtn" title="Align right" aria-label="Align right" onClick={() => align('right')}>
                    <IcAlignRight size={13} />
                  </button>
                  <button className="tbtn" title="Align top" aria-label="Align top" onClick={() => align('top')}>
                    <IcAlignTop size={13} />
                  </button>
                  <button className="tbtn" title="Align vertical centers" aria-label="Align vertical centers" onClick={() => align('vcenter')}>
                    <IcAlignMiddle size={13} />
                  </button>
                  <button className="tbtn" title="Align bottom" aria-label="Align bottom" onClick={() => align('bottom')}>
                    <IcAlignBottom size={13} />
                  </button>
                  <button
                    className="tbtn"
                    title="Distribute horizontally"
                    aria-label="Distribute horizontally"
                    disabled={selectedEls.length < 3}
                    onClick={() => distribute('h')}
                  >
                    <IcDistributeH size={13} />
                  </button>
                  <button
                    className="tbtn"
                    title="Distribute vertically"
                    aria-label="Distribute vertically"
                    disabled={selectedEls.length < 3}
                    onClick={() => distribute('v')}
                  >
                    <IcDistributeV size={13} />
                  </button>
                </>
              )}

              <span className="ml-auto text-[10.5px] text-muted">
                {selectedEls.length > 0
                  ? `${selectedEls.length} selected · ←→ nudge · ⌫ delete`
                  : `Slide ${si + 1}/${body.slides.length} · drag to select · double-click text`}
              </span>
            </div>
          )}

          <div
            ref={scrollRef}
            className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-panel2 p-4"
          >
            <SlideCanvas
              slide={slide}
              theme={body.theme}
              readOnly={readOnly}
              scale={scale}
              snapEnabled={snapEnabled}
              selectedIds={selectedIds}
              editingTextId={editingTextId}
              onSelectChange={setSelectedIds}
              onEditText={setEditingTextId}
              setSlideElements={setSlideElements}
              onSeal={seal}
            />
          </div>

          <div className="flex-none border-t border-bord px-3 py-2">
            <label className="mb-1 block text-[9.5px] font-semibold tracking-widest text-muted uppercase">
              Speaker notes — slide {si + 1}
            </label>
            <textarea
              className="field h-14 w-full resize-none text-[12px]"
              placeholder="Notes only you see while presenting…"
              value={slide.notes}
              readOnly={readOnly}
              onChange={(e) => {
                const v = e.target.value
                patchSlide((s) => ({ ...s, notes: v }), { coalesceKey: `notes-${slide.id}` })
              }}
              onBlur={seal}
            />
          </div>
        </div>

        {/* ---------- contextual inspector ---------- */}
        {!readOnly && (
          <Inspector
            slide={slide}
            themeColors={themeColors}
            selectedEls={selectedEls}
            selected={selected}
            maxZ={maxZ}
            onPatchOne={patchOne}
            onPatchSlide={patchSlide}
            onSelectId={(id) => setSelectedIds(new Set([id]))}
            onDeleteSelection={deleteSelection}
            onLayer={layer}
            onToggleFlag={toggleFlag}
            onReplaceImage={(id) => {
              replaceTarget.current = id
              imageInput.current?.click()
            }}
            onSeal={seal}
          />
        )}
      </div>

      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(e) => {
          void onPickImage(e.target.files)
          e.target.value = ''
        }}
      />
    </section>
  )
}

/* ==================== contextual inspector ==================== */

function Inspector({
  slide,
  themeColors,
  selectedEls,
  selected,
  maxZ,
  onPatchOne,
  onPatchSlide,
  onSelectId,
  onDeleteSelection,
  onLayer,
  onToggleFlag,
  onReplaceImage,
  onSeal,
}: {
  slide: PresentSlide
  themeColors: { bg: string; text: string; accent: string }
  selectedEls: PresentElement[]
  selected: PresentElement | null
  maxZ: number
  onPatchOne: (fn: (e: PresentElement) => PresentElement, opts?: { coalesceKey?: string }) => void
  onPatchSlide: (fn: (s: PresentSlide) => PresentSlide, opts?: { coalesceKey?: string }) => void
  onSelectId: (id: string) => void
  onDeleteSelection: () => void
  onLayer: (mode: LayerMode) => void
  onToggleFlag: (flag: 'locked' | 'hidden') => void
  onReplaceImage: (id: string) => void
  onSeal: () => void
}) {
  const count = selectedEls.length
  const anyLocked = selectedEls.some((e) => e.locked)
  const anyHidden = selectedEls.some((e) => e.hidden)

  return (
    <aside className="w-56 flex-none overflow-y-auto border-l border-bord px-3 pb-4">
      {count === 0 && (
        <>
          <div className="insp-h">Slide</div>
          <label className="flex items-center gap-2 text-[11px] text-muted">
            Background
            <input
              type="color"
              className="h-5 w-8 cursor-pointer border-0 bg-transparent p-0"
              value={slide.background ?? themeColors.bg}
              aria-label="Slide background color"
              onChange={(e) => {
                const v = e.target.value
                onPatchSlide((s) => ({ ...s, background: v }), { coalesceKey: `bg-${slide.id}` })
              }}
              onBlur={onSeal}
            />
            {slide.background && (
              <button
                className="tbtn w-5 text-[9px]"
                title="Reset to theme background"
                onClick={() => onPatchSlide((s) => ({ ...s, background: null }))}
              >
                <IcX size={10} />
              </button>
            )}
          </label>

          <div className="insp-h">Layers</div>
          {slide.elements.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-muted">
              Empty slide. Add a text box, image or shape from the toolbar.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {[...slide.elements]
                .sort((a, b) => b.z - a.z)
                .map((el) => (
                  <div key={el.id} className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-panel2">
                    <button
                      className="min-w-0 flex-1 truncate text-left text-[11px] text-ink"
                      onClick={() => onSelectId(el.id)}
                      title="Select element"
                    >
                      {layerLabel(el)}
                    </button>
                    <button
                      className="icon-btn h-5 w-5"
                      title={el.hidden ? 'Show' : 'Hide'}
                      aria-label={el.hidden ? 'Show element' : 'Hide element'}
                      aria-pressed={!el.hidden}
                      onClick={() => onPatchElementDirect(onPatchSlide, el.id, (e) => ({ ...e, hidden: !e.hidden }))}
                    >
                      <IcEye size={12} style={{ opacity: el.hidden ? 0.4 : 1 }} />
                    </button>
                    <button
                      className="icon-btn h-5 w-5"
                      title={el.locked ? 'Unlock' : 'Lock'}
                      aria-label={el.locked ? 'Unlock element' : 'Lock element'}
                      aria-pressed={el.locked}
                      onClick={() => onPatchElementDirect(onPatchSlide, el.id, (e) => ({ ...e, locked: !e.locked }))}
                    >
                      {el.locked ? <IcLock size={12} /> : <IcUnlock size={12} style={{ opacity: 0.55 }} />}
                    </button>
                  </div>
                ))}
            </div>
          )}
        </>
      )}

      {count >= 2 && (
        <>
          <div className="insp-h">{count} elements</div>
          <p className="mb-2 text-[11px] leading-relaxed text-muted">
            Use the alignment tools in the toolbar. Move with drag or arrow keys.
          </p>
          <div className="flex gap-1">
            <button className="btn flex-1" title="Lock / unlock" onClick={() => onToggleFlag('locked')}>
              {anyLocked ? <IcUnlock size={12} /> : <IcLock size={12} />} {anyLocked ? 'Unlock' : 'Lock'}
            </button>
            <button className="btn flex-1" title="Hide / show" onClick={() => onToggleFlag('hidden')}>
              <IcEye size={12} /> {anyHidden ? 'Show' : 'Hide'}
            </button>
          </div>
          <LayerButtons onLayer={onLayer} />
          <div className="insp-h">Danger</div>
          <button className="btn w-full text-[#f24822]" onClick={onDeleteSelection}>
            <IcTrash size={12} /> Delete {count} elements
          </button>
        </>
      )}

      {count === 1 && selected && (
        <>
          <div className="insp-h">
            {selected.kind === 'text' ? 'Text' : selected.kind === 'image' ? 'Image' : 'Shape'}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(['x', 'y', 'w', 'h'] as const).map((k) => (
              <label key={k} className="text-[10px] text-muted uppercase">
                {k}
                <input
                  type="number"
                  className="field mt-0.5 !px-1.5 !py-0.5 text-[11.5px]"
                  value={Math.round(selected[k])}
                  aria-label={`Element ${k}`}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (!Number.isFinite(n)) return
                    onPatchOne(
                      (el) => ({ ...el, [k]: k === 'w' || k === 'h' ? Math.max(1, n) : n }),
                      { coalesceKey: `geo-${k}-${selected.id}` },
                    )
                  }}
                  onBlur={onSeal}
                />
              </label>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <label className="text-[10px] text-muted uppercase">
              Rotation°
              <input
                type="number"
                className="field mt-0.5 !px-1.5 !py-0.5 text-[11.5px]"
                value={Math.round(selected.rotation ?? 0)}
                aria-label="Rotation degrees"
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (!Number.isFinite(n)) return
                  onPatchOne((el) => ({ ...el, rotation: ((Math.round(n) % 360) + 360) % 360 }), {
                    coalesceKey: `rot-${selected.id}`,
                  })
                }}
                onBlur={onSeal}
              />
            </label>
            <label className="text-[10px] text-muted uppercase">
              Opacity %
              <input
                type="number"
                min={0}
                max={100}
                className="field mt-0.5 !px-1.5 !py-0.5 text-[11.5px]"
                value={Math.round((selected.opacity ?? 1) * 100)}
                aria-label="Opacity percent"
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (!Number.isFinite(n)) return
                  onPatchOne((el) => ({ ...el, opacity: Math.max(0, Math.min(1, n / 100)) }), {
                    coalesceKey: `op-${selected.id}`,
                  })
                }}
                onBlur={onSeal}
              />
            </label>
          </div>

          {selected.kind === 'text' && <TextControls selected={selected} onPatchOne={onPatchOne} onSeal={onSeal} />}
          {selected.kind === 'image' && (
            <ImageControls selected={selected} onPatchOne={onPatchOne} onReplace={() => onReplaceImage(selected.id)} />
          )}
          {selected.kind === 'shape' && <ShapeControls selected={selected} onPatchOne={onPatchOne} onSeal={onSeal} />}

          <div className="insp-h">Arrange</div>
          <div className="flex gap-1">
            <button className="btn flex-1" title="Lock / unlock" onClick={() => onToggleFlag('locked')}>
              {selected.locked ? <IcLock size={12} /> : <IcUnlock size={12} />}
            </button>
            <button className="btn flex-1" title="Hide / show" onClick={() => onToggleFlag('hidden')}>
              <IcEye size={12} style={{ opacity: selected.hidden ? 0.4 : 1 }} />
            </button>
          </div>
          <LayerButtons onLayer={onLayer} />
          <p className="mt-1 text-[10px] text-muted">z {selected.z} of {maxZ}</p>

          <div className="insp-h">Danger</div>
          <button className="btn w-full text-[#f24822]" onClick={onDeleteSelection}>
            <IcTrash size={12} /> Delete element
          </button>
        </>
      )}
    </aside>
  )
}

/** Patch one element via the slide-level patch (used by the layers list). */
function onPatchElementDirect(
  onPatchSlide: (fn: (s: PresentSlide) => PresentSlide) => void,
  id: string,
  fn: (e: PresentElement) => PresentElement,
) {
  onPatchSlide((s) => ({ ...s, elements: s.elements.map((e) => (e.id === id ? fn(e) : e)) }))
}

function layerLabel(el: PresentElement): string {
  if (el.kind === 'text') return el.text.trim().slice(0, 20) || 'Text'
  if (el.kind === 'image') return 'Image'
  return el.shape === 'rect' ? 'Rectangle' : el.shape === 'ellipse' ? 'Ellipse' : 'Line'
}

function LayerButtons({ onLayer }: { onLayer: (mode: LayerMode) => void }) {
  return (
    <div className="mt-1 grid grid-cols-2 gap-1">
      <button className="btn" title="Bring to front (Ctrl/Cmd+])" onClick={() => onLayer('front')}>
        ⤒ Front
      </button>
      <button className="btn" title="Send to back (Ctrl/Cmd+[)" onClick={() => onLayer('back')}>
        ⤓ Back
      </button>
      <button className="btn" title="Bring forward (])" onClick={() => onLayer('forward')}>
        ↑ Forward
      </button>
      <button className="btn" title="Send backward ([)" onClick={() => onLayer('backward')}>
        ↓ Backward
      </button>
    </div>
  )
}

function TextControls({
  selected,
  onPatchOne,
  onSeal,
}: {
  selected: PresentElement & { kind: 'text' }
  onPatchOne: (fn: (e: PresentElement) => PresentElement, opts?: { coalesceKey?: string }) => void
  onSeal: () => void
}) {
  return (
    <>
      <label className="mt-2 block text-[10px] text-muted uppercase">
        Size
        <input
          type="number"
          className="field mt-0.5 !px-1.5 !py-0.5 text-[11.5px]"
          value={selected.fontSize}
          onChange={(e) =>
            onPatchOne(
              (el) => (el.kind === 'text' ? { ...el, fontSize: Math.max(8, Math.min(200, Number(e.target.value) || 8)) } : el),
              { coalesceKey: `size-${selected.id}` },
            )
          }
          onBlur={onSeal}
        />
      </label>
      <div className="mt-1.5 flex gap-1">
        <button
          className={`tbtn font-bold ${selected.bold ? 'is-active' : ''}`}
          title="Bold"
          aria-pressed={selected.bold}
          onClick={() => onPatchOne((el) => (el.kind === 'text' ? { ...el, bold: !el.bold } : el))}
        >
          B
        </button>
        <button
          className={`tbtn italic ${selected.italic ? 'is-active' : ''}`}
          title="Italic"
          aria-pressed={selected.italic}
          onClick={() => onPatchOne((el) => (el.kind === 'text' ? { ...el, italic: !el.italic } : el))}
        >
          I
        </button>
        {(['left', 'center', 'right'] as const).map((a) => (
          <button
            key={a}
            className={`tbtn ${selected.align === a ? 'is-active' : ''}`}
            title={`Align ${a}`}
            aria-pressed={selected.align === a}
            onClick={() => onPatchOne((el) => (el.kind === 'text' ? { ...el, align: a } : el))}
          >
            {a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}
          </button>
        ))}
      </div>
      <label className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
        Color
        <input
          type="color"
          className="h-5 w-8 cursor-pointer border-0 bg-transparent p-0"
          value={selected.color ?? '#1f1f24'}
          onChange={(e) =>
            onPatchOne((el) => (el.kind === 'text' ? { ...el, color: e.target.value } : el), {
              coalesceKey: `color-${selected.id}`,
            })
          }
          onBlur={onSeal}
        />
        {selected.color && (
          <button
            className="tbtn w-5 text-[9px]"
            title="Use theme color"
            onClick={() => onPatchOne((el) => (el.kind === 'text' ? { ...el, color: null } : el))}
          >
            <IcX size={10} />
          </button>
        )}
      </label>
    </>
  )
}

function ImageControls({
  selected,
  onPatchOne,
  onReplace,
}: {
  selected: PresentElement & { kind: 'image' }
  onPatchOne: (fn: (e: PresentElement) => PresentElement, opts?: { coalesceKey?: string }) => void
  onReplace: () => void
}) {
  return (
    <>
      <label className="mt-2 block text-[10px] text-muted uppercase">
        Alt text
        <input
          className="field mt-0.5 !px-1.5 !py-0.5 text-[11.5px]"
          value={selected.alt ?? ''}
          placeholder="Describe this image"
          aria-label="Image alt text"
          onChange={(e) =>
            onPatchOne((el) => (el.kind === 'image' ? { ...el, alt: e.target.value } : el), {
              coalesceKey: `alt-${selected.id}`,
            })
          }
        />
      </label>
      <button className="btn mt-2 w-full" onClick={onReplace}>
        <IcImage size={12} /> Replace image
      </button>
    </>
  )
}

function ShapeControls({
  selected,
  onPatchOne,
  onSeal,
}: {
  selected: PresentElement & { kind: 'shape' }
  onPatchOne: (fn: (e: PresentElement) => PresentElement, opts?: { coalesceKey?: string }) => void
  onSeal: () => void
}) {
  return (
    <>
      <label className="mt-2 flex items-center gap-2 text-[11px] text-muted">
        Fill
        <input
          type="color"
          className="h-5 w-8 cursor-pointer border-0 bg-transparent p-0"
          value={selected.fill?.slice(0, 7) ?? '#cccccc'}
          onChange={(e) =>
            onPatchOne((el) => (el.kind === 'shape' ? { ...el, fill: e.target.value } : el), {
              coalesceKey: `fill-${selected.id}`,
            })
          }
          onBlur={onSeal}
        />
        <button
          className="tbtn w-5 text-[9px]"
          title="No fill"
          onClick={() => onPatchOne((el) => (el.kind === 'shape' ? { ...el, fill: null } : el))}
        >
          <IcX size={10} />
        </button>
      </label>
      <label className="mt-1 flex items-center gap-2 text-[11px] text-muted">
        Stroke
        <input
          type="color"
          className="h-5 w-8 cursor-pointer border-0 bg-transparent p-0"
          value={selected.stroke ?? '#888888'}
          onChange={(e) =>
            onPatchOne((el) => (el.kind === 'shape' ? { ...el, stroke: e.target.value } : el), {
              coalesceKey: `stroke-${selected.id}`,
            })
          }
          onBlur={onSeal}
        />
        <input
          type="number"
          className="field w-14 !px-1.5 !py-0.5 text-[11.5px]"
          value={selected.strokeWidth}
          min={0}
          max={40}
          aria-label="Stroke width"
          onChange={(e) =>
            onPatchOne(
              (el) => (el.kind === 'shape' ? { ...el, strokeWidth: Math.max(0, Number(e.target.value) || 0) } : el),
              { coalesceKey: `sw-${selected.id}` },
            )
          }
          onBlur={onSeal}
        />
      </label>
    </>
  )
}
