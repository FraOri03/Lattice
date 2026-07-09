import type { Project } from '@/types/model'

/**
 * ProjectRegistry — pure helpers around the Project entity: cloud paths,
 * sorting, palette. Store mutations live in the Zustand store (see
 * ProjectStore for the hook-level API).
 */

/** Where a project's data lives inside the cloud vault (/Lattice on Drive). */
export function projectStorageRoot(project: Project): string {
  return project.storageRoot || `projects/${project.id}`
}

/** Subfolders every project owns in cloud storage (mirrors the vault layout). */
export const PROJECT_SUBFOLDERS = [
  'notes',
  'documents',
  'spreadsheets',
  'presentations',
  'code',
  'boards',
  'assets',
  'imports',
  'config',
] as const

/** Emoji choices offered by the project dialogs. */
export const PROJECT_ICONS = [
  '🗂️', '📁', '🚀', '💡', '🎨', '📚', '🧪', '🏗️', '🎯', '🌱', '🔬', '✏️',
] as const

export interface ProjectGroups {
  starred: Project[]
  active: Project[]
  archived: Project[]
}

/** Starred first, then active, then archived — each newest-updated first. */
export function groupProjects(projects: Project[]): ProjectGroups {
  const byRecent = (a: Project, b: Project) => b.updatedAt - a.updatedAt
  return {
    starred: projects.filter((p) => p.starred && !p.archived).sort(byRecent),
    active: projects.filter((p) => !p.starred && !p.archived).sort(byRecent),
    archived: projects.filter((p) => p.archived).sort(byRecent),
  }
}
