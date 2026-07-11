import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useStore } from '@/store/useStore'
import type { PresentationDocMeta } from '@/types/model'
import { storage } from '@/lib/storage/StorageProvider'
import { downloadBlob, slugify } from '@/lib/download'
import { useReadOnly } from '@/lib/collab/useCollab'
import { presenceService } from '@/lib/collab/PresenceService'
import { nid } from '@/lib/id'
import {
  SLIDE_H,
  SLIDE_W,
  THEME_COLORS,
  createSlide,
  createTextElement,
  normalizePresentBody,
  type PresentElement,
  type PresentSlide,
  type PresentTheme,
  type PresentationBody,
  type ShapeElement,
} from '@/lib/present/presentModel'
import { toast } from '@/components/ui/Toaster'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { ToolbarDivider } from '@/components/ui/ToolbarDivider'
import { ActionIcon } from '@/components/ActionIcons'
import { IcCopy, IcImage, IcPlus, IcTrash, IcX } from '@/components/Icons'
import { SlideView, StaticElement, elementStyle } from './SlideView'

/**
 * PresentationWorkspace (Phase 8) — the first production slide editor.
 * Slide list · 960×540 canvas with select/move/resize/inline text edit ·
 * element inspector (geometry, typography, fill/stroke, z-order) ·
 * per-slide background · themes · speaker notes · PDF + PPTX export.
 * The deck body is the internal JSON source format (presentModel.ts),
 * persisted through the store like docs/sheets/code.
 */

const SAVE_DEBOUNCE_MS = 700

type Patch = (body: PresentationBody) => PresentationBody

export default function PresentationWorkspace({ meta }: { meta: PresentationDocMeta }) {
  const persistPresentBody = useStore((s) => s.persistPresentBody)
  const updatePresentMeta = useStore((s) => s.updatePresentMeta)
  const closePresent = useStore((s) => s.closePresent)
  const readOnly = useReadOnly()

  const [body, setBody] = useState<PresentationBody | null>(null)
  const [slideIndex, setSlideIndex] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)
  const pending = useRef<PresentationBody | null>(null)

  useEffect(() => {
    let alive = true
    setBody(null)
    setSlideIndex(0)
    setSelectedId(null)
    setEditingTextId(null)
    pending.current = null
    void storage
      .getDocument(meta.id)
      .then((raw) => alive && setBody(normalizePresentBody(raw)))
      .catch(() => alive && setBody(normalizePresentBody(undefined)))
    return () => {
      alive = false
    }
  }, [meta.id])

  // presence: which deck is open
  useEffect(() => {
    presenceService.setEditing({ kind: 'doc', id: meta.id, title: meta.title })
    return () => presenceService.setEditing(undefined)
  }, [meta.id, meta.title])

  const flush = useCallback(() => {
    if (pending.current) {
      window.clearTimeout(saveTimer.current)
      persistPresentBody(meta.id, pending.current)
      pending.current = null
    }
  }, [meta.id, persistPresentBody])
  useEffect(() => () => flush(), [flush])

  const apply = useCallback(
    (patch: Patch) => {
      if (readOnly) return
      setBody((prev) => {
        if (!prev) return prev
        const next = patch(prev)
        pending.current = next
        window.clearTimeout(saveTimer.current)
        saveTimer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS)
        return next
      })
    },
    [flush, readOnly],
  )

  const patchSlide = useCallback(
    (index: number, fn: (s: PresentSlide) => PresentSlide) =>
      apply((b) => ({
        ...b,
        slides: b.slides.map((s, i) => (i === index ? fn(s) : s)),
      })),
    [apply],
  )

  const patchElement = useCallback(
    (elementId: string, fn: (e: PresentElement) => PresentElement) =>
      patchSlide(slideIndex, (s) => ({
        ...s,
        elements: s.elements.map((e) => (e.id === elementId ? fn(e) : e)),
      })),
    [patchSlide, slideIndex],
  )

  // Delete/Escape shortcuts (never while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
        return
      if (e.key === 'Escape') {
        setEditingTextId(null)
        setSelectedId(null)
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !readOnly) {
        patchSlide(slideIndex, (s) => ({
          ...s,
          elements: s.elements.filter((el2) => el2.id !== selectedId),
        }))
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, slideIndex, patchSlide, readOnly])

  const imageInput = useRef<HTMLInputElement>(null)

  if (!body) {
    return (
      <section className="flex h-full min-w-0 flex-1 items-center justify-center bg-panel text-xs text-muted">
        Loading presentation…
      </section>
    )
  }

  const slide = body.slides[Math.min(slideIndex, body.slides.length - 1)]
  const theme = THEME_COLORS[body.theme]
  const selected = slide.elements.find((e) => e.id === selectedId) ?? null
  const maxZ = slide.elements.reduce((m, e) => Math.max(m, e.z), 0)

  const addElement = (el: PresentElement) => {
    patchSlide(slideIndex, (s) => ({ ...s, elements: [...s.elements, el] }))
    setSelectedId(el.id)
  }

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
      fill: shape === 'line' ? null : theme.accent + '55',
      stroke: theme.accent,
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
    addElement({
      id: nid('el'),
      kind: 'image',
      src,
      x: 280,
      y: 130,
      w: 400,
      h: 280,
      z: maxZ + 1,
    })
  }

  const exportPdf = async () => {
    flush()
    const { exportPresentationPdf } = await import('@/lib/present/presentPdf')
    downloadBlob(`${slugify(meta.title)}.pdf`, await exportPresentationPdf(meta.title, body))
  }

  const exportPptx = async () => {
    flush()
    const { exportPresentationPptx } = await import('@/lib/present/presentPptx')
    downloadBlob(`${slugify(meta.title)}.pptx`, await exportPresentationPptx(body))
    toast.info(
      'PPTX exported (basic fidelity)',
      'Text boxes, shapes and images are covered; themes/animations are not.',
    )
  }

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-panel">
      {/* header */}
      <div className="flex flex-none items-center gap-2 border-b border-bord px-3 py-1.5">
        <input
          className="min-w-0 flex-1 bg-transparent text-[14px] font-bold outline-none"
          value={meta.title}
          readOnly={readOnly}
          onChange={(e) => updatePresentMeta(meta.id, { title: e.target.value })}
          aria-label="Presentation title"
        />
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
        <button
          className="btn"
          title="Export as PPTX — basic fidelity (text, shapes, images)"
          onClick={() => void exportPptx()}
        >
          <ActionIcon.Export size={12} /> PPTX
        </button>
        <button className="icon-btn" title="Close presentation" aria-label="Close presentation" onClick={closePresent}>
          <IcX size={14} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* slide list */}
        <aside className="flex w-44 flex-none flex-col border-r border-bord">
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {body.slides.map((s, i) => (
              <div
                key={s.id}
                className={`group relative mb-2 cursor-pointer overflow-hidden rounded-lg border ${
                  i === slideIndex ? 'border-accent' : 'border-bord hover:border-muted'
                }`}
                onClick={() => {
                  setSlideIndex(i)
                  setSelectedId(null)
                  setEditingTextId(null)
                }}
                role="button"
                aria-label={`Slide ${i + 1}`}
                aria-current={i === slideIndex}
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
                        apply((b) => {
                          const slides = [...b.slides]
                          ;[slides[i - 1], slides[i]] = [slides[i], slides[i - 1]]
                          return { ...b, slides }
                        })
                        setSlideIndex(i - 1)
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
                        apply((b) => {
                          const slides = [...b.slides]
                          ;[slides[i + 1], slides[i]] = [slides[i], slides[i + 1]]
                          return { ...b, slides }
                        })
                        setSlideIndex(i + 1)
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
                        apply((b) => {
                          const copy: PresentSlide = JSON.parse(JSON.stringify(b.slides[i]))
                          copy.id = nid('slide')
                          copy.elements = copy.elements.map((el) => ({ ...el, id: nid('el') }))
                          const slides = [...b.slides]
                          slides.splice(i + 1, 0, copy)
                          return { ...b, slides }
                        })
                      }}
                    >
                      <IcCopy size={10} />
                    </button>
                    <button
                      className="icon-btn h-5 w-5 bg-panel/90 text-[#f24822]"
                      title="Delete slide"
                      aria-label={`Delete slide ${i + 1}`}
                      onClick={async (e) => {
                        e.stopPropagation()
                        if (body.slides.length <= 1) {
                          toast.warning('A deck needs at least one slide')
                          return
                        }
                        if (
                          await confirmDialog({
                            title: `Delete slide ${i + 1}?`,
                            confirmLabel: 'Delete slide',
                            danger: true,
                          })
                        ) {
                          apply((b) => ({ ...b, slides: b.slides.filter((_, j) => j !== i) }))
                          setSlideIndex((cur) => Math.max(0, cur > i ? cur - 1 : Math.min(cur, body.slides.length - 2)))
                        }
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
            <button
              className="btn m-2 flex-none"
              onClick={() => {
                apply((b) => {
                  const slides = [...b.slides]
                  slides.splice(slideIndex + 1, 0, createSlide())
                  return { ...b, slides }
                })
                setSlideIndex(slideIndex + 1)
              }}
            >
              <IcPlus size={12} /> Add slide
            </button>
          )}
        </aside>

        {/* canvas + notes */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!readOnly && (
            <div className="doc-toolbar flex-none">
              <button className="tbtn px-2" title="Add text box" onClick={() => addElement(createTextElement({ z: maxZ + 1 }))}>
                + Text
              </button>
              <button className="tbtn px-2" title="Add image" onClick={() => imageInput.current?.click()}>
                <IcImage size={12} /> Image
              </button>
              <ToolbarDivider />
              <button className="tbtn px-2" title="Add rectangle" onClick={() => addShape('rect')}>▭</button>
              <button className="tbtn px-2" title="Add ellipse" onClick={() => addShape('ellipse')}>◯</button>
              <button className="tbtn px-2" title="Add line" onClick={() => addShape('line')}>—</button>
              <ToolbarDivider />
              <label className="flex items-center gap-1 text-[11px] text-muted">
                Background
                <input
                  type="color"
                  className="h-5 w-8 cursor-pointer border-0 bg-transparent p-0"
                  value={slide.background ?? theme.bg}
                  aria-label="Slide background color"
                  onChange={(e) => patchSlide(slideIndex, (s) => ({ ...s, background: e.target.value }))}
                />
                {slide.background && (
                  <button
                    className="tbtn w-4 text-[9px]"
                    title="Reset to theme background"
                    onClick={() => patchSlide(slideIndex, (s) => ({ ...s, background: null }))}
                  >
                    ✕
                  </button>
                )}
              </label>
              <span className="ml-auto text-[10.5px] text-muted">
                Slide {slideIndex + 1}/{body.slides.length} · double-click text to edit · Del removes
              </span>
            </div>
          )}
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-panel2 p-4">
            <SlideCanvas
              slide={slide}
              theme={body.theme}
              readOnly={readOnly}
              selectedId={selectedId}
              editingTextId={editingTextId}
              onSelect={setSelectedId}
              onEditText={setEditingTextId}
              onPatchElement={patchElement}
            />
          </div>
          <div className="flex-none border-t border-bord px-3 py-2">
            <label className="mb-1 block text-[9.5px] font-semibold tracking-widest text-muted uppercase">
              Speaker notes — slide {slideIndex + 1}
            </label>
            <textarea
              className="field h-14 w-full resize-none text-[12px]"
              placeholder="Notes only you see while presenting…"
              value={slide.notes}
              readOnly={readOnly}
              onChange={(e) => patchSlide(slideIndex, (s) => ({ ...s, notes: e.target.value }))}
            />
          </div>
        </div>

        {/* element inspector */}
        <ElementInspector
          selected={selected}
          readOnly={readOnly}
          maxZ={maxZ}
          onPatch={(fn) => selected && patchElement(selected.id, fn)}
          onDelete={() => {
            if (!selected) return
            patchSlide(slideIndex, (s) => ({
              ...s,
              elements: s.elements.filter((e) => e.id !== selected.id),
            }))
            setSelectedId(null)
          }}
        />
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

/* ================= editable canvas ================= */

function SlideCanvas({
  slide,
  theme,
  readOnly,
  selectedId,
  editingTextId,
  onSelect,
  onEditText,
  onPatchElement,
}: {
  slide: PresentSlide
  theme: PresentTheme
  readOnly: boolean
  selectedId: string | null
  editingTextId: string | null
  onSelect: (id: string | null) => void
  onEditText: (id: string | null) => void
  onPatchElement: (id: string, fn: (e: PresentElement) => PresentElement) => void
}) {
  const t = THEME_COLORS[theme]
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.7)

  useEffect(() => {
    const el = wrapRef.current?.parentElement
    if (!el) return
    const compute = () => {
      const pad = 48
      setScale(
        Math.min((el.clientWidth - pad) / SLIDE_W, (el.clientHeight - pad) / SLIDE_H, 1.2),
      )
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const gesture = useRef<{
    id: string
    kind: 'move' | 'resize'
    startX: number
    startY: number
    orig: { x: number; y: number; w: number; h: number }
  } | null>(null)

  const beginGesture = (
    e: ReactPointerEvent,
    el: PresentElement,
    kind: 'move' | 'resize',
  ) => {
    if (readOnly || editingTextId === el.id) return
    e.stopPropagation()
    e.preventDefault()
    onSelect(el.id)
    gesture.current = {
      id: el.id,
      kind,
      startX: e.clientX,
      startY: e.clientY,
      orig: { x: el.x, y: el.y, w: el.w, h: el.h },
    }
    const onMove = (ev: PointerEvent) => {
      const g = gesture.current
      if (!g) return
      const dx = (ev.clientX - g.startX) / scale
      const dy = (ev.clientY - g.startY) / scale
      onPatchElement(g.id, (cur) =>
        g.kind === 'move'
          ? {
              ...cur,
              x: Math.round(Math.min(SLIDE_W - 8, Math.max(8 - g.orig.w, g.orig.x + dx))),
              y: Math.round(Math.min(SLIDE_H - 8, Math.max(8 - g.orig.h, g.orig.y + dy))),
            }
          : {
              ...cur,
              w: Math.round(Math.max(24, g.orig.w + dx)),
              h: Math.round(Math.max(16, g.orig.h + dy)),
            },
      )
    }
    const onUp = () => {
      gesture.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const sorted = useMemo(
    () => [...slide.elements].sort((a, b) => a.z - b.z),
    [slide.elements],
  )

  return (
    <div
      ref={wrapRef}
      style={{ width: SLIDE_W * scale, height: SLIDE_H * scale, position: 'relative' }}
    >
      <div
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
        onPointerDown={() => {
          onSelect(null)
          onEditText(null)
        }}
      >
        {sorted.map((el) => {
          const isSelected = el.id === selectedId
          const isEditing = el.id === editingTextId
          return (
            <div
              key={el.id}
              style={{
                ...elementStyle(el),
                cursor: readOnly ? 'default' : 'move',
                outline: isSelected ? '1.5px solid #0d99ff' : 'none',
                outlineOffset: 2,
              }}
              onPointerDown={(e) => beginGesture(e, el, 'move')}
              onDoubleClick={(e) => {
                e.stopPropagation()
                if (!readOnly && el.kind === 'text') onEditText(el.id)
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
                    border: '1px dashed #0d99ff',
                    outline: 'none',
                    resize: 'none',
                    fontFamily: 'inherit',
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    onPatchElement(el.id, (cur) =>
                      cur.kind === 'text' ? { ...cur, text: e.target.value } : cur,
                    )
                  }
                  onBlur={() => onEditText(null)}
                />
              ) : (
                <StaticElement el={{ ...el, x: 0, y: 0 } as PresentElement} themeText={t.text} />
              )}
              {isSelected && !readOnly && (
                <span
                  role="presentation"
                  style={{
                    position: 'absolute',
                    right: -7,
                    bottom: -7,
                    width: 13,
                    height: 13,
                    borderRadius: 4,
                    border: '2px solid #0d99ff',
                    background: '#fff',
                    cursor: 'nwse-resize',
                    zIndex: 99,
                  }}
                  onPointerDown={(e) => beginGesture(e, el, 'resize')}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ================= element inspector ================= */

function ElementInspector({
  selected,
  readOnly,
  maxZ,
  onPatch,
  onDelete,
}: {
  selected: PresentElement | null
  readOnly: boolean
  maxZ: number
  onPatch: (fn: (e: PresentElement) => PresentElement) => void
  onDelete: () => void
}) {
  if (readOnly) return null
  return (
    <aside className="w-56 flex-none overflow-y-auto border-l border-bord px-3 pb-4">
      <div className="insp-h">Element</div>
      {!selected ? (
        <p className="text-[11px] leading-relaxed text-muted">
          Select an element on the slide to edit its geometry, style and layer.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                ['x', selected.x],
                ['y', selected.y],
                ['w', selected.w],
                ['h', selected.h],
              ] as const
            ).map(([k, v]) => (
              <label key={k} className="text-[10px] text-muted uppercase">
                {k}
                <input
                  type="number"
                  className="field mt-0.5 !px-1.5 !py-0.5 text-[11.5px]"
                  value={Math.round(v)}
                  aria-label={`Element ${k}`}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (Number.isFinite(n)) onPatch((el) => ({ ...el, [k]: n }))
                  }}
                />
              </label>
            ))}
          </div>

          {selected.kind === 'text' && (
            <>
              <div className="insp-h">Text</div>
              <label className="text-[10px] text-muted uppercase">
                Size
                <input
                  type="number"
                  className="field mt-0.5 !px-1.5 !py-0.5 text-[11.5px]"
                  value={selected.fontSize}
                  onChange={(e) =>
                    onPatch((el) =>
                      el.kind === 'text'
                        ? { ...el, fontSize: Math.max(8, Math.min(120, Number(e.target.value) || 8)) }
                        : el,
                    )
                  }
                />
              </label>
              <div className="mt-1.5 flex gap-1">
                <button
                  className={`tbtn font-bold ${selected.bold ? 'is-active' : ''}`}
                  title="Bold"
                  aria-pressed={selected.bold}
                  onClick={() => onPatch((el) => (el.kind === 'text' ? { ...el, bold: !el.bold } : el))}
                >
                  B
                </button>
                <button
                  className={`tbtn italic ${selected.italic ? 'is-active' : ''}`}
                  title="Italic"
                  aria-pressed={selected.italic}
                  onClick={() => onPatch((el) => (el.kind === 'text' ? { ...el, italic: !el.italic } : el))}
                >
                  I
                </button>
                {(['left', 'center', 'right'] as const).map((a) => (
                  <button
                    key={a}
                    className={`tbtn ${selected.align === a ? 'is-active' : ''}`}
                    title={`Align ${a}`}
                    aria-pressed={selected.align === a}
                    onClick={() => onPatch((el) => (el.kind === 'text' ? { ...el, align: a } : el))}
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
                    onPatch((el) => (el.kind === 'text' ? { ...el, color: e.target.value } : el))
                  }
                />
                {selected.color && (
                  <button
                    className="tbtn w-4 text-[9px]"
                    title="Use theme color"
                    onClick={() => onPatch((el) => (el.kind === 'text' ? { ...el, color: null } : el))}
                  >
                    ✕
                  </button>
                )}
              </label>
            </>
          )}

          {selected.kind === 'shape' && (
            <>
              <div className="insp-h">Shape</div>
              <label className="flex items-center gap-2 text-[11px] text-muted">
                Fill
                <input
                  type="color"
                  className="h-5 w-8 cursor-pointer border-0 bg-transparent p-0"
                  value={selected.fill?.slice(0, 7) ?? '#cccccc'}
                  onChange={(e) =>
                    onPatch((el) => (el.kind === 'shape' ? { ...el, fill: e.target.value } : el))
                  }
                />
                <button
                  className="tbtn w-4 text-[9px]"
                  title="No fill"
                  onClick={() => onPatch((el) => (el.kind === 'shape' ? { ...el, fill: null } : el))}
                >
                  ✕
                </button>
              </label>
              <label className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                Stroke
                <input
                  type="color"
                  className="h-5 w-8 cursor-pointer border-0 bg-transparent p-0"
                  value={selected.stroke ?? '#888888'}
                  onChange={(e) =>
                    onPatch((el) => (el.kind === 'shape' ? { ...el, stroke: e.target.value } : el))
                  }
                />
                <input
                  type="number"
                  className="field w-14 !px-1.5 !py-0.5 text-[11.5px]"
                  value={selected.strokeWidth}
                  min={0}
                  max={20}
                  aria-label="Stroke width"
                  onChange={(e) =>
                    onPatch((el) =>
                      el.kind === 'shape'
                        ? { ...el, strokeWidth: Math.max(0, Number(e.target.value) || 0) }
                        : el,
                    )
                  }
                />
              </label>
            </>
          )}

          <div className="insp-h">Layer</div>
          <div className="flex gap-1">
            <button
              className="btn flex-1"
              title="Bring forward"
              onClick={() => onPatch((el) => ({ ...el, z: el.z + 1 }))}
            >
              ↥ Front
            </button>
            <button
              className="btn flex-1"
              title="Send backward"
              onClick={() => onPatch((el) => ({ ...el, z: Math.max(0, el.z - 1) }))}
            >
              ↧ Back
            </button>
          </div>
          <p className="mt-1 text-[10px] text-muted">z {selected.z} of {maxZ}</p>

          <div className="insp-h">Danger</div>
          <button className="btn w-full text-[#f24822]" onClick={onDelete}>
            <IcTrash size={12} /> Delete element
          </button>
        </>
      )}
    </aside>
  )
}
