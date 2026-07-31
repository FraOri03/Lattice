import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { usePhotoStore } from '@/store/photoStore'
import { useI18n } from '@/lib/i18n'
import { toast } from '@/components/ui/Toaster'
import { ActionIcon } from '@/components/ActionIcons'
import {
  ToolbarAction,
  ToolbarGroup,
  ToolbarRoot,
  ToolbarSeparator,
  ToolbarToggle,
} from '@/components/ui/toolbar'
import { PhotoCanvas } from '@/components/photo/PhotoCanvas'
import { PhotoLibrary } from '@/components/photo/PhotoLibrary'
import { PhotoInspector } from '@/components/photo/PhotoInspector'
import { PhotoTimeline } from '@/components/photo/PhotoTimeline'
import { PhotoAI } from '@/components/photo/PhotoAI'
import {
  IcBulb,
  IcCamera,
  IcCube,
  IcCursor,
  IcHand,
  IcRedo,
  IcSparkles,
  IcUndo,
  IcUserPlus,
} from '@/components/Icons'
import type { PhotoSceneExport } from '@/types/photo'

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

/**
 * Toolbar above the canvas: tools, quick add, undo/redo, import/export, AI.
 *
 * Reference implementation for the Phase 11.1 primitives — Photo is the mode
 * that already had the select/pan model, so it is what the shared components
 * had to be able to express, rather than a mode bent to fit them.
 */
export function PhotoToolbar() {
  const t = useI18n()
  const tool = usePhotoStore((s) => s.tool)
  const setTool = usePhotoStore((s) => s.setTool)
  const addElement = usePhotoStore((s) => s.addElement)
  const undo = usePhotoStore((s) => s.undo)
  const redo = usePhotoStore((s) => s.redo)
  const history = usePhotoStore((s) => s.history)
  const historyIndex = usePhotoStore((s) => s.historyIndex)
  const shots = usePhotoStore((s) => s.shots)
  const loadFromJSON = usePhotoStore((s) => s.loadFromJSON)
  const aiPanelOpen = usePhotoStore((s) => s.aiPanelOpen)
  const setAiPanelOpen = usePhotoStore((s) => s.setAiPanelOpen)

  const fileRef = useRef<HTMLInputElement>(null)

  const handleExport = () => {
    const data: PhotoSceneExport = { version: '1.2', shots }
    const uri =
      'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2))
    const link = document.createElement('a')
    link.href = uri
    link.download = `photo-set-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-importing the same file
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result
      const ok = typeof text === 'string' && loadFromJSON(text)
      if (ok) toast.success('Scene imported', 'The shot list replaced the current scene.')
      else toast.warning('Import failed', 'Not a compatible photo-set JSON file.')
    }
    reader.readAsText(file)
  }

  return (
    <ToolbarRoot
      label={t.toolbar.photo.label}
      className="h-10 flex-none gap-2 border-b border-bord bg-panel px-2"
    >
      <ToolbarGroup
        label={t.toolbar.groups.select}
        className="rounded-lg border border-bord bg-panel2 p-0.5"
      >
        <ToolbarToggle
          icon={<IcCursor size={12} />}
          label={t.toolbar.photo.select}
          description={t.toolbar.photo.selectTip}
          shortcut="V"
          content="icon-text"
          labelClassName="hidden lg:inline"
          pressed={tool === 'select'}
          onRun={() => setTool('select')}
        />
        <ToolbarToggle
          icon={<IcHand size={12} />}
          label={t.toolbar.photo.pan}
          description={t.toolbar.photo.panTip}
          shortcut="H"
          content="icon-text"
          labelClassName="hidden lg:inline"
          pressed={tool === 'pan'}
          onRun={() => setTool('pan')}
        />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup label={t.toolbar.groups.create}>
        <ToolbarAction
          icon={<IcCamera size={15} />}
          label={t.toolbar.photo.addCamera}
          onRun={() => addElement('camera', 0, 0)}
        />
        <ToolbarAction
          icon={<IcBulb size={15} />}
          label={t.toolbar.photo.addLight}
          onRun={() => addElement('light', 0, 0)}
        />
        <ToolbarAction
          icon={<IcUserPlus size={15} />}
          label={t.toolbar.photo.addPerson}
          onRun={() => addElement('person', 0, 0)}
        />
        <ToolbarAction
          icon={<IcCube size={15} />}
          label={t.toolbar.photo.addProp}
          onRun={() => addElement('prop', 0, 0)}
        />
      </ToolbarGroup>

      <div className="flex-1" />

      <ToolbarGroup label={t.toolbar.groups.history}>
        <ToolbarAction
          icon={<IcUndo size={14} />}
          label={t.toolbar.photo.undo}
          shortcut="Ctrl+Z"
          disabled={historyIndex <= 0}
          onRun={undo}
        />
        <ToolbarAction
          icon={<IcRedo size={14} />}
          label={t.toolbar.photo.redo}
          shortcut="Ctrl+Y"
          disabled={historyIndex >= history.length - 1}
          onRun={redo}
        />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup label={t.toolbar.groups.integrate}>
        <ToolbarAction
          icon={<ActionIcon.Import size={14} />}
          label={t.toolbar.photo.importScene}
          onRun={() => fileRef.current?.click()}
        />
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImport}
          className="hidden"
          aria-hidden
        />
        <ToolbarAction
          icon={<ActionIcon.Export size={14} />}
          label={t.toolbar.photo.exportScene}
          onRun={handleExport}
        />
        <ToolbarSeparator />
        <ToolbarToggle
          icon={<IcSparkles size={13} />}
          label={t.toolbar.photo.ai}
          description={t.toolbar.photo.aiTip}
          content="icon-text"
          labelClassName="hidden md:inline"
          pressed={aiPanelOpen}
          onRun={() => setAiPanelOpen(!aiPanelOpen)}
        />
      </ToolbarGroup>
    </ToolbarRoot>
  )
}

/**
 * Photo mode: 2D studio/set planner (cameras, lights, people, props on a
 * cm grid) with per-project scenes. Lazy-loaded from ModeWorkspaces.
 */
export default function PhotoWorkspace() {
  const activeProjectId = useStore((s) => s.activeProjectId)
  const loadProject = usePhotoStore((s) => s.loadProject)
  const ready = usePhotoStore((s) => s.projectId === activeProjectId && s.shots.length > 0)
  const aiPanelOpen = usePhotoStore((s) => s.aiPanelOpen)

  useEffect(() => {
    loadProject(activeProjectId)
  }, [activeProjectId, loadProject])

  // Mode-scoped hotkeys (listener lives only while Photo mode is mounted)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = usePhotoStore.getState()
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        s.redo()
        return
      }
      if (isTyping(e.target)) return
      if (e.key.toLowerCase() === 'v') s.setTool('select')
      if (e.key.toLowerCase() === 'h') s.setTool('pan')
      if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedElementId) {
        const shot = s.shots.find((sh) => sh.id === s.activeShotId)
        const el = shot?.elements.find((it) => it.id === s.selectedElementId)
        if (el && !el.locked) s.deleteElement(el.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!ready) {
    return (
      <section className="flex h-full min-w-0 flex-1 items-center justify-center bg-panel text-xs text-muted">
        Loading photo workspace…
      </section>
    )
  }

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-panel">
      <PhotoToolbar />
      <div className="flex min-h-0 flex-1">
        <PhotoLibrary />
        <div className="relative min-w-0 flex-1">
          <PhotoCanvas />
        </div>
        {aiPanelOpen && <PhotoAI />}
        <PhotoInspector />
      </div>
      <PhotoTimeline />
    </section>
  )
}
