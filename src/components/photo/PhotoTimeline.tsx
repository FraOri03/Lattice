import { useState } from 'react'
import { usePhotoStore } from '@/store/photoStore'
import {
  IcCheckCircle,
  IcChevronDown,
  IcChevronUp,
  IcCopy,
  IcListChecks,
  IcPlus,
  IcTrash,
} from '@/components/Icons'

const FIELD =
  'w-full rounded-md border border-bord bg-panel2 px-2 py-1 text-xs text-ink outline-none placeholder:text-muted focus:border-accent'
const LABEL = 'mb-1 block text-[10px] font-medium text-muted'

/**
 * Bottom strip of Photo mode: the shot list (each shot owns its layout)
 * plus the active shot's production details and to-do checklist.
 */
export function PhotoTimeline() {
  const shots = usePhotoStore((s) => s.shots)
  const activeShotId = usePhotoStore((s) => s.activeShotId)
  const addShot = usePhotoStore((s) => s.addShot)
  const deleteShot = usePhotoStore((s) => s.deleteShot)
  const duplicateShot = usePhotoStore((s) => s.duplicateShot)
  const selectShot = usePhotoStore((s) => s.selectShot)
  const updateShotProperties = usePhotoStore((s) => s.updateShotProperties)
  const pushHistory = usePhotoStore((s) => s.pushHistory)

  const [isCollapsed, setIsCollapsed] = useState(false)
  const [newChecklistItem, setNewChecklistItem] = useState('')

  const activeShot = shots.find((s) => s.id === activeShotId) ?? shots[0]
  if (!activeShot) return null

  const changeShot = (key: string, val: unknown) =>
    updateShotProperties(activeShot.id, { [key]: val })

  const handleAddChecklist = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newChecklistItem.trim()) return
    changeShot('checklist', [
      ...(activeShot.checklist ?? []),
      { id: crypto.randomUUID().slice(0, 8), text: newChecklistItem.trim(), done: false },
    ])
    setNewChecklistItem('')
    pushHistory()
  }

  const toggleChecklist = (itemId: string) =>
    changeShot(
      'checklist',
      (activeShot.checklist ?? []).map((item) =>
        item.id === itemId ? { ...item, done: !item.done } : item,
      ),
    )

  const deleteChecklist = (itemId: string) =>
    changeShot(
      'checklist',
      (activeShot.checklist ?? []).filter((item) => item.id !== itemId),
    )

  return (
    <div className="flex flex-none flex-col border-t border-bord bg-panel">
      {/* header */}
      <div className="flex items-center justify-between border-b border-bord px-3 py-1.5">
        <div className="flex items-center gap-2">
          <IcListChecks size={14} className="text-accent" />
          <span className="text-[11px] font-semibold tracking-widest uppercase">
            Shot list & storyboard
          </span>
          <span className="rounded-full border border-bord bg-panel2 px-1.5 py-0.5 text-[10px] text-muted">
            {shots.length} setup{shots.length === 1 ? '' : 's'}
          </span>
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="icon-btn"
          title={isCollapsed ? 'Expand shot list' : 'Collapse shot list'}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? <IcChevronUp size={14} /> : <IcChevronDown size={14} />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="flex h-52 min-h-0 divide-x divide-bord">
          {/* shot cards */}
          <div className="flex w-72 flex-none flex-col">
            <div className="flex flex-none items-center justify-between border-b border-bord px-2 py-1.5">
              <span className="text-[10px] font-semibold tracking-widest text-muted uppercase">
                Sequence
              </span>
              <button
                onClick={addShot}
                className="btn !py-0.5 text-[10px]"
                title="Add a new shot starting from this layout"
              >
                <IcPlus size={11} /> New shot
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
              {shots.map((shot, idx) => {
                const isActive = shot.id === activeShotId
                return (
                  <div
                    key={shot.id}
                    onClick={() => selectShot(shot.id)}
                    className={`group flex cursor-pointer items-start justify-between rounded-lg border p-2 ${
                      isActive
                        ? 'border-accent bg-accent/10'
                        : 'border-bord bg-panel2/40 hover:border-accent/50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-bold text-accent">
                          #{shot.number || idx + 1}
                        </span>
                        <span className="truncate text-xs font-semibold">{shot.name}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-muted">
                        {shot.description || 'No description.'}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="rounded border border-bord bg-panel px-1 py-0.5 font-mono text-[9px] text-muted">
                          {shot.duration || '5s'}
                        </span>
                        <span
                          className={`rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${
                            shot.priority === 'High'
                              ? 'bg-[#f24822]/15 text-[#f24822]'
                              : 'border border-bord bg-panel text-muted'
                          }`}
                        >
                          {shot.priority}
                        </span>
                        <span className="text-[9px] text-muted">
                          {shot.elements?.length || 0} items
                        </span>
                      </div>
                    </div>

                    <div className="ml-1.5 flex flex-none items-center gap-0.5 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          duplicateShot(shot.id)
                        }}
                        className="cursor-pointer rounded p-1 text-muted hover:bg-panel hover:text-ink"
                        title="Duplicate shot"
                      >
                        <IcCopy size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteShot(shot.id)
                        }}
                        className="cursor-pointer rounded p-1 text-muted hover:bg-panel hover:text-[#f24822] disabled:opacity-30"
                        title={shots.length <= 1 ? 'A scene keeps at least one shot' : 'Delete shot'}
                        disabled={shots.length <= 1}
                      >
                        <IcTrash size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* active shot detail */}
          <div className="flex min-w-0 flex-1">
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className={LABEL}>Shot title</label>
                  <input
                    type="text"
                    value={activeShot.name}
                    onChange={(e) => changeShot('name', e.target.value)}
                    className={FIELD}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={LABEL}>Duration</label>
                    <input
                      type="text"
                      value={activeShot.duration || '10s'}
                      onChange={(e) => changeShot('duration', e.target.value)}
                      className={`${FIELD} text-center font-mono`}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Priority</label>
                    <select
                      value={activeShot.priority}
                      onChange={(e) => changeShot('priority', e.target.value)}
                      className={FIELD}
                    >
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className={LABEL}>Status</label>
                  <select
                    value={activeShot.status}
                    onChange={(e) => changeShot('status', e.target.value)}
                    className={FIELD}
                  >
                    <option value="Draft">Draft</option>
                    <option value="Planned">Planned</option>
                    <option value="Approved">Approved</option>
                    <option value="Shot">Shot</option>
                    <option value="Omitted">Omitted</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={LABEL}>Technical description</label>
                  <textarea
                    rows={3}
                    value={activeShot.description}
                    onChange={(e) => changeShot('description', e.target.value)}
                    className={`${FIELD} resize-none`}
                    placeholder="Descriptive notes…"
                  />
                </div>
                <div>
                  <label className={LABEL}>Storyboard / scene movement</label>
                  <textarea
                    rows={3}
                    value={activeShot.storyboardText || ''}
                    onChange={(e) => changeShot('storyboardText', e.target.value)}
                    className={`${FIELD} resize-none`}
                    placeholder="e.g. The camera pans horizontally following the actor…"
                  />
                </div>
              </div>
            </div>

            {/* checklist */}
            <div className="flex w-72 flex-none flex-col border-l border-bord bg-panel2/30 p-3">
              <span className="mb-2 block border-b border-bord pb-1 text-[10px] font-semibold tracking-widest text-muted uppercase">
                Shot checklist
              </span>

              <div className="mb-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                {!activeShot.checklist?.length ? (
                  <p className="py-5 text-center text-[10px] text-muted italic">
                    No actions planned.
                  </p>
                ) : (
                  activeShot.checklist.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-md border border-bord bg-panel p-1.5"
                    >
                      <button
                        onClick={() => toggleChecklist(item.id)}
                        className="flex min-w-0 cursor-pointer items-center gap-2 text-left text-xs"
                        title={item.done ? 'Mark as to-do' : 'Mark as done'}
                      >
                        {item.done ? (
                          <IcCheckCircle size={14} className="flex-none text-accent" />
                        ) : (
                          <span className="h-3.5 w-3.5 flex-none rounded-full border border-bord" />
                        )}
                        <span
                          className={`truncate ${item.done ? 'text-muted line-through' : ''}`}
                        >
                          {item.text}
                        </span>
                      </button>
                      <button
                        onClick={() => deleteChecklist(item.id)}
                        className="flex-none cursor-pointer rounded p-0.5 text-muted hover:text-[#f24822]"
                        title="Remove item"
                      >
                        <IcTrash size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAddChecklist} className="flex flex-none gap-1">
                <input
                  type="text"
                  placeholder="Action (e.g. charge batteries)"
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  className={FIELD}
                />
                <button type="submit" className="btn !px-2">
                  <IcPlus size={12} />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
