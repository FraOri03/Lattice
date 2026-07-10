import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  applyEdgeChanges,
  applyNodeChanges,
  addEdge as rfAddEdge,
  MarkerType,
} from '@xyflow/react'
import type { Connection, EdgeChange, NodeChange, XYPosition } from '@xyflow/react'
import type { JSONContent } from '@tiptap/core'
import type {
  AssetDoc,
  Board,
  BoardNode,
  BoardSection,
  CardData,
  CardType,
  CodeDocMeta,
  NoteDoc,
  Project,
  RecentEntry,
  RichDocMeta,
  SpreadsheetDocMeta,
  Theme,
  VaultExport,
  ViewMode,
  WebEmbed,
} from '@/types/model'
import { nid } from '@/lib/id'
import { blobToDataUrl } from '@/lib/media'
import { storage } from '@/lib/storage/StorageProvider'
import { digestDocJson, EMPTY_DOC } from '@/lib/richdoc/docjson'
import { digestCode } from '@/lib/code/digest'
import { extForLang } from '@/lib/code/languages'
import {
  createBody,
  digestSpreadsheet,
  normalizeBody,
  type SpreadsheetBody,
} from '@/lib/sheet/sheetModel'
import {
  releaseAllAssetUrls,
  releaseAssetUrl,
} from '@/lib/assets/AssetRegistry'
import {
  absolutePositionOf,
  orderSectionsFirst,
  refreshSectionChildren,
} from '@/lib/board/sections'
import { createWebEmbed } from '@/lib/web/WebEmbedService'
import {
  DEFAULT_PROJECT_ID,
  makeDefaultProject,
  seedBoardOrder,
  seedBoards,
  seedNotes,
  seedProjects,
  SEED_BOARD_ID,
} from './seed'

export const CARD_DEFAULTS: Record<CardType, { w: number; h: number; label: string }> = {
  note: { w: 300, h: 240, label: 'Note' },
  image: { w: 300, h: 220, label: 'Image' },
  video: { w: 340, h: 240, label: 'Video' },
  link: { w: 280, h: 96, label: 'Link' },
  file: { w: 280, h: 150, label: 'File' },
  embed3d: { w: 320, h: 260, label: '3D embed' },
  asset: { w: 300, h: 220, label: 'Asset' },
  richdoc: { w: 320, h: 230, label: 'Document' },
  code: { w: 360, h: 250, label: 'Code' },
  sheet: { w: 380, h: 260, label: 'Spreadsheet' },
  section: { w: 640, h: 420, label: 'Section' },
  webembed: { w: 460, h: 340, label: 'Web embed' },
}

/** Header height of a collapsed section. */
export const SECTION_COLLAPSED_H = 40

const DEFAULT_EDGE = {
  type: 'default' as const,
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
}

/** Sidebar file-type filter. */
export type SidebarFilter = 'all' | 'notes' | 'docs' | 'sheets' | 'code' | 'assets'

/**
 * Which view mode an entity opens into. From the board we go to split
 * (entity + board side-by-side); in split we stay; in any full-page mode
 * we jump to the mode that matches the entity.
 */
function modeAfterOpen(current: ViewMode, target: ViewMode): ViewMode {
  if (current === 'board' || current === 'split') return 'split'
  return target
}

function pushRecent(recents: RecentEntry[], entry: Omit<RecentEntry, 'at'>): RecentEntry[] {
  const next = [
    { ...entry, at: Date.now() },
    ...recents.filter((r) => !(r.kind === entry.kind && r.id === entry.id)),
  ]
  return next.slice(0, 15)
}

function dropRecent(recents: RecentEntry[], kind: RecentEntry['kind'], id: string) {
  return recents.filter((r) => !(r.kind === kind && r.id === id))
}

interface AppState {
  projects: Record<string, Project>
  activeProjectId: string
  /** recently active project ids, newest first */
  recentProjectIds: string[]
  boards: Record<string, Board>
  boardOrder: string[]
  activeBoardId: string
  notes: Record<string, NoteDoc>
  assets: Record<string, AssetDoc>
  /** Rich document METADATA only — bodies are lazy-loaded from storage. */
  docs: Record<string, RichDocMeta>
  /** Code document METADATA only — source text is lazy-loaded from storage. */
  codeDocs: Record<string, CodeDocMeta>
  /** Spreadsheet METADATA only — workbook bodies are lazy-loaded from storage. */
  sheetDocs: Record<string, SpreadsheetDocMeta>
  activeNoteId: string | null
  activeAssetId: string | null
  activeDocId: string | null
  activeCodeId: string | null
  activeSheetId: string | null
  /** open tabs in the code workspace (code doc ids) */
  codeTabs: string[]
  /** recently opened entities, newest first */
  recents: RecentEntry[]
  viewMode: ViewMode
  theme: Theme
  search: string
  tagFilter: string | null
  sidebarFilter: SidebarFilter

  setSearch: (s: string) => void
  setTagFilter: (t: string | null) => void
  setSidebarFilter: (f: SidebarFilter) => void
  setViewMode: (m: ViewMode) => void
  setTheme: (t: Theme) => void

  createProject: (partial?: Partial<Project>) => string
  updateProject: (id: string, patch: Partial<Omit<Project, 'id'>>) => void
  deleteProject: (id: string) => void
  setActiveProject: (id: string) => void

  setActiveBoard: (id: string) => void
  addBoard: () => void
  renameBoard: (id: string, name: string) => void
  deleteBoard: (id: string) => void

  onNodesChange: (changes: NodeChange<BoardNode>[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (conn: Connection) => void

  addCard: (
    type: CardType,
    position: XYPosition,
    data?: Partial<CardData>,
    size?: { w: number; h: number },
  ) => string
  updateCardData: (id: string, patch: Partial<CardData>) => void
  resizeCard: (id: string, w: number, h: number) => void
  deleteCard: (id: string) => void
  updateEdgeLabel: (id: string, label: string) => void
  deleteEdge: (id: string) => void

  addSection: (position: XYPosition, title?: string) => string
  updateSection: (id: string, patch: Partial<BoardSection>) => void
  toggleSectionCollapsed: (id: string) => void
  attachCardToSection: (cardId: string, sectionId: string) => void
  detachCardFromSection: (cardId: string) => void

  addWebEmbedCard: (
    rawUrl: string,
    position: XYPosition,
  ) => { cardId: string | null; reason?: string }
  updateWebEmbed: (cardId: string, patch: Partial<WebEmbed>) => void

  createNote: (partial?: Partial<NoteDoc>) => string
  updateNote: (id: string, patch: Partial<Omit<NoteDoc, 'id'>>) => void
  deleteNote: (id: string) => void
  openNote: (id: string) => void
  openWikilink: (title: string) => void

  addAsset: (asset: AssetDoc) => void
  renameAsset: (id: string, name: string) => void
  deleteAsset: (id: string) => void
  openAsset: (id: string) => void
  closeAsset: () => void

  createDoc: (partial?: Partial<RichDocMeta>) => string
  updateDocMeta: (id: string, patch: Partial<Omit<RichDocMeta, 'id' | 'type'>>) => void
  /**
   * Write a document body to storage and refresh its digested metadata.
   * `silent` skips the activity/announce hooks — used when persisting
   * remote CRDT changes that another user already authored.
   */
  persistDocContent: (id: string, body: JSONContent, opts?: { silent?: boolean }) => void
  deleteDoc: (id: string) => void
  openDoc: (id: string) => void
  closeDoc: () => void

  createSheetDoc: (partial?: Partial<SpreadsheetDocMeta>) => string
  updateSheetMeta: (
    id: string,
    patch: Partial<Omit<SpreadsheetDocMeta, 'id' | 'type'>>,
  ) => void
  /** Write a workbook body to storage and refresh its digested metadata. */
  persistSheetBody: (id: string, body: SpreadsheetBody) => void
  deleteSheetDoc: (id: string) => void
  openSheet: (id: string) => void
  closeSheet: () => void

  createCode: (partial?: Partial<CodeDocMeta>) => string
  updateCodeMeta: (id: string, patch: Partial<Omit<CodeDocMeta, 'id' | 'type'>>) => void
  /** Write code source to storage and refresh its digested metadata. */
  persistCodeContent: (id: string, content: string, opts?: { silent?: boolean }) => void
  deleteCode: (id: string) => void
  openCode: (id: string) => void
  closeCode: () => void
  closeCodeTab: (id: string) => void

  importVault: (data: VaultExport) => Promise<void>
}

function patchBoard(
  state: AppState,
  boardId: string,
  patch: Partial<Board>,
): Pick<AppState, 'boards'> {
  const board = state.boards[boardId]
  return { boards: { ...state.boards, [boardId]: { ...board, ...patch } } }
}

/** Remove every card (on every board) whose data matches the predicate. */
function stripCards(
  boards: Record<string, Board>,
  matches: (data: CardData) => boolean,
): Record<string, Board> {
  return Object.fromEntries(
    Object.entries(boards).map(([bid, b]) => {
      const gone = new Set(b.nodes.filter((n) => matches(n.data)).map((n) => n.id))
      if (!gone.size) return [bid, b]
      return [
        bid,
        {
          ...b,
          nodes: refreshSectionChildren(b.nodes.filter((n) => !gone.has(n.id))),
          edges: b.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target)),
        },
      ]
    }),
  )
}

/**
 * Tell the collaboration layer that a body was saved: other sessions
 * refresh their open editors, and the activity log records the edit
 * (deduped). Dynamic imports keep the store free of static dependencies
 * on the collab layer (which itself imports this store).
 */
function announceEdit(kind: 'doc' | 'code' | 'sheet', id: string, message: string) {
  void import('@/lib/collab/RealtimeDocumentSync').then(({ realtimeDocumentSync }) =>
    realtimeDocumentSync.announceSave(id, kind),
  )
  void import('@/lib/collab/ActivityLogService').then(({ activityLog }) =>
    activityLog.log(
      useStore.getState().activeProjectId,
      `${kind}.edited`,
      message,
      id,
    ),
  )
}

/** Stamp every entity of a legacy (pre-projects) vault with a project id. */
function stampProject<T extends { projectId?: string }>(
  record: Record<string, T>,
  projectId: string,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).map(([id, e]) => [
      id,
      e.projectId ? e : { ...e, projectId },
    ]),
  )
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      projects: seedProjects,
      activeProjectId: DEFAULT_PROJECT_ID,
      recentProjectIds: [DEFAULT_PROJECT_ID],
      boards: seedBoards,
      boardOrder: seedBoardOrder,
      activeBoardId: SEED_BOARD_ID,
      notes: seedNotes,
      assets: {},
      docs: {},
      codeDocs: {},
      sheetDocs: {},
      activeNoteId: null,
      activeAssetId: null,
      activeDocId: null,
      activeCodeId: null,
      activeSheetId: null,
      codeTabs: [],
      recents: [],
      viewMode: 'board',
      theme: 'dark',
      search: '',
      tagFilter: null,
      sidebarFilter: 'all',

      setSearch: (search) => set({ search }),
      setTagFilter: (tagFilter) => set({ tagFilter }),
      setSidebarFilter: (sidebarFilter) => set({ sidebarFilter }),
      setViewMode: (viewMode) => set({ viewMode }),
      setTheme: (theme) => set({ theme }),

      /* ---------------- projects ---------------- */

      createProject: (partial = {}) => {
        const id = nid('proj')
        const now = Date.now()
        const project: Project = {
          id,
          name: 'New project',
          description: '',
          icon: '📁',
          color: 'blue',
          createdAt: now,
          updatedAt: now,
          archived: false,
          starred: false,
          storageRoot: `projects/${id}`,
          settings: {},
          ...partial,
        }
        // every project starts with one board
        const boardId = nid('board')
        const board: Board = {
          id: boardId,
          name: 'Main board',
          nodes: [],
          edges: [],
          projectId: id,
        }
        set((s) => ({
          projects: { ...s.projects, [id]: project },
          boards: { ...s.boards, [boardId]: board },
          boardOrder: [...s.boardOrder, boardId],
        }))
        void import('@/lib/collab/ActivityLogService').then(({ activityLog }) =>
          activityLog.log(id, 'project.created', `Project “${project.name}” created`),
        )
        return id
      },

      updateProject: (id, patch) =>
        set((s) => {
          const project = s.projects[id]
          if (!project) return {}
          return {
            projects: {
              ...s.projects,
              [id]: { ...project, ...patch, updatedAt: Date.now() },
            },
          }
        }),

      deleteProject: (id) => {
        const s = get()
        const remaining = Object.values(s.projects).filter((p) => p.id !== id)
        if (!remaining.length) return // never delete the last project
        // tear down the realtime rooms too (server verifies ownership)
        void import('@/lib/collab/ServerAclService').then(({ serverAcl }) =>
          serverAcl.deleteRooms(id),
        )
        // collect and remove everything the project owns
        const ownedBoards = Object.values(s.boards).filter((b) => b.projectId === id)
        const ownedNotes = Object.values(s.notes).filter((n) => n.projectId === id)
        const ownedDocs = Object.values(s.docs).filter((d) => d.projectId === id)
        const ownedCode = Object.values(s.codeDocs).filter((c) => c.projectId === id)
        const ownedSheets = Object.values(s.sheetDocs).filter((sh) => sh.projectId === id)
        const ownedAssets = Object.values(s.assets).filter((a) => a.projectId === id)
        for (const d of ownedDocs) void storage.deleteDocument(d.id).catch(console.error)
        for (const c of ownedCode) void storage.deleteDocument(c.id).catch(console.error)
        for (const sh of ownedSheets)
          void storage.deleteDocument(sh.id).catch(console.error)
        for (const a of ownedAssets) {
          releaseAssetUrl(a.id)
          void storage.deleteBlob(a.id).catch(console.error)
        }
        const omit = <T,>(rec: Record<string, T>, ids: Set<string>) =>
          Object.fromEntries(Object.entries(rec).filter(([k]) => !ids.has(k)))
        const boardIds = new Set(ownedBoards.map((b) => b.id))
        const projects = { ...s.projects }
        delete projects[id]
        const nextActiveProject =
          s.activeProjectId === id
            ? (remaining.find((p) => !p.archived) ?? remaining[0]).id
            : s.activeProjectId
        const boards = omit(s.boards, boardIds)
        const boardOrder = s.boardOrder.filter((b) => !boardIds.has(b))
        let activeBoardId = s.activeBoardId
        if (boardIds.has(activeBoardId)) {
          activeBoardId =
            boardOrder.find((b) => boards[b]?.projectId === nextActiveProject) ??
            boardOrder[0]
        }
        set({
          projects,
          activeProjectId: nextActiveProject,
          recentProjectIds: s.recentProjectIds.filter((p) => p !== id),
          boards,
          boardOrder,
          activeBoardId,
          notes: omit(s.notes, new Set(ownedNotes.map((n) => n.id))),
          docs: omit(s.docs, new Set(ownedDocs.map((d) => d.id))),
          codeDocs: omit(s.codeDocs, new Set(ownedCode.map((c) => c.id))),
          sheetDocs: omit(s.sheetDocs, new Set(ownedSheets.map((sh) => sh.id))),
          assets: omit(s.assets, new Set(ownedAssets.map((a) => a.id))),
          activeNoteId: null,
          activeAssetId: null,
          activeDocId: null,
          activeCodeId: null,
          activeSheetId: null,
          codeTabs: [],
        })
      },

      setActiveProject: (id) => {
        const s = get()
        if (!s.projects[id] || s.activeProjectId === id) return
        let activeBoardId = s.boardOrder.find((b) => s.boards[b]?.projectId === id)
        let boards = s.boards
        let boardOrder = s.boardOrder
        if (!activeBoardId) {
          activeBoardId = nid('board')
          boards = {
            ...boards,
            [activeBoardId]: {
              id: activeBoardId,
              name: 'Main board',
              nodes: [],
              edges: [],
              projectId: id,
            },
          }
          boardOrder = [...boardOrder, activeBoardId]
        }
        set({
          activeProjectId: id,
          recentProjectIds: [id, ...s.recentProjectIds.filter((p) => p !== id)].slice(0, 8),
          boards,
          boardOrder,
          activeBoardId,
          activeNoteId: null,
          activeAssetId: null,
          activeDocId: null,
          activeCodeId: null,
          activeSheetId: null,
          codeTabs: [],
          viewMode: s.viewMode === 'split' ? 'board' : s.viewMode,
        })
      },

      /* ---------------- boards ---------------- */

      setActiveBoard: (id) =>
        set((s) =>
          s.boards[id]
            ? {
                activeBoardId: id,
                recents: pushRecent(s.recents, { kind: 'board', id }),
              }
            : {},
        ),

      addBoard: () => {
        const id = nid('board')
        set((s) => {
          const count = s.boardOrder.filter(
            (b) => s.boards[b]?.projectId === s.activeProjectId,
          ).length
          return {
            boards: {
              ...s.boards,
              [id]: {
                id,
                name: `Board ${count + 1}`,
                nodes: [],
                edges: [],
                projectId: s.activeProjectId,
              },
            },
            boardOrder: [...s.boardOrder, id],
            activeBoardId: id,
          }
        })
      },

      renameBoard: (id, name) => set((s) => patchBoard(s, id, { name })),

      deleteBoard: (id) => {
        const s = get()
        const projectBoards = s.boardOrder.filter(
          (b) => s.boards[b]?.projectId === s.boards[id]?.projectId,
        )
        if (projectBoards.length <= 1) return
        const boards = { ...s.boards }
        delete boards[id]
        const boardOrder = s.boardOrder.filter((b) => b !== id)
        const fallback =
          projectBoards.find((b) => b !== id) ?? boardOrder[0]
        set({
          boards,
          boardOrder,
          activeBoardId: s.activeBoardId === id ? fallback : s.activeBoardId,
          recents: dropRecent(s.recents, 'board', id),
        })
      },

      onNodesChange: (changes) =>
        set((s) => {
          const board = s.boards[s.activeBoardId]
          return patchBoard(s, board.id, {
            nodes: applyNodeChanges(changes, board.nodes),
          })
        }),

      onEdgesChange: (changes) =>
        set((s) => {
          const board = s.boards[s.activeBoardId]
          return patchBoard(s, board.id, {
            edges: applyEdgeChanges(changes, board.edges),
          })
        }),

      onConnect: (conn) =>
        set((s) => {
          const board = s.boards[s.activeBoardId]
          return patchBoard(s, board.id, {
            edges: rfAddEdge({ ...conn, ...DEFAULT_EDGE }, board.edges),
          })
        }),

      /* ---------------- cards ---------------- */

      addCard: (type, position, data = {}, size) => {
        const s = get()
        const defaults = CARD_DEFAULTS[type]
        let notes = s.notes
        let noteId = data.noteId
        if (type === 'note' && !noteId) {
          noteId = nid('note')
          const doc: NoteDoc = {
            id: noteId,
            title: 'Untitled note',
            content: '',
            tags: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            projectId: s.activeProjectId,
          }
          notes = { ...notes, [noteId]: doc }
        }
        const node: BoardNode = {
          id: nid('card'),
          type,
          position,
          width: size?.w ?? defaults.w,
          height: size?.h ?? defaults.h,
          dragHandle: '.drag-handle',
          selected: true,
          data: { color: 'gray', ...data, noteId, type },
        }
        const board = s.boards[s.activeBoardId]
        set({
          notes,
          ...patchBoard(s, board.id, {
            nodes: [...board.nodes.map((n) => ({ ...n, selected: false })), node],
          }),
        })
        return node.id
      },

      updateCardData: (id, patch) =>
        set((s) => {
          const board = s.boards[s.activeBoardId]
          return patchBoard(s, board.id, {
            nodes: board.nodes.map((n) =>
              n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
            ),
          })
        }),

      resizeCard: (id, w, h) =>
        set((s) => {
          const board = s.boards[s.activeBoardId]
          return patchBoard(s, board.id, {
            nodes: board.nodes.map((n) =>
              n.id === id ? { ...n, width: w, height: h } : n,
            ),
          })
        }),

      deleteCard: (id) =>
        set((s) => {
          const board = s.boards[s.activeBoardId]
          const node = board.nodes.find((n) => n.id === id)
          let nodes = board.nodes
          if (node?.type === 'section') {
            // free the section's cards first: back to absolute coordinates
            nodes = nodes.map((n) => {
              if (n.parentId !== id) return n
              const abs = absolutePositionOf(n, nodes)
              const { parentId: _drop, ...rest } = n
              return { ...rest, position: abs, hidden: false }
            })
          }
          return patchBoard(s, board.id, {
            nodes: refreshSectionChildren(nodes.filter((n) => n.id !== id)),
            edges: board.edges.filter((e) => e.source !== id && e.target !== id),
          })
        }),

      updateEdgeLabel: (id, label) =>
        set((s) => {
          const board = s.boards[s.activeBoardId]
          return patchBoard(s, board.id, {
            edges: board.edges.map((e) => (e.id === id ? { ...e, label } : e)),
          })
        }),

      deleteEdge: (id) =>
        set((s) => {
          const board = s.boards[s.activeBoardId]
          return patchBoard(s, board.id, {
            edges: board.edges.filter((e) => e.id !== id),
          })
        }),

      /* ---------------- board sections ---------------- */

      addSection: (position, title = 'Section') => {
        const s = get()
        const id = nid('section')
        const defaults = CARD_DEFAULTS.section
        const section: BoardSection = {
          id,
          title,
          x: position.x,
          y: position.y,
          width: defaults.w,
          height: defaults.h,
          color: 'gray',
          collapsed: false,
          childCardIds: [],
          metadata: {},
        }
        const node: BoardNode = {
          id,
          type: 'section',
          position,
          width: defaults.w,
          height: defaults.h,
          dragHandle: '.section-drag',
          selected: true,
          data: { type: 'section', color: 'gray', section },
        }
        const board = s.boards[s.activeBoardId]
        // sections live at the START of the array: rendered behind cards,
        // and React Flow requires parents to precede their children
        set(
          patchBoard(s, board.id, {
            nodes: [node, ...board.nodes.map((n) => ({ ...n, selected: false }))],
          }),
        )
        return id
      },

      updateSection: (id, patch) =>
        set((s) => {
          const board = s.boards[s.activeBoardId]
          return patchBoard(s, board.id, {
            nodes: board.nodes.map((n) =>
              n.id === id && n.data.section
                ? { ...n, data: { ...n.data, section: { ...n.data.section, ...patch } } }
                : n,
            ),
          })
        }),

      toggleSectionCollapsed: (id) =>
        set((s) => {
          const board = s.boards[s.activeBoardId]
          const target = board.nodes.find((n) => n.id === id)
          const sec = target?.data.section
          if (!target || !sec) return {}
          const collapsed = !sec.collapsed
          const prevHeight = collapsed
            ? (target.height ?? CARD_DEFAULTS.section.h)
            : ((sec.metadata.prevHeight as number) ?? CARD_DEFAULTS.section.h)
          const nodes = board.nodes.map((n) => {
            if (n.id === id) {
              return {
                ...n,
                height: collapsed ? SECTION_COLLAPSED_H : prevHeight,
                data: {
                  ...n.data,
                  section: {
                    ...sec,
                    collapsed,
                    metadata: { ...sec.metadata, prevHeight },
                  },
                },
              }
            }
            if (n.parentId === id) return { ...n, hidden: collapsed }
            return n
          })
          return patchBoard(s, board.id, { nodes })
        }),

      attachCardToSection: (cardId, sectionId) =>
        set((s) => {
          const board = s.boards[s.activeBoardId]
          const nodes = board.nodes
          const card = nodes.find((n) => n.id === cardId)
          const section = nodes.find((n) => n.id === sectionId)
          if (!card || !section || card.type === 'section') return {}
          if (card.parentId === sectionId) return {}
          const abs = absolutePositionOf(card, nodes)
          const rel = {
            x: abs.x - section.position.x,
            y: abs.y - section.position.y,
          }
          const next = nodes.map((n) =>
            n.id === cardId ? { ...n, parentId: sectionId, position: rel } : n,
          )
          return patchBoard(s, board.id, {
            nodes: refreshSectionChildren(orderSectionsFirst(next)),
          })
        }),

      detachCardFromSection: (cardId) =>
        set((s) => {
          const board = s.boards[s.activeBoardId]
          const nodes = board.nodes
          const card = nodes.find((n) => n.id === cardId)
          if (!card?.parentId) return {}
          const abs = absolutePositionOf(card, nodes)
          const next = nodes.map((n) => {
            if (n.id !== cardId) return n
            const { parentId: _drop, ...rest } = n
            return { ...rest, position: abs }
          })
          return patchBoard(s, board.id, {
            nodes: refreshSectionChildren(next),
          })
        }),

      /* ---------------- web embeds ---------------- */

      addWebEmbedCard: (rawUrl, position) => {
        // sanitization lives in WebEmbedService — unsafe schemes never
        // reach the board; the caller shows `reason` to the user
        const res = createWebEmbed(rawUrl)
        if (!res.embed) return { cardId: null, reason: res.reason }
        const cardId = get().addCard('webembed', position, {
          embed: res.embed,
          title: res.embed.title,
          url: res.embed.url,
          color: 'blue',
        })
        return { cardId }
      },

      updateWebEmbed: (cardId, patch) =>
        set((s) => {
          const board = s.boards[s.activeBoardId]
          return patchBoard(s, board.id, {
            nodes: board.nodes.map((n) =>
              n.id === cardId && n.data.embed
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      embed: { ...n.data.embed, ...patch, updatedAt: Date.now() },
                    },
                  }
                : n,
            ),
          })
        }),

      /* ---------------- notes ---------------- */

      createNote: (partial = {}) => {
        const id = nid('note')
        const doc: NoteDoc = {
          id,
          title: 'Untitled note',
          content: '',
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          projectId: get().activeProjectId,
          ...partial,
        }
        set((s) => ({ notes: { ...s.notes, [id]: doc } }))
        return id
      },

      updateNote: (id, patch) =>
        set((s) => {
          const note = s.notes[id]
          if (!note) return {}
          return {
            notes: {
              ...s.notes,
              [id]: { ...note, ...patch, updatedAt: Date.now() },
            },
          }
        }),

      deleteNote: (id) =>
        set((s) => {
          const notes = { ...s.notes }
          delete notes[id]
          return {
            notes,
            boards: stripCards(s.boards, (d) => d.noteId === id),
            activeNoteId: s.activeNoteId === id ? null : s.activeNoteId,
            recents: dropRecent(s.recents, 'note', id),
          }
        }),

      openNote: (id) =>
        set((s) => ({
          activeNoteId: id,
          activeAssetId: null,
          activeDocId: null,
          activeCodeId: null,
          activeSheetId: null,
          viewMode: modeAfterOpen(s.viewMode, 'doc'),
          recents: pushRecent(s.recents, { kind: 'note', id }),
        })),

      openWikilink: (title) => {
        const s = get()
        const t = title.toLowerCase()
        const foundNote = Object.values(s.notes).find(
          (n) => n.title.toLowerCase() === t,
        )
        if (foundNote) {
          s.openNote(foundNote.id)
          return
        }
        const foundDoc = Object.values(s.docs).find(
          (d) => d.title.toLowerCase() === t,
        )
        if (foundDoc) {
          s.openDoc(foundDoc.id)
          return
        }
        const foundCode = Object.values(s.codeDocs).find(
          (c) => c.title.toLowerCase() === t,
        )
        if (foundCode) {
          s.openCode(foundCode.id)
          return
        }
        const foundSheet = Object.values(s.sheetDocs).find(
          (sh) => sh.title.toLowerCase() === t,
        )
        if (foundSheet) {
          s.openSheet(foundSheet.id)
          return
        }
        s.openNote(s.createNote({ title }))
      },

      /* ---------------- assets ---------------- */

      addAsset: (asset) =>
        set((s) => ({
          assets: {
            ...s.assets,
            [asset.id]: { projectId: s.activeProjectId, ...asset },
          },
        })),

      renameAsset: (id, name) =>
        set((s) => {
          const asset = s.assets[id]
          if (!asset) return {}
          return { assets: { ...s.assets, [id]: { ...asset, name } } }
        }),

      deleteAsset: (id) => {
        releaseAssetUrl(id)
        void storage.deleteBlob(id)
        set((s) => {
          const assets = { ...s.assets }
          delete assets[id]
          return {
            assets,
            boards: stripCards(s.boards, (d) => d.assetId === id),
            activeAssetId: s.activeAssetId === id ? null : s.activeAssetId,
            recents: dropRecent(s.recents, 'asset', id),
          }
        })
      },

      openAsset: (id) =>
        set((s) => ({
          activeAssetId: id,
          activeDocId: null,
          activeCodeId: null,
          activeSheetId: null,
          viewMode: modeAfterOpen(s.viewMode, 'doc'),
          recents: pushRecent(s.recents, { kind: 'asset', id }),
        })),

      closeAsset: () => set({ activeAssetId: null }),

      /* ---------------- rich documents ---------------- */

      createDoc: (partial = {}) => {
        const id = nid('doc')
        const meta: RichDocMeta = {
          id,
          title: 'Untitled document',
          type: 'rich-document',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          linkedAssets: [],
          outgoingLinks: [],
          snippet: '',
          wordCount: 0,
          outline: [],
          tags: [],
          metadata: {},
          projectId: get().activeProjectId,
          ...partial,
        }
        set((s) => ({ docs: { ...s.docs, [id]: meta } }))
        // seed an empty body; editors treat a missing body as empty anyway
        void storage.putDocument(id, EMPTY_DOC).catch(console.error)
        return id
      },

      updateDocMeta: (id, patch) =>
        set((s) => {
          const meta = s.docs[id]
          if (!meta) return {}
          return {
            docs: {
              ...s.docs,
              [id]: { ...meta, ...patch, updatedAt: Date.now() },
            },
          }
        }),

      persistDocContent: (id, body, opts) => {
        void storage.putDocument(id, body).catch(console.error)
        const meta = get().docs[id]
        if (!meta) return
        set((s) => ({
          docs: {
            ...s.docs,
            [id]: { ...meta, ...digestDocJson(body), updatedAt: Date.now() },
          },
        }))
        if (!opts?.silent) announceEdit('doc', id, `Edited document “${meta.title}”`)
      },

      deleteDoc: (id) => {
        void storage.deleteDocument(id).catch(console.error)
        const docProject = get().docs[id]?.projectId ?? get().activeProjectId
        void Promise.all([
          import('@/lib/crdt/YjsManager'),
          import('@/lib/crdt/DocumentCRDT'),
        ]).then(([{ yjsManager }, { deleteDocumentCRDT }]) =>
          deleteDocumentCRDT(yjsManager.room(docProject), id),
        )
        set((s) => {
          const docs = { ...s.docs }
          delete docs[id]
          return {
            docs,
            boards: stripCards(s.boards, (d) => d.docId === id),
            activeDocId: s.activeDocId === id ? null : s.activeDocId,
            recents: dropRecent(s.recents, 'doc', id),
          }
        })
      },

      openDoc: (id) =>
        set((s) => ({
          activeDocId: id,
          activeAssetId: null,
          activeCodeId: null,
          activeSheetId: null,
          viewMode: modeAfterOpen(s.viewMode, 'doc'),
          recents: pushRecent(s.recents, { kind: 'doc', id }),
        })),

      closeDoc: () => set({ activeDocId: null }),

      /* ---------------- spreadsheets ---------------- */

      createSheetDoc: (partial = {}) => {
        const id = nid('sheet')
        const body = createBody()
        const meta: SpreadsheetDocMeta = {
          id,
          title: 'Untitled spreadsheet',
          type: 'sheet',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          tags: [],
          metadata: {},
          projectId: get().activeProjectId,
          ...digestSpreadsheet(body),
          ...partial,
        }
        set((s) => ({ sheetDocs: { ...s.sheetDocs, [id]: meta } }))
        void storage.putDocument(id, body).catch(console.error)
        return id
      },

      updateSheetMeta: (id, patch) =>
        set((s) => {
          const meta = s.sheetDocs[id]
          if (!meta) return {}
          return {
            sheetDocs: {
              ...s.sheetDocs,
              [id]: { ...meta, ...patch, updatedAt: Date.now() },
            },
          }
        }),

      persistSheetBody: (id, body) => {
        void storage.putDocument(id, body).catch(console.error)
        const meta = get().sheetDocs[id]
        if (!meta) return
        set((s) => ({
          sheetDocs: {
            ...s.sheetDocs,
            [id]: { ...meta, ...digestSpreadsheet(body), updatedAt: Date.now() },
          },
        }))
        announceEdit('sheet', id, `Edited spreadsheet “${meta.title}”`)
      },

      deleteSheetDoc: (id) => {
        void storage.deleteDocument(id).catch(console.error)
        set((s) => {
          const sheetDocs = { ...s.sheetDocs }
          delete sheetDocs[id]
          return {
            sheetDocs,
            boards: stripCards(s.boards, (d) => d.sheetId === id),
            activeSheetId: s.activeSheetId === id ? null : s.activeSheetId,
            recents: dropRecent(s.recents, 'sheet', id),
          }
        })
      },

      openSheet: (id) =>
        set((s) => ({
          activeSheetId: id,
          activeAssetId: null,
          activeDocId: null,
          activeCodeId: null,
          viewMode: modeAfterOpen(s.viewMode, 'sheet'),
          recents: pushRecent(s.recents, { kind: 'sheet', id }),
        })),

      closeSheet: () => set({ activeSheetId: null }),

      /* ---------------- code documents ---------------- */

      createCode: (partial = {}) => {
        const id = nid('code')
        const language = partial.language ?? 'typescript'
        const meta: CodeDocMeta = {
          id,
          title: 'untitled',
          type: 'code',
          language,
          extension: partial.extension ?? extForLang(language),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          snippet: '',
          lineCount: 0,
          size: 0,
          outgoingLinks: [],
          tags: [],
          metadata: {},
          projectId: get().activeProjectId,
          ...partial,
        }
        set((s) => ({ codeDocs: { ...s.codeDocs, [id]: meta } }))
        void storage.putDocument(id, '').catch(console.error)
        return id
      },

      updateCodeMeta: (id, patch) =>
        set((s) => {
          const meta = s.codeDocs[id]
          if (!meta) return {}
          return {
            codeDocs: {
              ...s.codeDocs,
              [id]: { ...meta, ...patch, updatedAt: Date.now() },
            },
          }
        }),

      persistCodeContent: (id, content, opts) => {
        void storage.putDocument(id, content).catch(console.error)
        const meta = get().codeDocs[id]
        if (!meta) return
        set((s) => ({
          codeDocs: {
            ...s.codeDocs,
            [id]: { ...meta, ...digestCode(content), updatedAt: Date.now() },
          },
        }))
        if (!opts?.silent) announceEdit('code', id, `Edited ${meta.title}.${meta.extension}`)
      },

      deleteCode: (id) => {
        void storage.deleteDocument(id).catch(console.error)
        const codeProject = get().codeDocs[id]?.projectId ?? get().activeProjectId
        void Promise.all([
          import('@/lib/crdt/YjsManager'),
          import('@/lib/crdt/CodeCRDT'),
        ]).then(([{ yjsManager }, { deleteCodeCRDT }]) =>
          deleteCodeCRDT(yjsManager.room(codeProject), id),
        )
        set((s) => {
          const codeDocs = { ...s.codeDocs }
          delete codeDocs[id]
          return {
            codeDocs,
            codeTabs: s.codeTabs.filter((t) => t !== id),
            boards: stripCards(s.boards, (d) => d.codeId === id),
            activeCodeId: s.activeCodeId === id ? null : s.activeCodeId,
            recents: dropRecent(s.recents, 'code', id),
          }
        })
      },

      openCode: (id) =>
        set((s) => ({
          activeCodeId: id,
          activeAssetId: null,
          activeDocId: null,
          activeSheetId: null,
          codeTabs: s.codeTabs.includes(id) ? s.codeTabs : [...s.codeTabs, id],
          viewMode: modeAfterOpen(s.viewMode, 'code'),
          recents: pushRecent(s.recents, { kind: 'code', id }),
        })),

      closeCode: () => set({ activeCodeId: null }),

      closeCodeTab: (id) =>
        set((s) => {
          const codeTabs = s.codeTabs.filter((t) => t !== id)
          let activeCodeId = s.activeCodeId
          if (activeCodeId === id) {
            const idx = s.codeTabs.indexOf(id)
            activeCodeId = codeTabs[Math.min(idx, codeTabs.length - 1)] ?? null
          }
          return { codeTabs, activeCodeId }
        }),

      /* ---------------- project file import ---------------- */

      importVault: async (data) => {
        if (data?.app !== 'lattice' || !data.boards || !data.notes) {
          throw new Error('Not a Lattice project file')
        }
        const boardOrder = data.boardOrder.filter((id) => data.boards[id])
        if (!boardOrder.length) throw new Error('Project file contains no boards')

        releaseAllAssetUrls()
        await storage.clear()
        for (const [id, dataUrl] of Object.entries(data.assetData ?? {})) {
          const blob = await (await fetch(dataUrl)).blob()
          await storage.putBlob(id, blob)
        }
        for (const [id, body] of Object.entries(data.docData ?? {})) {
          await storage.putDocument(id, body)
        }
        for (const [id, source] of Object.entries(data.codeData ?? {})) {
          await storage.putDocument(id, source)
        }
        for (const [id, body] of Object.entries(data.sheetData ?? {})) {
          await storage.putDocument(id, normalizeBody(body))
        }
        // pre-v6 files have no projects: stamp everything with a default one
        const projects =
          data.projects && Object.keys(data.projects).length
            ? data.projects
            : { [DEFAULT_PROJECT_ID]: makeDefaultProject() }
        const fallbackProject =
          data.activeProjectId && projects[data.activeProjectId]
            ? data.activeProjectId
            : Object.keys(projects)[0]
        set({
          projects,
          activeProjectId: fallbackProject,
          recentProjectIds: [fallbackProject],
          boards: stampProject(data.boards, fallbackProject),
          boardOrder,
          notes: stampProject(data.notes, fallbackProject),
          assets: stampProject(data.assets ?? {}, fallbackProject),
          docs: stampProject(data.docs ?? {}, fallbackProject),
          codeDocs: stampProject(data.codeDocs ?? {}, fallbackProject),
          sheetDocs: stampProject(data.sheetDocs ?? {}, fallbackProject),
          codeTabs: [],
          recents: [],
          activeBoardId: boardOrder[0],
          activeNoteId: null,
          activeAssetId: null,
          activeDocId: null,
          activeCodeId: null,
          activeSheetId: null,
        })
      },
    }),
    {
      name: 'lattice-vault-v1',
      version: 1,
      migrate: (persisted, version) => {
        // v0 → v1: introduce projects; the default project adopts everything
        const s = persisted as Partial<AppState>
        if (version < 1) {
          const project = makeDefaultProject()
          s.projects = { [project.id]: project }
          s.activeProjectId = project.id
          s.recentProjectIds = [project.id]
          s.recents = s.recents ?? []
          s.sidebarFilter = 'all'
          if (s.boards) s.boards = stampProject(s.boards, project.id)
          if (s.notes) s.notes = stampProject(s.notes, project.id)
          if (s.assets) s.assets = stampProject(s.assets, project.id)
          if (s.docs) s.docs = stampProject(s.docs, project.id)
          if (s.codeDocs) s.codeDocs = stampProject(s.codeDocs, project.id)
          if (s.sheetDocs) s.sheetDocs = stampProject(s.sheetDocs, project.id)
        }
        return s as AppState
      },
      partialize: (s) => ({
        projects: s.projects,
        activeProjectId: s.activeProjectId,
        recentProjectIds: s.recentProjectIds,
        boards: s.boards,
        boardOrder: s.boardOrder,
        activeBoardId: s.activeBoardId,
        notes: s.notes,
        assets: s.assets,
        docs: s.docs,
        codeDocs: s.codeDocs,
        sheetDocs: s.sheetDocs,
        codeTabs: s.codeTabs,
        recents: s.recents,
        activeNoteId: s.activeNoteId,
        activeAssetId: s.activeAssetId,
        activeDocId: s.activeDocId,
        activeCodeId: s.activeCodeId,
        activeSheetId: s.activeSheetId,
        viewMode: s.viewMode,
        theme: s.theme,
      }),
    },
  ),
)

/**
 * Build a fully self-contained project file: vault metadata plus every
 * asset binary (base64) and every rich document body. Async because
 * payloads stream out of the StorageProvider.
 */
export async function exportVaultFull(): Promise<VaultExport> {
  const s = useStore.getState()
  const assetData: Record<string, string> = {}
  for (const id of Object.keys(s.assets)) {
    const blob = await storage.getBlob(id)
    if (blob) assetData[id] = await blobToDataUrl(blob)
  }
  const docData: Record<string, unknown> = {}
  for (const id of Object.keys(s.docs)) {
    const body = await storage.getDocument(id)
    if (body) docData[id] = body
  }
  const codeData: Record<string, string> = {}
  for (const id of Object.keys(s.codeDocs)) {
    const source = await storage.getDocument(id)
    if (typeof source === 'string') codeData[id] = source
  }
  const sheetData: Record<string, unknown> = {}
  for (const id of Object.keys(s.sheetDocs)) {
    const body = await storage.getDocument(id)
    if (body) sheetData[id] = body
  }
  return {
    app: 'lattice',
    version: 6,
    exportedAt: Date.now(),
    boards: s.boards,
    boardOrder: s.boardOrder,
    notes: s.notes,
    assets: s.assets,
    assetData,
    docs: s.docs,
    docData,
    codeDocs: s.codeDocs,
    codeData,
    sheetDocs: s.sheetDocs,
    sheetData,
    projects: s.projects,
    activeProjectId: s.activeProjectId,
  }
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g

export interface Backlinks {
  notes: NoteDoc[]
  docs: RichDocMeta[]
  code: CodeDocMeta[]
}

/**
 * Everything that wikilinks to the given title. Notes are scanned (they
 * are small and always in memory); rich documents and code documents are
 * matched via their digested outgoingLinks — bodies are never loaded.
 */
export function backlinksToTitle(
  notes: Record<string, NoteDoc>,
  docs: Record<string, RichDocMeta>,
  codeDocs: Record<string, CodeDocMeta>,
  title: string,
  excludeId?: string,
): Backlinks {
  const t = title.toLowerCase()
  return {
    notes: Object.values(notes).filter(
      (n) =>
        n.id !== excludeId &&
        [...n.content.matchAll(WIKILINK_RE)].some(
          (m) => m[1].trim().toLowerCase() === t,
        ),
    ),
    docs: Object.values(docs).filter(
      (d) =>
        d.id !== excludeId &&
        d.outgoingLinks.some((l) => l.trim().toLowerCase() === t),
    ),
    code: Object.values(codeDocs).filter(
      (c) =>
        c.id !== excludeId &&
        c.outgoingLinks.some((l) => l.trim().toLowerCase() === t),
    ),
  }
}

/** Notes whose content wikilinks to the given note's title. */
export function backlinksTo(
  notes: Record<string, NoteDoc>,
  note: NoteDoc,
): NoteDoc[] {
  return backlinksToTitle(notes, {}, {}, note.title, note.id).notes
}
