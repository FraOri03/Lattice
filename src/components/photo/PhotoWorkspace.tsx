import { useEffect, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { usePhotoStore } from '@/store/photoStore'
import { toast } from '@/components/ui/Toaster'
import { ActionIcon } from '@/components/ActionIcons'
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

/** Toolbar above the canvas: tools, quick add, undo/redo, import/export, AI. */
function PhotoToolbar() {
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
    <div className="flex h-10 flex-none items-center gap-2 border-b border-bord bg-panel px-2">
      {/* tools */}
      <div className="flex rounded-lg border border-bord bg-panel2 p-0.5">
        <button
          onClick={() => setTool('select')}
          className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ${
            tool === 'select' ? 'bg-panel text-ink shadow-sm' : 'text-muted hover:text-ink'
          }`}
          title="Select tool (V)"
          aria-pressed={tool === 'select'}
        >
          <IcCursor size={12} /> <span className="hidden lg:inline">Select</span>
        </button>
        <button
          onClick={() => setTool('pan')}
          className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium ${
            tool === 'pan' ? 'bg-panel text-ink shadow-sm' : 'text-muted hover:text-ink'
          }`}
          title="Pan tool (H, or hold Space)"
          aria-pressed={tool === 'pan'}
        >
          <IcHand size={12} /> <span className="hidden lg:inline">Pan</span>
        </button>
      </div>

      <span className="h-4 w-px bg-bord" />

      {/* quick add */}
      <div className="flex items-center gap-0.5">
        <button
          className="icon-btn"
          onClick={() => addElement('camera', 0, 0)}
          title="Add camera"
          aria-label="Add camera"
        >
          <IcCamera size={15} />
        </button>
        <button
          className="icon-btn"
          onClick={() => addElement('light', 0, 0)}
          title="Add light source"
          aria-label="Add light source"
        >
          <IcBulb size={15} />
        </button>
        <button
          className="icon-btn"
          onClick={() => addElement('person', 0, 0)}
          title="Add person"
          aria-label="Add person"
        >
          <IcUserPlus size={15} />
        </button>
        <button
          className="icon-btn"
          onClick={() => addElement('prop', 0, 0)}
          title="Add generic prop"
          aria-label="Add generic prop"
        >
          <IcCube size={15} />
        </button>
      </div>

      <div className="flex-1" />

      {/* undo/redo */}
      <div className="flex items-center gap-0.5">
        <button
          className="icon-btn disabled:opacity-30"
          onClick={undo}
          disabled={historyIndex <= 0}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <IcUndo size={14} />
        </button>
        <button
          className="icon-btn disabled:opacity-30"
          onClick={redo}
          disabled={historyIndex >= history.length - 1}
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
        >
          <IcRedo size={14} />
        </button>
      </div>

      <span className="h-4 w-px bg-bord" />

      {/* import / export */}
      <button
        className="icon-btn"
        onClick={() => fileRef.current?.click()}
        title="Import scene JSON"
        aria-label="Import scene JSON"
      >
        <ActionIcon.Import size={14} />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        onChange={handleImport}
        className="hidden"
        aria-hidden
      />
      <button
        className="icon-btn"
        onClick={handleExport}
        title="Export scene as JSON"
        aria-label="Export scene as JSON"
      >
        <ActionIcon.Export size={14} />
      </button>

      <span className="h-4 w-px bg-bord" />

      <button
        className={`btn ${aiPanelOpen ? '!border-accent !text-accent' : ''}`}
        onClick={() => setAiPanelOpen(!aiPanelOpen)}
        title="AI set designer"
        aria-pressed={aiPanelOpen}
      >
        <IcSparkles size={13} />
        <span className="hidden md:inline">AI assistant</span>
      </button>
    </div>
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
