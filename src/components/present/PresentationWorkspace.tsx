import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import type { PresentationDocMeta } from '@/types/model'
import { downloadBlob, slugify } from '@/lib/download'
import { presenceService } from '@/lib/collab/PresenceService'
import { nid } from '@/lib/id'
import {
  SLIDE_H,
  SLIDE_W,
  THEME_COLORS,
  createSlide,
  createTextElement,
  type PresentElement,
  type PresentSlide,
  type PresentationBody,
  type PresentTheme,
  type ShapeElement,
  type SlideReviewStatus,
} from '@/lib/present/presentModel'
import {
  addMaster,
  assignMaster,
  furnitureElements,
  masterTokensFor,
  removeMaster,
  setMasterToken,
  updateMaster,
  type MasterFurniture,
  type PresentMaster,
} from '@/lib/present/masters'
import {
  OVERRIDE_LABEL,
  applyLayoutPlan,
  layoutById,
  placeholderFor,
  placeholderOverrides,
  revertOverride,
  type LayoutPlan,
  type OverrideKey,
} from '@/lib/present/layouts'
import { LayoutPicker } from './LayoutPicker'
import { ChartInsertDialog } from './ChartInsertDialog'
import { LinkedContentPanel } from './LinkedContentPanel'
import { storage } from '@/lib/storage/StorageProvider'
import type { SheetData } from '@/lib/sheet/sheetModel'
import { chartDataOf, parseRange, readRange, type ChartData } from '@/lib/present/sheetRange'
import {
  detached,
  planUpdates,
  withCapturedRev,
  type LinkedItem,
  type SourceState,
} from '@/lib/present/linked'
import { TypographyPanel } from './TypographyPanel'
import { PresenterView } from './PresenterView'
import {
  DEFAULT_TRANSITION_MS,
  TRANSITIONS,
  TRANSITION_LABEL,
  startIndex,
  type SlideTransition,
} from '@/lib/present/presenter'
import { MasterPanel } from './MasterPanel'
import { THEME_PRESETS, type ThemeTokens } from '@/lib/present/theme'
import {
  resolveTextRender,
  withStyleOverride,
  type TextStyleName,
  type TextStyleSpec,
} from '@/lib/present/textStyles'
import { measureOverflow, type AutoSizeMode, type OverflowReport } from '@/lib/present/overflow'
import {
  isFullCrop,
  normalizeCrop,
  normalizeFocal,
  sanitizeAdjustments,
  type ImageFit,
} from '@/lib/present/media'
import {
  moveSection,
  presentableSlides,
  removeSection,
  renameSection,
  setSectionCollapsed,
  startSectionAt,
} from '@/lib/present/sections'
import { clampPosition, normalizedZ, rectOf } from '@/lib/present/geometry'
import { alignElements, distributeElements, type AlignEdge, type DistributeAxis } from '@/lib/present/align'
import { toast } from '@/components/ui/Toaster'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { ToolbarDivider } from '@/components/ui/ToolbarDivider'
import { SlideToolbar } from './SlideToolbar'
import { ActionIcon } from '@/components/ActionIcons'
import {
  IcChevronDown,
  IcChevronRight,
  IcEye,
  IcEyeOff,
  IcImage,
  IcLock,
  IcObjectAlignBottom,
  IcObjectAlignCenter,
  IcObjectAlignLeft,
  IcObjectAlignMiddle,
  IcObjectAlignRight,
  IcObjectAlignTop,
  IcObjectDistributeH,
  IcObjectDistributeV,
  IcRedo,
  IcTrash,
  IcUndo,
  IcUnlock,
  IcX,
  IcZoomIn,
  IcZoomOut,
} from '@/components/Icons'
import { SlideCanvas } from './SlideCanvas'
import { LayersPanel } from './LayersPanel'
import { SlideRail, type SlideRailHandlers } from './SlideRail'
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

/** Which part of the deck the right panel is describing (19E.1). */
type InspectorScope = 'slide' | 'element' | 'deck'

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
  const { body, apply, undo, redo, seal, flush, canUndo, canRedo, readOnly, unsaved } =
    useDeckHistory(meta)

  const [slideIndex, setSlideIndex] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [zoom, setZoom] = useState<number | 'fit'>('fit')
  const [fitScale, setFitScale] = useState(0.6)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [layersCollapsed, setLayersCollapsed] = useState(false)
  // notes collapse to a strip: the canvas is what this screen is for (19E.1)
  const [notesOpen, setNotesOpen] = useState(false)
  const [layoutsOpen, setLayoutsOpen] = useState(false)
  const [chartOpen, setChartOpen] = useState(false)
  const [presenting, setPresenting] = useState(false)
  /** bumping this replays the current slide's transition on the canvas */
  const [previewNonce, setPreviewNonce] = useState(0)
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  const [overflow, setOverflow] = useState<OverflowReport | null>(null)

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
  // what this slide actually paints with: deck tokens, then its master's
  const slideTokens = body && slide ? masterTokensFor(body, slide) : THEME_PRESETS.plain

  const elements = slide?.elements ?? []
  const maxZ = elements.reduce((m, e) => Math.max(m, e.z), 0)
  const selectedEls = useMemo(
    () => elements.filter((e) => selectedIds.has(e.id)),
    [elements, selectedIds],
  )
  const selected = selectedEls.length === 1 ? selectedEls[0] : null

  /**
   * Overflow is measured, not estimated (19E.3): the rendered box knows how
   * tall its text really is, and the panel reports that rather than guessing
   * from character counts.
   */
  const selectedTextId = selected?.kind === 'text' ? selected.id : null
  useEffect(() => {
    if (!selectedTextId || !slide) {
      setOverflow(null)
      return
    }
    const inner = document.querySelector<HTMLElement>(
      `[data-el-id="${selectedTextId}"] [data-text-measure]`,
    )
    const el = slide.elements.find((e) => e.id === selectedTextId)
    if (!inner || !el || el.kind !== 'text') {
      setOverflow(null)
      return
    }
    const r = resolveTextRender(el, slideTokens, body?.textStyles)
    const next = measureOverflow({
      contentHeight: inner.scrollHeight,
      boxHeight: el.h,
      fontSize: r.size,
      lineHeight: r.lineHeight,
    })
    // measuring produces a fresh object every time; storing an equal one would
    // re-render, re-measure and never settle
    setOverflow((prev) =>
      prev &&
      prev.overflowing === next.overflowing &&
      prev.overBy === next.overBy &&
      prev.shrunkFontSize === next.shrunkFontSize &&
      prev.grownHeight === next.grownHeight
        ? prev
        : next,
    )
  }, [selectedTextId, slide, slideTokens, body?.textStyles, scale])

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

  /**
   * One element aligns to the slide; several align to each other. That is what
   * every design tool does, and it is the difference between "centre this on
   * the slide" being one click and being impossible.
   */
  const align = (edge: AlignEdge) => {
    if (!selectedEls.length) return
    const frame = selectedEls.length === 1 ? { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H } : undefined
    const map = alignElements(selectedEls.map((e) => ({ id: e.id, ...rectOf(e) })), edge, frame)
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

  /**
   * What every linkable source looks like right now (19E.4). `updatedAt` is
   * the revision: it only moves forward, and it is what the deck compares its
   * captured revision against.
   */
  const sheetDocs = useStore((st) => st.sheetDocs)
  const boards = useStore((st) => st.boards)
  const docs = useStore((st) => st.docs)
  const linkSources = useMemo(() => {
    const map = new Map<string, SourceState>()
    for (const d of Object.values(sheetDocs)) map.set(d.id, { id: d.id, rev: d.updatedAt, label: d.title })
    // a board carries no revision, so a board-backed link can never be told
    // it is stale — rev 0 means "present, and never claiming an update"
    for (const b of Object.values(boards)) map.set(b.id, { id: b.id, rev: 0, label: b.name })
    for (const d of Object.values(docs)) map.set(d.id, { id: d.id, rev: d.updatedAt, label: d.title })
    return map
  }, [sheetDocs, boards, docs])

  const linkActions = {
    goTo: (slideIndex: number, elementId: string) => {
      goToSlide(slideIndex)
      setSelectedIds(new Set([elementId]))
    },
    updateOne: async (item: LinkedItem) => {
      const fresh = await readLinkedChart(item)
      apply((b) => ({
        ...b,
        slides: b.slides.map((sl, i) =>
          i !== item.slideIndex
            ? sl
            : {
                ...sl,
                elements: sl.elements.map((el) =>
                  el.id !== item.elementId
                    ? el
                    : {
                        ...el,
                        ...(fresh && el.kind === 'chart' ? { data: fresh } : {}),
                        linkRef: withCapturedRev(item.link, item.sourceRev ?? item.link.rev ?? 0),
                      },
                ),
              },
        ),
      }))
    },
    detach: (item: LinkedItem) =>
      apply((b) => ({
        ...b,
        slides: b.slides.map((sl, i) =>
          i !== item.slideIndex
            ? sl
            : {
                ...sl,
                elements: sl.elements.map((el) =>
                  el.id === item.elementId ? { ...el, linkRef: detached(item.link) } : el,
                ),
              },
        ),
      })),
  }

  /** Re-read a chart's range from its source, when it still has one. */
  const readLinkedChart = async (item: LinkedItem) => {
    if (item.link.kind !== 'sheet' || !item.link.ref) return null
    const raw = (await storage.getDocument(item.link.id)) as { sheets?: SheetData[] } | null
    const parsed = parseRange(item.link.ref)
    const sheet = raw?.sheets?.find((sh) => !parsed?.sheet || sh.name === parsed.sheet) ?? raw?.sheets?.[0]
    if (!parsed || !sheet) return null
    return chartDataOf(readRange(sheet, parsed))
  }

  const updateAllLinked = async () => {
    const plan = planUpdates(body!, linkSources)
    for (const item of plan.items) await linkActions.updateOne(item)
    toast.info(
      `${plan.items.length} updated`,
      `Rewrote slide${plan.slideNumbers.length === 1 ? '' : 's'} ${plan.slideNumbers.join(', ')}. Undo restores them.`,
    )
  }

  const openLinkedSource = (item: LinkedItem) => {
    if (item.link.kind === 'sheet') useStore.getState().openSheet?.(item.link.id)
    else if (item.link.kind === 'document') useStore.getState().openDoc?.(item.link.id)
    else toast.info('Open the source', `${item.label} lives in ${item.link.kind}.`)
  }

  const insertTable = () =>
    addElement({
      id: nid('el'),
      kind: 'table',
      headerRow: true,
      cells: [
        ['Section', 'Q2', 'Q3'],
        ['Board', '', ''],
        ['Present', '', ''],
      ],
      x: 160,
      y: 150,
      w: 640,
      h: 200,
      z: maxZ + 1,
    })

  const insertChart = (args: {
    data: ChartData
    chart: 'bar' | 'line'
    title: string
    sheetId: string
    range: string
    rev: number
  }) => {
    addElement({
      id: nid('el'),
      kind: 'chart',
      chart: args.chart,
      data: args.data,
      title: args.title,
      x: 120,
      y: 120,
      w: 520,
      h: 300,
      z: maxZ + 1,
      linkRef: { mode: 'link', kind: 'sheet', id: args.sheetId, ref: args.range, rev: args.rev, label: args.title },
    })
    setChartOpen(false)
  }

  /* ---------- deck structure (19E.1) ---------- */

  const toggleHidden = (i: number) =>
    apply((b) => ({
      ...b,
      slides: b.slides.map((s, j) => (j === i ? { ...s, hidden: s.hidden ? undefined : true } : s)),
    }))

  const setReviewStatus = (i: number, status: SlideReviewStatus | undefined) =>
    apply((b) => ({
      ...b,
      slides: b.slides.map((s, j) => (j === i ? { ...s, reviewStatus: status } : s)),
    }))

  const railHandlers: SlideRailHandlers = {
    onGoTo: goToSlide,
    onMove: moveSlide,
    onDuplicate: duplicateSlide,
    onDelete: (i) => void deleteSlide(i),
    onAdd: addSlide,
    onStartSection: (i) => apply((b) => startSectionAt(b, i)),
    onRenameSection: (id, title) => apply((b) => renameSection(b, id, title)),
    // collapsing is a view preference, but a persisted one, so it goes through
    // history like everything else rather than living in component state
    onToggleCollapsed: (section) =>
      apply((b) => setSectionCollapsed(b, section.id, section.collapsed !== true)),
    onMoveSection: (id, direction) => apply((b) => moveSection(b, id, direction)),
    onRemoveSection: (id) => apply((b) => removeSection(b, id)),
  }

  const applyLayout = (plan: LayoutPlan) => {
    apply((b) => applyLayoutPlan(b, si, plan, slideTokens))
    setLayoutsOpen(false)
    toast.info(
      `Layout “${plan.layout.name}” applied`,
      plan.freeElementIds.length
        ? `${plan.freeElementIds.length} object(s) kept their own position as free objects. Undo restores the previous arrangement.`
        : 'Undo restores the previous arrangement.',
    )
  }

  const textActions: TextActions = {
    setStyleRef: (name) =>
      patchOne((el) => (el.kind === 'text' ? { ...el, styleRef: name } : el)),
    setOverride: (key, value) =>
      patchOne(
        (el) => {
          if (el.kind !== 'text') return el
          // one visible Size control: it edits the box when the box is on its
          // own, and the style override when the box follows a style
          if (key === 'size' && !el.styleRef) {
            return { ...el, fontSize: Math.max(1, Number(value) || el.fontSize) }
          }
          return { ...el, styleOverride: withStyleOverride(el.styleOverride, key, value) }
        },
        { coalesceKey: `type-${key}-${selected?.id}` },
      ),
    setBoxProp: (patch) => patchOne((el) => (el.kind === 'text' ? { ...el, ...patch } : el)),
    /**
     * Promote this box's overrides into its style. Every other box on that
     * style has no value of its own to keep, so they all follow — in one
     * history entry, because it is one patch to the deck.
     */
    updateStyle: () => {
      const el = selected
      if (!el || el.kind !== 'text' || !el.styleRef || !el.styleOverride) return
      const name = el.styleRef
      const promoted = el.styleOverride
      apply((b) => ({
        ...b,
        textStyles: { ...(b.textStyles ?? {}), [name]: { ...(b.textStyles?.[name] ?? {}), ...promoted } },
        slides: b.slides.map((s, i) =>
          i !== si
            ? s
            : { ...s, elements: s.elements.map((x) => (x.id === el.id ? { ...x, styleOverride: undefined } : x)) },
        ),
      }))
      toast.info(`${name} style updated`, 'Every box on this style follows. Undo restores it.')
    },
    applyRemedy: (mode, report) =>
      patchOne((el) => {
        if (el.kind !== 'text') return el
        if (mode === 'shrink' && report.shrunkFontSize !== null) {
          return el.styleRef
            ? { ...el, autoSize: mode, styleOverride: withStyleOverride(el.styleOverride, 'size', report.shrunkFontSize) }
            : { ...el, autoSize: mode, fontSize: report.shrunkFontSize }
        }
        if (mode === 'grow' && report.grownHeight !== null) {
          return { ...el, autoSize: mode, h: report.grownHeight }
        }
        return { ...el, autoSize: mode }
      }),
  }

  const masterActions: MasterActions = {
    add: (master) => apply((b) => addMaster(b, master)),
    remove: (id) => apply((b) => removeMaster(b, id)),
    rename: (id, name) => apply((b) => updateMaster(b, id, { name }), { coalesceKey: `mname-${id}` }),
    setToken: (id, key, value) =>
      apply((b) => setMasterToken(b, id, key, value as never), { coalesceKey: `mtok-${id}-${key}` }),
    assign: (id) => apply((b) => assignMaster(b, slide!.id, id)),
    setFurniture: (id, patch) =>
      apply(
        (b) => {
          const m = b.masters?.find((x) => x.id === id)
          return updateMaster(b, id, { furniture: { ...(m?.furniture ?? {}), ...patch } })
        },
        { coalesceKey: `mfurn-${id}` },
      ),
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
    toast.info(
      'PPTX exported (basic fidelity)',
      'Text runs, lists, tables, charts and images are covered. Slide transitions are not written — they play when presenting.',
    )
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

        {/* the theme is a deck property and now lives in the inspector's Deck
            scope, so this bar stops carrying a control that belongs to a panel */}
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
        <SlideRail
          body={body}
          currentIndex={si}
          readOnly={readOnly}
          handlers={railHandlers}
        />

        <LayersPanel
          elements={elements}
          inherited={furnitureElements(body, slide, si + 1, slideTokens)}
          selectedIds={selectedIds}
          collapsed={layersCollapsed}
          readOnly={readOnly}
          onToggleCollapsed={() => setLayersCollapsed((v) => !v)}
          onSelect={(id, additive) =>
            setSelectedIds((prev) => {
              if (!additive) return new Set([id])
              const next = new Set(prev)
              next.has(id) ? next.delete(id) : next.add(id)
              return next
            })
          }
          onToggleFlag={(id, flag) =>
            patchElement(id, (e) => ({ ...e, [flag]: e[flag] ? undefined : true }))
          }
        />

        {/* ---------- canvas column ---------- */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!readOnly && (
            <SlideToolbar
              slideIndex={si}
              slideCount={body.slides.length}
              background={slide.background}
              themeBackground={themeColors.bg}
              selectedCount={selectedEls.length}
              snapEnabled={snapEnabled}
              layoutName={layoutById(slide.layoutId)?.name ?? null}
              onAddText={addText}
              onAddImage={() => imageInput.current?.click()}
              onAddShape={addShape}
              onBackground={(background) =>
                patchSlide((s) => ({ ...s, background }), { coalesceKey: `bg-${slide.id}` })
              }
              onResetBackground={() => patchSlide((s) => ({ ...s, background: null }))}
              onToggleSnap={() => setSnapEnabled((v) => !v)}
              onOpenLayouts={() => setLayoutsOpen((v) => !v)}
              onInsertChart={() => setChartOpen((v) => !v)}
              onInsertTable={insertTable}
              onPresent={() => {
                // a deck is read while it runs: flush first so what is on the
                // screen is what is on disk, then never write again
                flush()
                setPresenting(true)
              }}
              onAlign={align}
              onDistribute={distribute}
            />
          )}

          <div
            ref={scrollRef}
            className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-panel2 p-4"
          >
            {chartOpen && !readOnly && (
              <ChartInsertDialog onInsert={insertChart} onClose={() => setChartOpen(false)} />
            )}
            {layoutsOpen && !readOnly && (
              <LayoutPicker
                body={body}
                slideIndex={si}
                onApply={applyLayout}
                onClose={() => setLayoutsOpen(false)}
              />
            )}
            <div
              key={`preview-${previewNonce}`}
              className="contents"
              style={
                previewNonce && !reducedMotion && slide.transition && slide.transition !== 'none'
                  ? {
                      animation: `present-${slide.transition} ${slide.transitionMs ?? DEFAULT_TRANSITION_MS}ms ease-out both`,
                    }
                  : undefined
              }
            >
            <SlideCanvas
              slide={slide}
              tokens={slideTokens}
              textStyles={body.textStyles}
              decor={furnitureElements(body, slide, si + 1, slideTokens)}
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
          </div>

          {/* notes: a strip until you want them, so the canvas keeps the room */}
          <div className="flex-none border-t border-bord px-3 py-1.5">
            <button
              className="flex w-full items-center gap-1.5 text-left text-[9.5px] font-semibold tracking-widest text-muted uppercase hover:text-ink"
              aria-expanded={notesOpen}
              onClick={() => setNotesOpen((v) => !v)}
            >
              {notesOpen ? <IcChevronDown size={10} /> : <IcChevronRight size={10} />}
              Speaker notes — slide {si + 1}
              {!notesOpen && slide.notes.trim() && (
                <span className="ml-1 min-w-0 flex-1 truncate normal-case opacity-70">
                  {slide.notes.trim()}
                </span>
              )}
            </button>
            {notesOpen && (
              <textarea
                className="field mt-1 h-14 w-full resize-none text-[12px]"
                placeholder="Notes only you see while presenting…"
                value={slide.notes}
                readOnly={readOnly}
                onChange={(e) => {
                  const v = e.target.value
                  patchSlide((s) => ({ ...s, notes: v }), { coalesceKey: `notes-${slide.id}` })
                }}
                onBlur={seal}
              />
            )}
          </div>

          <StatusBar
            slideIndex={si}
            slideCount={body.slides.length}
            presentableCount={presentableSlides(body).length}
            objectCount={elements.length}
            selectedCount={selectedEls.length}
            schemaVersion={body.version}
            unsaved={unsaved}
            readOnly={readOnly}
          />
        </div>

        {/* ---------- contextual inspector ---------- */}
        {!readOnly && (
          <Inspector
            body={body}
            slide={slide}
            slideIndex={si}
            themeColors={themeColors}
            selectedEls={selectedEls}
            selected={selected}
            maxZ={maxZ}
            readOnly={readOnly}
            onPatchOne={patchOne}
            onPatchSlide={patchSlide}
            onToggleSlideHidden={() => toggleHidden(si)}
            onSetReviewStatus={(status) => setReviewStatus(si, status)}
            onSetTheme={(t) => apply((b) => ({ ...b, theme: t }))}
            onSetTransition={(t) =>
              patchSlide((sl) => ({ ...sl, transition: t === 'none' ? undefined : t }))
            }
            onSetTransitionMs={(ms) =>
              patchSlide((sl) => ({ ...sl, transitionMs: ms }), { coalesceKey: `trans-${slide.id}` })
            }
            onPreviewTransition={() => setPreviewNonce((n) => n + 1)}
            reducedMotion={reducedMotion}
            slideTokens={slideTokens}
            masterActions={masterActions}
            overflow={overflow}
            textActions={textActions}
            linkSources={linkSources}
            linkActions={linkActions}
            updateAllLinked={() => void updateAllLinked()}
            openLinkedSource={openLinkedSource}
            onRevertOverride={(key) => {
              const ph = placeholderFor(slide.layoutId, selected!)
              if (ph) patchOne((el) => revertOverride(el, ph, slideTokens, key))
            }}
            onDeleteSelection={deleteSelection}
            onAlign={align}
            onDistribute={distribute}
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

      {presenting && body && (
        <PresenterView
          body={body}
          title={meta.title}
          startAt={startIndex(body, si)}
          onExit={() => setPresenting(false)}
        />
      )}

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

/**
 * The alignment controls, declared once. The toolbar and the inspector offer
 * the same eight actions, so they read from the same list rather than drifting
 * apart one label at a time.
 */
const ALIGN_ACTIONS: { edge: AlignEdge; label: string; Icon: typeof IcObjectAlignLeft }[] = [
  { edge: 'left', label: 'Align left', Icon: IcObjectAlignLeft },
  { edge: 'hcenter', label: 'Align horizontal centres', Icon: IcObjectAlignCenter },
  { edge: 'right', label: 'Align right', Icon: IcObjectAlignRight },
  { edge: 'top', label: 'Align top', Icon: IcObjectAlignTop },
  { edge: 'vcenter', label: 'Align vertical centres', Icon: IcObjectAlignMiddle },
  { edge: 'bottom', label: 'Align bottom', Icon: IcObjectAlignBottom },
]

const DISTRIBUTE_ACTIONS: { axis: DistributeAxis; label: string; Icon: typeof IcObjectAlignLeft }[] = [
  { axis: 'h', label: 'Distribute horizontally', Icon: IcObjectDistributeH },
  { axis: 'v', label: 'Distribute vertically', Icon: IcObjectDistributeV },
]

/**
 * The eight alignment controls. One component, two homes — a single element
 * (aligned to the slide) and a multi-selection (aligned to each other) — so
 * the two can never offer different actions.
 */
function AlignCluster({
  count,
  onAlign,
  onDistribute,
}: {
  count: number
  onAlign: (edge: AlignEdge) => void
  onDistribute: (axis: DistributeAxis) => void
}) {
  const relativeTo = count === 1 ? 'the slide' : 'the selection'
  return (
    <div className="grid grid-cols-4 gap-1">
      {ALIGN_ACTIONS.map(({ edge, label, Icon }) => (
        <button
          key={edge}
          className="toolbar-control toolbar-control--sm"
          title={`${label} — relative to ${relativeTo}`}
          aria-label={label}
          onClick={() => onAlign(edge)}
        >
          <Icon size={14} />
        </button>
      ))}
      {DISTRIBUTE_ACTIONS.map(({ axis, label, Icon }) => (
        <button
          key={axis}
          className="toolbar-control toolbar-control--sm"
          title={count < 3 ? 'Select at least three elements' : label}
          aria-label={label}
          disabled={count < 3}
          onClick={() => onDistribute(axis)}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  )
}

/** What the typography panel can do, gathered so the props stay legible. */
interface TextActions {
  setStyleRef: (name: TextStyleName | undefined) => void
  setOverride: <K extends keyof TextStyleSpec>(key: K, value: TextStyleSpec[K] | undefined) => void
  setBoxProp: (patch: { valign?: 'top' | 'middle' | 'bottom'; padding?: number; autoSize?: AutoSizeMode }) => void
  applyRemedy: (mode: AutoSizeMode, report: OverflowReport) => void
  updateStyle: () => void
}

/** What the master panel can do, gathered so the Inspector props stay legible. */
interface MasterActions {
  add: (master: PresentMaster) => void
  remove: (id: string) => void
  rename: (id: string, name: string) => void
  setToken: (id: string, key: keyof ThemeTokens, value: string | number | undefined) => void
  assign: (id: string | undefined) => void
  setFurniture: (id: string, patch: MasterFurniture) => void
}

/**
 * What this element has changed about its placeholder (19E.2).
 *
 * An override is not a mistake — a title nudged 20px left is a decision. It
 * just has to be visible, and undoable one property at a time, so applying a
 * layout never feels like a trap.
 */
function LayoutOverrides({
  selected,
  layoutId,
  tokens,
  readOnly,
  onRevert,
}: {
  selected: PresentElement
  layoutId: string | undefined
  tokens: ThemeTokens
  readOnly: boolean
  onRevert: (key: OverrideKey) => void
}) {
  const ph = placeholderFor(layoutId, selected)
  if (!ph) return null
  const keys = placeholderOverrides(selected, ph, tokens)
  return (
    <>
      <div className="insp-h">Placeholder · {selected.role}</div>
      {keys.length === 0 ? (
        <p className="text-[10.5px] text-muted">Matches the layout exactly.</p>
      ) : (
        <>
          <p className="mb-1 text-[10.5px] text-muted">
            {keys.length} {keys.length === 1 ? 'property overrides' : 'properties override'} the
            layout.
          </p>
          <div className="flex flex-wrap gap-1">
            {keys.map((k) => (
              <button
                key={k}
                className="toolbar-control toolbar-control--sm text-[10px]"
                title={`Revert ${OVERRIDE_LABEL[k]} to the layout`}
                aria-label={`Revert ${OVERRIDE_LABEL[k]}`}
                disabled={readOnly}
                onClick={() => onRevert(k)}
              >
                <span aria-hidden>↺ {OVERRIDE_LABEL[k]}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

/**
 * The deck status bar (19E.1) — where you are, what is on the slide, and
 * whether the last edit is actually on disk. "Saved" here is derived from the
 * persistence queue, not from a timer, so it never claims more than it knows.
 */
function StatusBar({
  slideIndex,
  slideCount,
  presentableCount,
  objectCount,
  selectedCount,
  schemaVersion,
  unsaved,
  readOnly,
}: {
  slideIndex: number
  slideCount: number
  presentableCount: number
  objectCount: number
  selectedCount: number
  schemaVersion: number
  unsaved: boolean
  readOnly: boolean
}) {
  const hidden = slideCount - presentableCount
  return (
    <div
      className="flex flex-none items-center gap-3 border-t border-bord px-3 py-1 text-[10.5px] text-muted"
      role="status"
    >
      <span className="tabular-nums">
        Slide {slideIndex + 1} of {slideCount}
      </span>
      {hidden > 0 && (
        <span className="tabular-nums" title="Hidden slides are left out of every export">
          {presentableCount} presented
        </span>
      )}
      <span className="tabular-nums">
        {objectCount} {objectCount === 1 ? 'object' : 'objects'}
        {selectedCount > 0 && ` · ${selectedCount} selected`}
      </span>
      <span className="ml-auto">
        {readOnly ? 'Read-only' : unsaved ? 'Saving…' : 'Saved'}
      </span>
      <span title="Deck schema version">v{schemaVersion}</span>
    </div>
  )
}

/* ==================== contextual inspector ==================== */

function Inspector({
  body,
  slide,
  slideIndex,
  themeColors,
  selectedEls,
  selected,
  maxZ,
  readOnly,
  onPatchOne,
  onPatchSlide,
  onDeleteSelection,
  onAlign,
  onDistribute,
  onLayer,
  onToggleFlag,
  onReplaceImage,
  onSeal,
  onToggleSlideHidden,
  onSetReviewStatus,
  onSetTheme,
  onSetTransition,
  onSetTransitionMs,
  onPreviewTransition,
  reducedMotion,
  slideTokens,
  masterActions,
  onRevertOverride,
  overflow,
  textActions,
  linkSources,
  linkActions,
  updateAllLinked,
  openLinkedSource,
}: {
  body: PresentationBody
  slide: PresentSlide
  slideIndex: number
  themeColors: { bg: string; text: string; accent: string }
  selectedEls: PresentElement[]
  selected: PresentElement | null
  maxZ: number
  readOnly: boolean
  onPatchOne: (fn: (e: PresentElement) => PresentElement, opts?: { coalesceKey?: string }) => void
  onPatchSlide: (fn: (s: PresentSlide) => PresentSlide, opts?: { coalesceKey?: string }) => void
  onDeleteSelection: () => void
  onAlign: (edge: AlignEdge) => void
  onDistribute: (axis: DistributeAxis) => void
  onLayer: (mode: LayerMode) => void
  onToggleFlag: (flag: 'locked' | 'hidden') => void
  onReplaceImage: (id: string) => void
  onSeal: () => void
  onToggleSlideHidden: () => void
  onSetReviewStatus: (status: SlideReviewStatus | undefined) => void
  onSetTheme: (theme: PresentTheme) => void
  onSetTransition: (t: SlideTransition) => void
  onSetTransitionMs: (ms: number) => void
  onPreviewTransition: () => void
  reducedMotion: boolean
  slideTokens: ThemeTokens
  masterActions: MasterActions
  onRevertOverride: (key: OverrideKey) => void
  overflow: OverflowReport | null
  textActions: TextActions
  linkSources: ReadonlyMap<string, SourceState>
  linkActions: {
    goTo: (slideIndex: number, elementId: string) => void
    updateOne: (item: LinkedItem) => Promise<void> | void
    detach: (item: LinkedItem) => void
  }
  updateAllLinked: () => void
  openLinkedSource: (item: LinkedItem) => void
}) {
  const count = selectedEls.length
  const anyLocked = selectedEls.some((e) => e.locked)
  const anyHidden = selectedEls.some((e) => e.hidden)

  /**
   * Three scopes (19E.1). The panel follows the selection — pick an element
   * and it shows the element — but Deck stays reachable, and a selection
   * change pulls you back out of it so the panel is never describing
   * something you are no longer looking at.
   */
  const [scope, setScope] = useState<InspectorScope>(count ? 'element' : 'slide')
  const hasSelection = count > 0
  useEffect(() => {
    setScope(hasSelection ? 'element' : 'slide')
  }, [hasSelection])

  const presentable = presentableSlides(body).length
  const hiddenCount = body.slides.length - presentable

  return (
    <aside className="flex w-56 flex-none flex-col border-l border-bord" aria-label="Inspector">
      <div className="flex flex-none border-b border-bord" role="tablist" aria-label="Inspector scope">
        {(['slide', 'element', 'deck'] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={scope === s}
            className={`flex-1 border-b-2 px-1 py-1.5 text-[11px] capitalize ${
              scope === s
                ? 'border-accent text-ink'
                : 'border-transparent text-muted hover:text-ink'
            }`}
            onClick={() => setScope(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      {scope === 'slide' && (
        <>
          <div className="insp-h">Slide {slideIndex + 1}</div>
          <label className="flex items-center gap-2 text-[11px] text-muted">
            Background
            <input
              type="color"
              className="h-5 w-8 cursor-pointer border-0 bg-transparent p-0"
              value={slide.background ?? themeColors.bg}
              aria-label="Slide background color"
              disabled={readOnly}
              onChange={(e) => {
                const v = e.target.value
                onPatchSlide((s) => ({ ...s, background: v }), { coalesceKey: `bg-${slide.id}` })
              }}
              onBlur={onSeal}
            />
            {slide.background && (
              <button
                className="toolbar-control toolbar-control--sm text-[9px]"
                title="Reset to theme background"
                aria-label="Reset to theme background"
                onClick={() => onPatchSlide((s) => ({ ...s, background: null }))}
              >
                <IcX size={10} />
              </button>
            )}
          </label>

          <div className="insp-h">In the presentation</div>
          <button
            className="btn w-full justify-start"
            aria-pressed={slide.hidden === true}
            disabled={readOnly}
            onClick={onToggleSlideHidden}
          >
            {slide.hidden ? <IcEyeOff size={12} /> : <IcEye size={12} />}
            {slide.hidden ? 'Hidden — not exported' : 'Shown'}
          </button>
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
            A hidden slide stays in the deck and stays editable. It is left out
            of PDF and PPTX export.
          </p>

          <div className="insp-h">Transition</div>
          <select
            className="field h-6 w-full cursor-pointer px-1 py-0 text-[11.5px]"
            aria-label="Slide transition"
            disabled={readOnly}
            value={slide.transition ?? 'none'}
            onChange={(e) => onSetTransition(e.target.value as SlideTransition)}
          >
            {TRANSITIONS.map((t) => (
              <option key={t} value={t}>
                {TRANSITION_LABEL[t]}
              </option>
            ))}
          </select>
          {slide.transition && slide.transition !== 'none' && (
            <>
              <label className="mt-1 flex items-center gap-2 text-[10px] text-muted uppercase">
                <span className="w-14 flex-none">Duration</span>
                <input
                  type="range"
                  min={60}
                  max={1200}
                  step={20}
                  className="min-w-0 flex-1"
                  aria-label="Transition duration"
                  disabled={readOnly}
                  value={slide.transitionMs ?? DEFAULT_TRANSITION_MS}
                  onChange={(e) => onSetTransitionMs(Number(e.target.value))}
                />
                <span className="w-10 flex-none text-right tabular-nums">
                  {slide.transitionMs ?? DEFAULT_TRANSITION_MS}
                </span>
              </label>
              <button className="btn mt-1 w-full" onClick={onPreviewTransition}>
                Preview on this slide
              </button>
              {reducedMotion && (
                <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
                  Your system asks for reduced motion, so this transition will
                  not run for you — it is still stored, and will run for someone
                  who has not asked for that.
                </p>
              )}
            </>
          )}
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
            Transitions play when presenting. PDF has no concept of one, and the
            PPTX writer does not emit them — the export reports that.
          </p>

          <div className="insp-h">Review</div>
          <select
            className="field h-6 w-full cursor-pointer px-1 py-0 text-[11.5px]"
            aria-label="Review status"
            disabled={readOnly}
            value={slide.reviewStatus ?? ''}
            onChange={(e) =>
              onSetReviewStatus((e.target.value || undefined) as SlideReviewStatus | undefined)
            }
          >
            <option value="">Not set</option>
            <option value="draft">Draft</option>
            <option value="review">In review</option>
            <option value="approved">Approved</option>
          </select>
        </>
      )}

      {scope === 'deck' && (
        <>
          <div className="insp-h">Theme</div>
          <select
            className="field h-6 w-full cursor-pointer px-1 py-0 text-[11.5px]"
            aria-label="Deck theme"
            value={body.theme}
            disabled={readOnly}
            onChange={(e) => onSetTheme(e.target.value as PresentTheme)}
          >
            <option value="plain">Plain</option>
            <option value="ink">Ink</option>
            <option value="accent">Deep blue</option>
          </select>

          <div className="insp-h">Structure</div>
          <dl className="flex flex-col gap-1 text-[11px]">
            <DeckStat label="Slides" value={String(body.slides.length)} />
            <DeckStat
              label="In the presentation"
              value={hiddenCount ? `${presentable} of ${body.slides.length}` : String(presentable)}
            />
            <DeckStat label="Sections" value={String(body.sections?.length ?? 0)} />
            <DeckStat label="Schema" value={`v${body.version}`} />
          </dl>
          {hiddenCount > 0 && (
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
              {hiddenCount} hidden {hiddenCount === 1 ? 'slide is' : 'slides are'} kept in the deck
              and left out of every export.
            </p>
          )}

          <LinkedContentPanel
            body={body}
            sources={linkSources}
            readOnly={readOnly}
            onGoTo={linkActions.goTo}
            onUpdateOne={(item) => void linkActions.updateOne(item)}
            onUpdateAll={() => void updateAllLinked()}
            onDetach={linkActions.detach}
            onOpenSource={(item) => openLinkedSource(item)}
          />

          <MasterPanel
            body={body}
            slide={slide}
            readOnly={readOnly}
            onAddMaster={masterActions.add}
            onRemoveMaster={masterActions.remove}
            onRenameMaster={masterActions.rename}
            onSetToken={masterActions.setToken}
            onAssignToSlide={masterActions.assign}
            onSetFurniture={masterActions.setFurniture}
          />
        </>
      )}

      {scope === 'element' && count === 0 && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Nothing is selected. Pick an element on the canvas or in the layers
          column to edit it.
        </p>
      )}

      {scope === 'element' && count >= 2 && (
        <>
          <div className="insp-h">{count} elements</div>

          {/* The panel used to point at the toolbar. With several things
              selected this is where you are looking, so the alignment lives
              here too — same actions, same icons, one fewer redirection. */}
          <AlignCluster count={count} onAlign={onAlign} onDistribute={onDistribute} />
          <p className="mt-1.5 mb-2 text-[11px] leading-relaxed text-muted">
            Move with drag or arrow keys.
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

      {scope === 'element' && count === 1 && selected && (
        <>
          <div className="insp-h">Align to slide</div>
          <AlignCluster count={count} onAlign={onAlign} onDistribute={onDistribute} />

          <LayoutOverrides
            selected={selected}
            layoutId={slide.layoutId}
            tokens={slideTokens}
            readOnly={readOnly}
            onRevert={onRevertOverride}
          />
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

          {selected.kind === 'text' && (
            <>
              <TextControls selected={selected} onPatchOne={onPatchOne} onSeal={onSeal} />
              <TypographyPanel
                el={selected}
                render={resolveTextRender(selected, slideTokens, body.textStyles)}
                overflow={overflow}
                readOnly={readOnly}
                onSetStyleRef={textActions.setStyleRef}
                onSetOverride={textActions.setOverride}
                onSetBoxProp={textActions.setBoxProp}
                onApplyRemedy={textActions.applyRemedy}
                onUpdateStyle={textActions.updateStyle}
              />
            </>
          )}
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
      </div>
    </aside>
  )
}

function DeckStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  )
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
      {/* Migrated off `.tbtn` onto the toolbar primitive (12.4, closing #48).
          These already said `aria-pressed`; what they did not have was a state
          anyone could SEE without colour — `--accent` on `--accent-soft` is
          2.38:1 in light, under the 3:1 a state graphic owes (WCAG 1.4.11) —
          nor a name behind the glyph, nor a 24px target. The primitive brings
          all three, and `is-active` is not a class this codebase still has. */}
      <div className="mt-1.5 flex gap-1">
        <button
          className="toolbar-control toolbar-control--sm font-bold"
          title="Bold"
          aria-label="Bold"
          aria-pressed={selected.bold}
          onClick={() => onPatchOne((el) => (el.kind === 'text' ? { ...el, bold: !el.bold } : el))}
        >
          <span aria-hidden>B</span>
        </button>
        <button
          className="toolbar-control toolbar-control--sm italic"
          title="Italic"
          aria-label="Italic"
          aria-pressed={selected.italic}
          onClick={() => onPatchOne((el) => (el.kind === 'text' ? { ...el, italic: !el.italic } : el))}
        >
          <span aria-hidden>I</span>
        </button>
        {(['left', 'center', 'right'] as const).map((a) => (
          <button
            key={a}
            className="toolbar-control toolbar-control--sm"
            title={`Align ${a}`}
            aria-label={`Align ${a}`}
            aria-pressed={selected.align === a}
            onClick={() => onPatchOne((el) => (el.kind === 'text' ? { ...el, align: a } : el))}
          >
            <span aria-hidden>{a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}</span>
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
            className="toolbar-control toolbar-control--sm text-[9px]"
            title="Use theme color"
            aria-label="Use theme color"
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
      <div className="insp-h">Frame</div>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-[10px] text-muted uppercase">
          Fit
          <select
            className="field mt-0.5 h-6 w-full cursor-pointer px-1 py-0 text-[11.5px]"
            aria-label="Image fit"
            value={selected.fit ?? 'fill'}
            onChange={(e) =>
              onPatchOne((el) => (el.kind === 'image' ? { ...el, fit: e.target.value as ImageFit } : el))
            }
          >
            <option value="fill">Fill</option>
            <option value="cover">Cover</option>
            <option value="contain">Contain</option>
          </select>
        </label>
        <label className="text-[10px] text-muted uppercase">
          Radius
          <input
            type="number"
            min={0}
            className="field mt-0.5 w-full !px-1.5 !py-0.5 text-[11.5px]"
            aria-label="Image radius"
            value={selected.radius ?? 0}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n) && n >= 0) {
                onPatchOne((el) => (el.kind === 'image' ? { ...el, radius: n } : el), {
                  coalesceKey: `radius-${selected.id}`,
                })
              }
            }}
          />
        </label>
      </div>

      {/* crop and focal point are a window onto the source, never a rewrite */}
      <div className="insp-h">Crop</div>
      <div className="grid grid-cols-2 gap-1.5">
        {(['x', 'y', 'w', 'h'] as const).map((k) => (
          <label key={k} className="text-[10px] text-muted uppercase">
            {k === 'w' ? 'width %' : k === 'h' ? 'height %' : `${k} %`}
            <input
              type="number"
              min={0}
              max={100}
              className="field mt-0.5 w-full !px-1.5 !py-0.5 text-[11.5px]"
              aria-label={`Crop ${k}`}
              value={Math.round(normalizeCrop(selected.crop)[k] * 100)}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (!Number.isFinite(n)) return
                onPatchOne(
                  (el) =>
                    el.kind === 'image'
                      ? { ...el, crop: normalizeCrop({ ...normalizeCrop(el.crop), [k]: n / 100 }) }
                      : el,
                  { coalesceKey: `crop-${k}-${selected.id}` },
                )
              }}
            />
          </label>
        ))}
      </div>
      {!isFullCrop(normalizeCrop(selected.crop)) && (
        <button
          className="btn mt-1 w-full"
          onClick={() => onPatchOne((el) => (el.kind === 'image' ? { ...el, crop: undefined } : el))}
        >
          Reset crop — the whole picture is still there
        </button>
      )}

      <div className="insp-h">Focal point</div>
      <div className="grid grid-cols-2 gap-1.5">
        {(['x', 'y'] as const).map((k) => (
          <label key={k} className="text-[10px] text-muted uppercase">
            {k} %
            <input
              type="number"
              min={0}
              max={100}
              className="field mt-0.5 w-full !px-1.5 !py-0.5 text-[11.5px]"
              aria-label={`Focal ${k}`}
              value={Math.round(normalizeFocal(selected.focalPoint)[k] * 100)}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (!Number.isFinite(n)) return
                onPatchOne(
                  (el) =>
                    el.kind === 'image'
                      ? { ...el, focalPoint: normalizeFocal({ ...normalizeFocal(el.focalPoint), [k]: n / 100 }) }
                      : el,
                  { coalesceKey: `focal-${k}-${selected.id}` },
                )
              }}
            />
          </label>
        ))}
      </div>

      <div className="insp-h">Adjustments</div>
      {(['brightness', 'contrast', 'saturation'] as const).map((k) => (
        <label key={k} className="mt-1 flex items-center gap-2 text-[10px] text-muted uppercase">
          <span className="w-16 flex-none">{k}</span>
          <input
            type="range"
            min={-100}
            max={100}
            className="min-w-0 flex-1"
            aria-label={k}
            value={selected.adjustments?.[k] ?? 0}
            onChange={(e) =>
              onPatchOne(
                (el) =>
                  el.kind === 'image'
                    ? { ...el, adjustments: sanitizeAdjustments({ ...(el.adjustments ?? {}), [k]: Number(e.target.value) }) }
                    : el,
                { coalesceKey: `adj-${k}-${selected.id}` },
              )
            }
          />
          <span className="w-8 flex-none text-right tabular-nums">
            {selected.adjustments?.[k] ?? 0}
          </span>
        </label>
      ))}
      <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
        Crop, focal point and adjustments are stored as metadata. The original
        is untouched and exports at full resolution.
      </p>

      <button className="btn mt-2 w-full" onClick={onReplace}>
        <IcImage size={12} /> Replace, keep the frame
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
          className="toolbar-control toolbar-control--sm text-[9px]"
          title="No fill"
          aria-label="No fill"
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
