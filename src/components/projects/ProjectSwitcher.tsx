import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { useUiStore } from '@/store/useUiStore'
import { useActiveProject, useRecentProjects } from '@/lib/projects/ProjectStore'
import { groupProjects, PROJECT_ICONS } from '@/lib/projects/ProjectRegistry'
import { CARD_COLORS, type CardColor, type Project } from '@/types/model'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import {
  IcArchive,
  IcCheck,
  IcChevronDown,
  IcClock,
  IcPlus,
  IcSettings,
  IcStar,
  IcTrash,
  IcX,
} from '@/components/Icons'

/** Project switcher (ChatGPT/Claude-style spaces) for the sidebar top. */
export function ProjectSwitcher() {
  const project = useActiveProject()
  const projects = useStore((s) => s.projects)
  const workspaces = useStore((s) => s.workspaces)
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId)
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace)
  const createWorkspace = useStore((s) => s.createWorkspace)
  const updateWorkspace = useStore((s) => s.updateWorkspace)
  const deleteWorkspace = useStore((s) => s.deleteWorkspace)
  const setActiveProject = useStore((s) => s.setActiveProject)
  const createProject = useStore((s) => s.createProject)
  const updateProject = useStore((s) => s.updateProject)
  const recent = useRecentProjects(4)
  const setProjectDialogOpen = useUiStore((s) => s.setProjectDialogOpen)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  if (!project) return null
  const activeWorkspace = workspaces[activeWorkspaceId]
  // only this workspace's projects appear in the switcher
  const wsProjects = activeWorkspace
    ? Object.values(projects).filter((p) => activeWorkspace.projectIds.includes(p.id))
    : Object.values(projects)
  const groups = groupProjects(wsProjects)
  const wsList = Object.values(workspaces).sort((a, b) =>
    a.personal === b.personal ? a.name.localeCompare(b.name) : a.personal ? -1 : 1,
  )
  const color = CARD_COLORS[project.color] ?? CARD_COLORS.blue

  const row = (p: Project, hint?: React.ReactNode) => (
    <button
      key={p.id}
      className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] ${
        p.id === project.id ? 'bg-panel2 text-ink' : 'text-muted hover:bg-panel2/60'
      }`}
      onClick={() => {
        setActiveProject(p.id)
        setOpen(false)
      }}
    >
      <span className="text-[13px]">{p.icon}</span>
      <span className="min-w-0 flex-1 truncate">{p.name}</span>
      {hint}
      {p.starred && <IcStar size={11} className="flex-none text-[#ffcd29]" />}
      {p.id === project.id && <IcCheck size={12} className="flex-none text-accent" />}
    </button>
  )

  return (
    <div className="relative px-3 pb-2" ref={ref}>
      <button
        className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-bord bg-panel2 px-2.5 py-2 hover:border-accent"
        onClick={() => setOpen((v) => !v)}
        title={project.description || project.name}
      >
        <span
          className="flex h-6 w-6 flex-none items-center justify-center rounded-md text-[13px]"
          style={{ background: `${color}22`, border: `1px solid ${color}55` }}
        >
          {project.icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-[12.5px] font-semibold">
          {project.name}
        </span>
        <IcChevronDown size={12} className="flex-none text-muted" />
      </button>

      {open && (
        <div className="absolute top-full right-3 left-3 z-50 mt-1 max-h-[60vh] overflow-y-auto rounded-xl border border-bord bg-panel p-1.5 shadow-xl">
          <div className="px-2 pt-1 pb-0.5 text-[9.5px] font-semibold tracking-widest text-muted uppercase">
            Workspaces
          </div>
          {wsList
            .filter((ws) => !ws.archived || ws.id === activeWorkspaceId)
            .map((ws) => (
              <div key={ws.id} className="group/ws flex items-center">
                <button
                  className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] ${
                    ws.id === activeWorkspaceId
                      ? 'bg-panel2 text-ink'
                      : 'text-muted hover:bg-panel2/60'
                  }`}
                  onClick={() => {
                    setActiveWorkspace(ws.id)
                    setOpen(false)
                  }}
                  aria-current={ws.id === activeWorkspaceId}
                >
                  <span className="text-[13px]">{ws.icon}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {ws.name}
                    {ws.archived ? ' (archived)' : ''}
                  </span>
                  <span className="text-[10px] text-muted">
                    {ws.projectIds.length} prj
                  </span>
                  {ws.id === activeWorkspaceId && (
                    <IcCheck size={12} className="flex-none text-accent" />
                  )}
                </button>
                {!ws.personal && (
                  <span className="hidden flex-none gap-0.5 group-hover/ws:flex">
                    <button
                      className="icon-btn h-5 w-5"
                      title={ws.archived ? 'Unarchive workspace' : 'Archive workspace'}
                      aria-label={`${ws.archived ? 'Unarchive' : 'Archive'} workspace ${ws.name}`}
                      onClick={() => updateWorkspace(ws.id, { archived: !ws.archived })}
                    >
                      <IcArchive size={10} />
                    </button>
                    <button
                      className="icon-btn h-5 w-5 text-[#f24822]"
                      title="Delete workspace (its projects move to Personal)"
                      aria-label={`Delete workspace ${ws.name}`}
                      onClick={async () => {
                        if (
                          await confirmDialog({
                            title: `Delete workspace “${ws.name}”?`,
                            body: `Nothing is lost: its ${ws.projectIds.length} project${ws.projectIds.length === 1 ? '' : 's'} move to the Personal workspace.`,
                            confirmLabel: 'Delete workspace',
                            danger: true,
                          })
                        )
                          deleteWorkspace(ws.id)
                      }}
                    >
                      <IcTrash size={10} />
                    </button>
                  </span>
                )}
              </div>
            ))}
          <button
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-muted hover:bg-panel2 hover:text-ink"
            onClick={() => {
              const name = window.prompt('Workspace name', 'Team workspace')
              if (!name?.trim()) return
              const id = createWorkspace({ name: name.trim() })
              setActiveWorkspace(id)
              setOpen(false)
            }}
          >
            <IcPlus size={12} /> New workspace
          </button>
          <div className="mx-1 my-1 h-px bg-bord" role="separator" />
          {groups.starred.length > 0 && (
            <>
              <div className="px-2 pt-1 pb-0.5 text-[9.5px] font-semibold tracking-widest text-muted uppercase">
                Starred
              </div>
              {groups.starred.map((p) => row(p))}
            </>
          )}
          {recent.filter((p) => p.id !== project.id).length > 0 && (
            <>
              <div className="px-2 pt-2 pb-0.5 text-[9.5px] font-semibold tracking-widest text-muted uppercase">
                Recent
              </div>
              {recent
                .filter((p) => p.id !== project.id && !p.starred)
                .map((p) => row(p, <IcClock size={10} className="flex-none text-muted" />))}
            </>
          )}
          {groups.active.length > 0 && (
            <>
              <div className="px-2 pt-2 pb-0.5 text-[9.5px] font-semibold tracking-widest text-muted uppercase">
                Projects
              </div>
              {groups.active.map((p) => row(p))}
            </>
          )}
          {groups.archived.length > 0 && (
            <>
              <div className="px-2 pt-2 pb-0.5 text-[9.5px] font-semibold tracking-widest text-muted uppercase">
                Archived
              </div>
              {groups.archived.map((p) =>
                row(p, <IcArchive size={10} className="flex-none text-muted" />),
              )}
            </>
          )}
          <div className="mt-1 flex gap-1 border-t border-bord pt-1.5">
            <button
              className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-muted hover:bg-panel2 hover:text-ink"
              onClick={() => {
                const id = createProject()
                setActiveProject(id)
                setOpen(false)
                setProjectDialogOpen(true)
              }}
            >
              <IcPlus size={12} /> New project
            </button>
            <button
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] text-muted hover:bg-panel2 hover:text-ink"
              title="Project settings"
              onClick={() => {
                setOpen(false)
                setProjectDialogOpen(true)
              }}
            >
              <IcSettings size={12} />
            </button>
          </div>
        </div>
      )}

      <ProjectDialog
        project={project}
        updateProject={updateProject}
      />
    </div>
  )
}

/** Modal for editing the active project: name, icon, color, description, archive, delete. */
function ProjectDialog({
  project,
  updateProject,
}: {
  project: Project
  updateProject: (id: string, patch: Partial<Omit<Project, 'id'>>) => void
}) {
  const open = useUiStore((s) => s.projectDialogOpen)
  const setOpen = useUiStore((s) => s.setProjectDialogOpen)
  const deleteProject = useStore((s) => s.deleteProject)
  const projectCount = useStore((s) => Object.keys(s.projects).length)
  const workspaces = useStore((s) => s.workspaces)
  const moveProjectToWorkspace = useStore((s) => s.moveProjectToWorkspace)
  const containingWs = Object.values(workspaces).find((ws) =>
    ws.projectIds.includes(project.id),
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="w-[420px] rounded-2xl border border-bord bg-panel p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[14px] font-bold">Project settings</h2>
          <button className="icon-btn" onClick={() => setOpen(false)}>
            <IcX size={14} />
          </button>
        </div>

        <label className="mb-1 block text-[11px] font-medium text-muted">Name</label>
        <input
          className="field mb-3"
          value={project.name}
          onChange={(e) => updateProject(project.id, { name: e.target.value })}
        />

        <label className="mb-1 block text-[11px] font-medium text-muted">Description</label>
        <textarea
          className="field mb-3 h-16 resize-none"
          value={project.description}
          placeholder="What is this project about?"
          onChange={(e) => updateProject(project.id, { description: e.target.value })}
        />

        <label className="mb-1 block text-[11px] font-medium text-muted">Icon</label>
        <div className="mb-3 flex flex-wrap gap-1">
          {PROJECT_ICONS.map((icon) => (
            <button
              key={icon}
              className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border text-[15px] ${
                project.icon === icon
                  ? 'border-accent bg-accent/10'
                  : 'border-bord hover:border-accent'
              }`}
              onClick={() => updateProject(project.id, { icon })}
            >
              {icon}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-[11px] font-medium text-muted">Workspace</label>
        <select
          className="field mb-3 cursor-pointer"
          value={containingWs?.id ?? ''}
          aria-label="Move project to workspace"
          onChange={(e) => moveProjectToWorkspace(project.id, e.target.value)}
        >
          {Object.values(workspaces)
            .filter((ws) => !ws.archived || ws.id === containingWs?.id)
            .map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.icon} {ws.name}
              </option>
            ))}
        </select>

        <label className="mb-1 block text-[11px] font-medium text-muted">Color</label>
        <div className="mb-4 flex gap-1.5">
          {(Object.keys(CARD_COLORS) as CardColor[]).map((c) => (
            <button
              key={c}
              className="h-6 w-6 cursor-pointer rounded-full border-2"
              style={{
                background: CARD_COLORS[c],
                borderColor: project.color === c ? 'var(--ink)' : 'transparent',
              }}
              title={c}
              onClick={() => updateProject(project.id, { color: c })}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-bord pt-3">
          <button
            className="btn"
            onClick={() => updateProject(project.id, { starred: !project.starred })}
          >
            <IcStar size={12} className={project.starred ? 'text-[#ffcd29]' : ''} />
            {project.starred ? 'Unstar' : 'Star'}
          </button>
          <button
            className="btn"
            onClick={() => updateProject(project.id, { archived: !project.archived })}
          >
            <IcArchive size={12} />
            {project.archived ? 'Unarchive' : 'Archive'}
          </button>
          <div className="flex-1" />
          <button
            className="btn !border-[#f24822]/50 !text-[#f24822]"
            disabled={projectCount <= 1}
            title={
              projectCount <= 1
                ? 'The last project cannot be deleted'
                : 'Delete the project and everything in it'
            }
            onClick={async () => {
              if (
                await confirmDialog({
                  title: `Delete project “${project.name}”?`,
                  body: 'ALL its boards, notes, documents and assets are deleted. This cannot be undone locally — files already synced to Drive are kept there.',
                  confirmLabel: 'Delete project',
                  danger: true,
                })
              ) {
                setOpen(false)
                deleteProject(project.id)
              }
            }}
          >
            <IcTrash size={12} /> Delete
          </button>
        </div>
      </div>
    </div>
  )
}
