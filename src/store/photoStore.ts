import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nid } from '@/lib/id'
import type {
  PhotoCameraElement,
  PhotoElement,
  PhotoElementType,
  PhotoLightElement,
  PhotoPersonElement,
  PhotoPropElement,
  PhotoSceneSnapshot,
  PhotoShot,
  PhotoTool,
} from '@/types/photo'

/**
 * Photo mode store (ported from the standalone Photoshooting tool).
 *
 * The editor works on a FLAT scene (shots + activeShotId) exactly like the
 * original tool; per-project persistence happens around it: `scenes` maps
 * projectId → snapshot, `loadProject` swaps the flat scene when the active
 * project changes, and `partialize` folds the live scene back into the map
 * on every persisted write — so a reload never loses edits.
 *
 * Scenes are local-only for now (no Drive sync / realtime), matching the
 * tool's maturity; undo history is session-only and capped.
 */

const HISTORY_LIMIT = 50

const deepCopy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** Full-frame horizontal FOV for a focal length (36mm sensor width). */
const fovForFocal = (focal: number) =>
  Math.round(2 * Math.atan(36 / (2 * focal)) * (180 / Math.PI))

/** Starter scene: subject + camera + two lights + backdrop. */
function seedShots(): PhotoShot[] {
  const elements: PhotoElement[] = [
    {
      id: nid('person'),
      type: 'person',
      name: 'Main subject',
      x: 0,
      y: 0,
      rotation: 90,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      zIndex: 1,
      locked: false,
      hidden: false,
      color: '#a855f7',
      role: 'Model',
      lookAngle: 270,
      personHeight: 175,
      pose: 'standing',
    } satisfies PhotoPersonElement,
    {
      id: nid('camera'),
      type: 'camera',
      name: 'Camera A',
      x: 0,
      y: 350,
      rotation: 270,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      zIndex: 2,
      locked: false,
      hidden: false,
      color: '#10b981',
      sensor: 'Full Frame',
      focalLength: 50,
      fov: 46,
      aperture: 'f/2.8',
      iso: 400,
      shutter: '1/50s',
      cameraHeight: 150,
      tilt: 0,
      pan: 270,
      roll: 0,
      cameraNumber: 'A',
      shotType: 'Medium',
      targetDistance: 350,
    } satisfies PhotoCameraElement,
    {
      id: nid('light'),
      type: 'light',
      name: 'Softbox key light',
      x: -160,
      y: 200,
      rotation: 320,
      scaleX: 1,
      scaleY: 1,
      opacity: 0.9,
      zIndex: 3,
      locked: false,
      hidden: false,
      color: '#FFE0B2',
      lightType: 'softbox',
      intensity: 80,
      colorTemperature: 5600,
      beamAngle: 65,
      falloff: 300,
      lightHeight: 200,
      showTargetLine: true,
      targetX: 0,
      targetY: 0,
    } satisfies PhotoLightElement,
    {
      id: nid('light'),
      type: 'light',
      name: 'Tube light rim',
      x: 100,
      y: -140,
      rotation: 120,
      scaleX: 1,
      scaleY: 1,
      opacity: 0.8,
      zIndex: 4,
      locked: false,
      hidden: false,
      color: '#E0F7FA',
      lightType: 'tube_light',
      intensity: 50,
      colorTemperature: 6500,
      beamAngle: 120,
      falloff: 200,
      lightHeight: 180,
      showTargetLine: false,
    } satisfies PhotoLightElement,
    {
      id: nid('prop'),
      type: 'prop',
      name: 'Backdrop',
      x: 0,
      y: -120,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      zIndex: 0,
      locked: true,
      hidden: false,
      color: '#3f3f46',
      propType: 'backdrop',
      customSvgPath: 'backdrop',
      width: 400,
      height: 15,
    } satisfies PhotoPropElement,
  ]
  return [
    {
      id: nid('shot'),
      number: 1,
      name: '01 - Master setup (medium wide)',
      description: 'Medium wide shot establishing the subject against the key softbox.',
      storyboardText:
        'Subject looks into the lens; the key light shapes the right side of the face for a soft chiaroscuro.',
      duration: '10s',
      priority: 'High',
      status: 'Planned',
      colorTag: '#10b981',
      checklist: [
        { id: nid('chk'), text: 'Place stands and softbox', done: true },
        { id: nid('chk'), text: 'Camera A at f/2.8, ISO 400', done: false },
      ],
      elements,
    },
  ]
}

interface PhotoState {
  /** persisted scenes, keyed by project id */
  scenes: Record<string, PhotoSceneSnapshot>
  /** project the flat scene below belongs to (null before first load) */
  projectId: string | null

  shots: PhotoShot[]
  activeShotId: string
  selectedElementId: string | null
  canvasScale: number
  canvasTranslateX: number
  canvasTranslateY: number
  tool: PhotoTool
  gridVisible: boolean
  gridSnap: boolean
  rulersVisible: boolean
  aiPanelOpen: boolean

  /** session-only undo/redo stacks of shots states */
  history: PhotoShot[][]
  historyIndex: number

  /** swap the flat scene to the given project (stashing the current one) */
  loadProject: (projectId: string) => void

  addElement: (
    type: PhotoElementType,
    x: number,
    y: number,
    customProps?: Partial<PhotoElement>,
  ) => void
  updateElement: (id: string, partial: Partial<PhotoElement>) => void
  deleteElement: (id: string) => void
  duplicateElement: (id: string) => void
  selectElement: (id: string | null) => void
  setCanvasTransform: (scale: number, tx: number, ty: number) => void
  setTool: (tool: PhotoTool) => void
  toggleGrid: () => void
  toggleSnap: () => void
  toggleRulers: () => void
  setAiPanelOpen: (open: boolean) => void

  addShot: () => void
  duplicateShot: (shotId: string) => void
  deleteShot: (shotId: string) => void
  selectShot: (shotId: string) => void
  updateShotProperties: (shotId: string, partial: Partial<PhotoShot>) => void

  /** snapshot current (or given) shots into the undo history */
  pushHistory: (customShots?: PhotoShot[]) => void
  undo: () => void
  redo: () => void

  loadFromJSON: (jsonString: string) => boolean
  /** replace the active shot's elements (AI generation / import) */
  loadRawElements: (elements: Partial<PhotoElement>[]) => void
  resetScene: () => void
}

/** Live flat scene folded back into the persisted map. */
function scenesWithCurrent(s: PhotoState): Record<string, PhotoSceneSnapshot> {
  if (!s.projectId) return s.scenes
  return {
    ...s.scenes,
    [s.projectId]: { shots: s.shots, activeShotId: s.activeShotId },
  }
}

export const usePhotoStore = create<PhotoState>()(
  persist(
    (set, get) => ({
      scenes: {},
      projectId: null,
      shots: [],
      activeShotId: '',
      selectedElementId: null,
      canvasScale: 1,
      canvasTranslateX: 400,
      canvasTranslateY: 300,
      tool: 'select',
      gridVisible: true,
      gridSnap: true,
      rulersVisible: true,
      aiPanelOpen: false,
      history: [],
      historyIndex: 0,

      loadProject: (projectId) => {
        const s = get()
        if (s.projectId === projectId && s.shots.length) return
        const scenes = scenesWithCurrent(s)
        const target: PhotoSceneSnapshot = scenes[projectId] ?? {
          shots: seedShots(),
          activeShotId: '',
        }
        const shots = target.shots.length ? target.shots : seedShots()
        const activeShotId = shots.some((sh) => sh.id === target.activeShotId)
          ? target.activeShotId
          : shots[0].id
        set({
          scenes,
          projectId,
          shots,
          activeShotId,
          selectedElementId: null,
          history: [deepCopy(shots)],
          historyIndex: 0,
        })
      },

      pushHistory: (customShots) => {
        const { shots, history, historyIndex } = get()
        const targetShots = customShots ?? shots
        // drop any redo tail, then cap the stack
        const newHistory = [...history.slice(0, historyIndex + 1), deepCopy(targetShots)].slice(
          -HISTORY_LIMIT,
        )
        set({
          history: newHistory,
          historyIndex: newHistory.length - 1,
          shots: targetShots,
        })
      },

      undo: () => {
        const { history, historyIndex } = get()
        if (historyIndex <= 0) return
        set({
          shots: deepCopy(history[historyIndex - 1]),
          historyIndex: historyIndex - 1,
          selectedElementId: null,
        })
      },

      redo: () => {
        const { history, historyIndex } = get()
        if (historyIndex >= history.length - 1) return
        set({
          shots: deepCopy(history[historyIndex + 1]),
          historyIndex: historyIndex + 1,
          selectedElementId: null,
        })
      },

      setCanvasTransform: (scale, tx, ty) =>
        set({
          canvasScale: Math.max(0.05, Math.min(20, scale)),
          canvasTranslateX: tx,
          canvasTranslateY: ty,
        }),

      setTool: (tool) => set({ tool }),
      toggleGrid: () => set((s) => ({ gridVisible: !s.gridVisible })),
      toggleSnap: () => set((s) => ({ gridSnap: !s.gridSnap })),
      toggleRulers: () => set((s) => ({ rulersVisible: !s.rulersVisible })),
      setAiPanelOpen: (aiPanelOpen) => set({ aiPanelOpen }),
      selectElement: (id) => set({ selectedElementId: id }),

      addElement: (type, x, y, customProps = {}) => {
        const { shots, activeShotId } = get()
        const id = nid(type)
        const all = shots.flatMap((s) => s.elements)
        const countOf = (t: PhotoElementType) => all.filter((e) => e.type === t).length

        const base = {
          id,
          type,
          name: `${type.toUpperCase()} ${countOf(type) + 1}`,
          x,
          y,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
          zIndex: 10,
          locked: false,
          hidden: false,
          color: '#3b82f6',
          notes: '',
        }

        let newElement: PhotoElement
        if (type === 'camera') {
          const letter = String.fromCharCode(65 + (countOf('camera') % 26))
          newElement = {
            ...base,
            type,
            name: `Camera ${letter}`,
            color: '#10b981',
            sensor: 'Full Frame',
            focalLength: 50,
            fov: 46,
            aperture: 'f/2.8',
            iso: 800,
            shutter: '1/50s',
            cameraHeight: 160,
            tilt: 0,
            pan: 0,
            roll: 0,
            cameraNumber: letter,
            shotType: 'Medium',
            targetDistance: 250,
          } satisfies PhotoCameraElement
        } else if (type === 'light') {
          newElement = {
            ...base,
            type,
            name: `Light ${countOf('light') + 1}`,
            color: '#f59e0b',
            lightType: 'softbox',
            intensity: 75,
            colorTemperature: 5600,
            beamAngle: 60,
            falloff: 300,
            lightHeight: 180,
            showTargetLine: false,
          } satisfies PhotoLightElement
        } else if (type === 'person') {
          newElement = {
            ...base,
            type,
            name: `Actor ${countOf('person') + 1}`,
            color: '#ec4899',
            role: 'Actor',
            lookAngle: 0,
            personHeight: 180,
            pose: 'standing',
          } satisfies PhotoPersonElement
        } else {
          newElement = {
            ...base,
            type,
            name: `Prop ${countOf(type) + 1}`,
            color: '#64748b',
            propType: 'box',
            width: 100,
            height: 100,
          } as PhotoPropElement
        }

        const merged = { ...newElement, ...customProps } as PhotoElement
        const updatedShots = shots.map((shot) =>
          shot.id === activeShotId
            ? { ...shot, elements: [...shot.elements, merged] }
            : shot,
        )
        get().pushHistory(updatedShots)
        set({ selectedElementId: id })
      },

      updateElement: (id, partial) => {
        const { shots, activeShotId } = get()
        const updatedShots = shots.map((shot) => {
          if (shot.id !== activeShotId) return shot
          return {
            ...shot,
            elements: shot.elements.map((el) => {
              if (el.id !== id) return el
              const updated = { ...el, ...partial } as PhotoElement
              // focal length drives the FOV (full-frame equivalent)
              if (el.type === 'camera' && 'focalLength' in partial && partial.focalLength) {
                ;(updated as PhotoCameraElement).fov = fovForFocal(partial.focalLength)
              }
              return updated
            }),
          }
        })
        // no history push per pixel — drags call pushHistory on mouse-up
        set({ shots: updatedShots })
      },

      deleteElement: (id) => {
        const { shots, activeShotId, selectedElementId } = get()
        const updatedShots = shots.map((shot) =>
          shot.id === activeShotId
            ? { ...shot, elements: shot.elements.filter((el) => el.id !== id) }
            : shot,
        )
        get().pushHistory(updatedShots)
        set({ selectedElementId: selectedElementId === id ? null : selectedElementId })
      },

      duplicateElement: (id) => {
        const { shots, activeShotId } = get()
        const currentShot = shots.find((s) => s.id === activeShotId)
        const source = currentShot?.elements.find((el) => el.id === id)
        if (!source) return
        const duplicated: PhotoElement = {
          ...deepCopy(source),
          id: nid(source.type),
          name: `${source.name} (copy)`,
          x: source.x + 30,
          y: source.y + 30,
          locked: false,
        }
        const updatedShots = shots.map((shot) =>
          shot.id === activeShotId
            ? { ...shot, elements: [...shot.elements, duplicated] }
            : shot,
        )
        get().pushHistory(updatedShots)
        set({ selectedElementId: duplicated.id })
      },

      addShot: () => {
        const { shots, activeShotId } = get()
        const currentShot = shots.find((s) => s.id === activeShotId)
        const newShot: PhotoShot = {
          id: nid('shot'),
          number: Math.max(...shots.map((s) => s.number), 0) + 1,
          name: `Shot ${Math.max(...shots.map((s) => s.number), 0) + 1} - New setup`,
          description: '',
          priority: 'Medium',
          status: 'Draft',
          checklist: [],
          // start from the current layout so consecutive setups evolve
          elements: currentShot ? deepCopy(currentShot.elements) : [],
        }
        get().pushHistory([...shots, newShot])
        set({ activeShotId: newShot.id, selectedElementId: null })
      },

      duplicateShot: (shotId) => {
        const { shots } = get()
        const source = shots.find((s) => s.id === shotId)
        if (!source) return
        const duplicated: PhotoShot = {
          ...deepCopy(source),
          id: nid('shot'),
          number: Math.max(...shots.map((s) => s.number), 0) + 1,
          name: `${source.name} (copy)`,
        }
        get().pushHistory([...shots, duplicated])
        set({ activeShotId: duplicated.id, selectedElementId: null })
      },

      deleteShot: (shotId) => {
        const { shots, activeShotId } = get()
        if (shots.length <= 1) return // a scene always keeps one shot
        const remaining = shots
          .filter((s) => s.id !== shotId)
          .map((s, idx) => ({ ...s, number: idx + 1 }))
        get().pushHistory(remaining)
        set({
          activeShotId: activeShotId === shotId ? remaining[0].id : activeShotId,
          selectedElementId: null,
        })
      },

      selectShot: (shotId) => set({ activeShotId: shotId, selectedElementId: null }),

      updateShotProperties: (shotId, partial) => {
        const { shots } = get()
        // direct write; text edits push history on blur/submit if needed
        set({
          shots: shots.map((shot) => (shot.id === shotId ? { ...shot, ...partial } : shot)),
        })
      },

      loadFromJSON: (jsonString) => {
        try {
          const data = JSON.parse(jsonString) as { shots?: PhotoShot[] }
          if (!Array.isArray(data.shots) || data.shots.length === 0) return false
          get().pushHistory(data.shots)
          set({ activeShotId: data.shots[0].id, selectedElementId: null })
          return true
        } catch {
          return false
        }
      },

      loadRawElements: (newElements) => {
        const { shots, activeShotId } = get()
        const prepared = newElements.map((el) => ({
          rotation: 0,
          ...el,
          id: el.id || nid(el.type ?? 'el'),
          scaleX: el.scaleX ?? 1,
          scaleY: el.scaleY ?? 1,
          opacity: el.opacity ?? 1,
          zIndex: el.zIndex ?? 10,
          locked: el.locked ?? false,
          hidden: el.hidden ?? false,
          color:
            el.color ||
            (el.type === 'camera' ? '#10b981' : el.type === 'light' ? '#f59e0b' : '#3b82f6'),
        })) as PhotoElement[]
        const updatedShots = shots.map((s) =>
          s.id === activeShotId ? { ...s, elements: prepared } : s,
        )
        get().pushHistory(updatedShots)
        set({ selectedElementId: null })
      },

      resetScene: () => {
        const shots = seedShots()
        set({
          shots,
          activeShotId: shots[0].id,
          selectedElementId: null,
          canvasScale: 1,
          canvasTranslateX: 400,
          canvasTranslateY: 300,
          tool: 'select',
          history: [deepCopy(shots)],
          historyIndex: 0,
        })
      },
    }),
    {
      name: 'lattice-photo-v1',
      version: 1,
      partialize: (s) => ({
        scenes: scenesWithCurrent(s),
        gridVisible: s.gridVisible,
        gridSnap: s.gridSnap,
        rulersVisible: s.rulersVisible,
      }),
    },
  ),
)
