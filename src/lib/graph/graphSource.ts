/**
 * The plain, store-independent snapshot the graph is built from.
 *
 * The renderer must not be coupled to the Zustand store, so the builder
 * consumes only these serializable arrays. A snapshot is produced once from
 * the active project (see {@link snapshotFromState}) and can be handed to a
 * Web Worker, cached, or fed straight into unit tests.
 *
 * Only metadata is included — never lazy-loaded document bodies. Wikilinks,
 * source assets and board relationships are all derivable from digested
 * metadata the store already keeps in memory, so opening Graph never forces
 * a single rich-document / spreadsheet / presentation / code body to load.
 */
import type {
  AssetDoc,
  Board,
  CodeDocMeta,
  NoteDoc,
  PresentationDocMeta,
  Project,
  RichDocMeta,
  SpreadsheetDocMeta,
} from '@/types/model'

/** Minimal project shape the builder needs (id + github link). */
export interface GraphSourceProject {
  id: string
  name: string
  icon?: string
  github?: { repo: string; branch?: string }
}

export interface GraphSourceSnapshot {
  projectId: string
  project?: GraphSourceProject
  notes: NoteDoc[]
  docs: RichDocMeta[]
  codeDocs: CodeDocMeta[]
  sheetDocs: SpreadsheetDocMeta[]
  presentDocs: PresentationDocMeta[]
  assets: AssetDoc[]
  boards: Board[]
}

/** The slice of the app store the snapshot selector reads. */
export interface GraphStateSlice {
  activeProjectId: string
  projects: Record<string, Project>
  notes: Record<string, NoteDoc>
  docs: Record<string, RichDocMeta>
  codeDocs: Record<string, CodeDocMeta>
  sheetDocs: Record<string, SpreadsheetDocMeta>
  presentDocs: Record<string, PresentationDocMeta>
  assets: Record<string, AssetDoc>
  boards: Record<string, Board>
}

/**
 * Build a project-scoped snapshot from raw app state.
 *
 * Every entity is filtered to `projectId` up front — this is the single
 * client-side boundary that keeps other projects' entities out of the
 * graph. A server-backed provider must additionally filter server-side;
 * client filtering is never authorization on its own.
 */
export function snapshotFromState(
  state: GraphStateSlice,
  projectId = state.activeProjectId,
): GraphSourceSnapshot {
  const inProject = <T extends { projectId?: string }>(rec: Record<string, T>): T[] =>
    Object.values(rec).filter((e) => (e.projectId ?? state.activeProjectId) === projectId)

  const project = state.projects[projectId]
  const github = project?.settings?.github as { repo?: string; branch?: string } | undefined

  return {
    projectId,
    project: project
      ? {
          id: project.id,
          name: project.name,
          icon: project.icon,
          github: github?.repo ? { repo: github.repo, branch: github.branch } : undefined,
        }
      : undefined,
    notes: inProject(state.notes),
    docs: inProject(state.docs),
    codeDocs: inProject(state.codeDocs),
    sheetDocs: inProject(state.sheetDocs),
    presentDocs: inProject(state.presentDocs),
    assets: inProject(state.assets),
    boards: inProject(state.boards),
  }
}
