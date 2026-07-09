import { useStore } from '@/store/useStore'
import type { Project } from '@/types/model'

/**
 * ProjectStore — hook-level API over the vault store's project slice.
 * Components import these instead of poking the raw store, so the
 * project model can move (e.g. into its own persisted store for Phase 7
 * collaboration) without touching the UI.
 */

export function useActiveProject(): Project {
  return useStore((s) => s.projects[s.activeProjectId])
}

export function useProjects(): Record<string, Project> {
  return useStore((s) => s.projects)
}

export function useRecentProjects(limit = 5): Project[] {
  const ids = useStore((s) => s.recentProjectIds)
  const projects = useStore((s) => s.projects)
  return ids
    .map((id) => projects[id])
    .filter((p): p is Project => !!p && !p.archived)
    .slice(0, limit)
}

export const projectActions = {
  create: (partial?: Partial<Project>) => useStore.getState().createProject(partial),
  update: (id: string, patch: Partial<Omit<Project, 'id'>>) =>
    useStore.getState().updateProject(id, patch),
  rename: (id: string, name: string) => useStore.getState().updateProject(id, { name }),
  archive: (id: string, archived = true) =>
    useStore.getState().updateProject(id, { archived }),
  toggleStar: (id: string) => {
    const p = useStore.getState().projects[id]
    if (p) useStore.getState().updateProject(id, { starred: !p.starred })
  },
  remove: (id: string) => useStore.getState().deleteProject(id),
  setActive: (id: string) => useStore.getState().setActiveProject(id),
}
