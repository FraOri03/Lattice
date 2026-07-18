import type { Edge, Node } from '@xyflow/react'

/** A markdown document. Lives independently of any board. */
export interface NoteDoc {
  id: string
  title: string
  content: string // markdown, supports [[wikilinks]]
  tags: string[]
  createdAt: number
  updatedAt: number
  /** owning project (Phase 6); entities without one belong to the default project */
  projectId?: string
  /** sidebar folder inside its category; unset = unfiled */
  folderId?: string
}

/* ---------------- projects (Phase 6) ---------------- */

/**
 * A project is an organizational space (like ChatGPT/Claude projects): it
 * owns boards, notes, documents, spreadsheets, code files and assets.
 * Entities point at their project via projectId; the project itself holds
 * only metadata. storageRoot is the project's folder inside the cloud
 * vault (e.g. "projects/proj_x1" under /Lattice on Google Drive).
 */
export interface Project {
  id: string
  name: string
  description: string
  /** single emoji/short glyph shown in the switcher */
  icon: string
  color: CardColor
  createdAt: number
  updatedAt: number
  archived: boolean
  starred: boolean
  storageRoot: string
  settings: ProjectSettings
}

/**
 * How code files are edited together (Phase 8):
 *  - collaborative: CRDT multiplayer — several people type at once,
 *    merges are deterministic (Yjs)
 *  - checkout: soft file lock — one active editor at a time, others
 *    request control; owner/admin may force-unlock
 */
export type CodeEditingPolicy = 'collaborative' | 'checkout'

export interface ProjectSettings {
  /** GitHub code-sync link: only code documents ever sync to GitHub */
  github?: {
    /** "owner/repo" */
    repo: string
    /** feature branch Lattice commits to — never the default branch */
    branch: string
    /** repo default branch (protected; Lattice never commits to it) */
    defaultBranch: string
  }
  /** code collaboration mode; default 'collaborative' */
  codeEditingPolicy?: CodeEditingPolicy
  [key: string]: unknown
}

/* ---------------- workspaces (Phase 8) ---------------- */

/**
 * A workspace is the organizational layer ABOVE projects:
 * Workspace → Projects → boards/docs/sheets/presentations/code/assets.
 * Projects link to workspaces through workspace.projectIds; the project
 * records themselves stay unchanged. The information architecture stops
 * here on purpose — no deeper nesting.
 *
 * Enforcement note: access control is enforced per PROJECT (realtime
 * room ACLs); workspace membership is organizational grouping.
 */
export interface Workspace {
  id: string
  name: string
  /** single emoji/short glyph shown in the switcher */
  icon: string
  color: CardColor
  ownerId: string
  memberIds: string[]
  projectIds: string[]
  settings: Record<string, unknown>
  archived: boolean
  /** the automatically created personal workspace (undeletable) */
  personal: boolean
  createdAt: number
  updatedAt: number
}

/* ---------------- sidebar folders ---------------- */

/**
 * The sidebar sections that can hold user folders. These mirror the
 * existing type-based grouping — folders live INSIDE a category, so an
 * item never changes type by being filed.
 */
export type FolderCategory =
  | 'boards'
  | 'docs'
  | 'sheets'
  | 'presentations'
  | 'code'
  | 'notes'
  | 'assets'

export const FOLDER_CATEGORIES: FolderCategory[] = [
  'boards',
  'docs',
  'sheets',
  'presentations',
  'code',
  'notes',
  'assets',
]

/**
 * A user-created folder inside one sidebar category, scoped to a project.
 *
 * Membership is stored on the ITEM (`folderId`), exactly like `projectId`
 * already is: an item with no folderId is simply unfiled, which is what
 * every pre-folder vault looks like, so the feature needs no data rewrite.
 * Deleting a folder therefore only has to clear that pointer — the items
 * survive as unfiled unless the user explicitly asks otherwise.
 */
export interface Folder {
  id: string
  name: string
  category: FolderCategory
  projectId?: string
  /** sort position within its category, ascending */
  order: number
  /** collapsed in the sidebar; persisted so it survives a refresh */
  collapsed: boolean
  createdAt: number
  updatedAt: number
}

/* ---------------- account (Phase 6) ---------------- */

export type AuthProviderId = 'google' | 'github' | 'mock'

export interface Account {
  id: string
  name: string
  email: string
  avatarUrl: string
  /** which identity/service providers this account has connected */
  providers: AuthProviderId[]
  createdAt: number
  updatedAt: number
}

/* ---------------- sync (Phase 6) ---------------- */

export type SyncStatus =
  | 'idle'
  | 'connecting'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error'
  | 'disabled'

export interface SyncConflict {
  /** entity kind + id, e.g. "doc:doc_x1" */
  key: string
  title: string
  localUpdatedAt: number
  remoteUpdatedAt: number
  /** how the resolver settled it (Phase 6 default: newest wins, loser kept) */
  resolution: 'local' | 'remote'
}

export interface SyncState {
  provider: 'google-drive' | 'none'
  status: SyncStatus
  lastSyncAt: number | null
  pendingChanges: number
  conflicts: SyncConflict[]
  error: string | null
}

/* ---------------- assets ---------------- */

export type AssetKind =
  | 'pdf'
  | 'image'
  | 'video'
  | 'audio'
  | 'model3d'
  | 'document' // doc, docx, odt, rtf — editable since Phase 2
  | 'spreadsheet' // xls, xlsx, ods, csv — editable since Phase 4
  | 'presentation' // ppt, pptx, odp — editable in Phase 5
  | 'file' // anything else, kept as an attachment

/**
 * Multi-file asset bundle (Phase 8): a main file (.gltf, .obj) plus the
 * companion files it references by RELATIVE path (buffers, materials,
 * textures). Dependencies are regular assets; the map lets viewers
 * resolve `textures/wood.png` to the right stored blob.
 */
export interface AssetBundleInfo {
  /** normalized relative path (as referenced by the main file) → asset id */
  dependencies: Record<string, string>
}

/**
 * An imported file. Metadata lives in the vault store; the binary lives in
 * the StorageProvider (IndexedDB today, File System Access API later).
 * assetPath/importPath are the file's virtual locations inside the vault —
 * they become real paths when the vault moves to disk.
 */
export interface AssetDoc {
  id: string
  name: string // display name, renamable
  kind: AssetKind
  ext: string // lowercase, without the dot
  mime: string
  size: number
  originalName: string
  importedAt: number
  assetPath: string // e.g. assets/asset_x1y2.pdf
  importPath: string // e.g. imports/report.pdf
  projectId?: string
  /** sidebar folder inside its category; unset = unfiled */
  folderId?: string
  /** companion files for multi-file formats (GLTF+BIN+textures, OBJ+MTL) */
  bundle?: AssetBundleInfo
}

/* ---------------- rich documents ---------------- */

export interface OutlineItem {
  level: number
  text: string
}

/**
 * Metadata for a rich text document (RichTextDocument). The Tiptap JSON
 * body is NOT here — it lives in the StorageProvider's document store and
 * is lazy-loaded when an editor opens. Everything the rest of the app
 * needs (cards, search, backlinks, outline) is digested into this record
 * on every save, so the link graph works without loading bodies.
 */
export interface RichDocMeta {
  id: string
  title: string
  type: 'rich-document'
  createdAt: number
  updatedAt: number
  /** asset ids referenced by embed blocks inside the body */
  linkedAssets: string[]
  /** [[wikilink]] targets found in the body */
  outgoingLinks: string[]
  /** original imported file (e.g. the source DOCX), kept in /imports */
  sourceAssetId?: string
  snippet: string
  wordCount: number
  outline: OutlineItem[]
  tags: string[]
  /** open extension point for plugins / future fields */
  metadata: Record<string, unknown>
  projectId?: string
  /** sidebar folder inside its category; unset = unfiled */
  folderId?: string
}

/** Card display mode for rich document / code cards on boards. */
export type RichDocCardMode = 'compact' | 'expanded'

/* ---------------- code documents ---------------- */

/**
 * Metadata for a code document (CodeDocument). Like rich documents, the
 * body (a plain string) lives in the StorageProvider and is lazy-loaded;
 * everything cards/search/backlinks need is digested here on save.
 */
export interface CodeDocMeta {
  id: string
  title: string
  type: 'code'
  language: string
  extension: string
  /** original imported file, kept in /imports */
  sourceAssetId?: string
  createdAt: number
  updatedAt: number
  snippet: string
  lineCount: number
  size: number
  /** [[wikilink]] targets found in the content (comments, markdown…) */
  outgoingLinks: string[]
  tags: string[]
  metadata: Record<string, unknown>
  projectId?: string
  /** sidebar folder inside its category; unset = unfiled */
  folderId?: string
}

/* ---------------- spreadsheet documents ---------------- */

/**
 * Metadata for a spreadsheet document (SpreadsheetDocument). The body —
 * a SpreadsheetBody JSON workbook (src/lib/sheet/sheetModel.ts), NEVER
 * XLSX — lives in the StorageProvider and is lazy-loaded when an editor
 * opens. Cards, search and the sidebar read only this digested record,
 * refreshed on every save.
 */
export interface SpreadsheetDocMeta {
  id: string
  title: string
  type: 'sheet'
  createdAt: number
  updatedAt: number
  /** original imported file (CSV/XLS/XLSX/ODS), kept in /imports */
  sourceAssetId?: string
  /** digested: workbook tab names, in order */
  sheetNames: string[]
  /** digested: total non-empty cells across all sheets */
  cellCount: number
  /** digested: formatted top-left corner of the first sheet, for cards */
  preview: string[][]
  snippet: string
  tags: string[]
  /** open extension point for plugins / future fields */
  metadata: Record<string, unknown>
  projectId?: string
  /** sidebar folder inside its category; unset = unfiled */
  folderId?: string
}

/* ---------------- presentations (Phase 8) ---------------- */

/**
 * Metadata for a presentation document. Like docs/sheets/code, the body
 * (a PresentationBody JSON from src/lib/present/presentModel.ts) lives in
 * the StorageProvider and is lazy-loaded when the editor opens.
 */
export interface PresentationDocMeta {
  id: string
  title: string
  type: 'presentation'
  createdAt: number
  updatedAt: number
  /** original imported file (PPTX/ODP/PPT), kept in /imports */
  sourceAssetId?: string
  /** digested: number of slides */
  slideCount: number
  /** digested: first text lines, for cards/search */
  snippet: string
  tags: string[]
  metadata: Record<string, unknown>
  projectId?: string
  /** sidebar folder inside its category; unset = unfiled */
  folderId?: string
}

/* ---------------- board cards ---------------- */

export type CardType =
  | 'note'
  | 'image'
  | 'video'
  | 'link'
  | 'file'
  | 'embed3d'
  | 'asset' // renders any imported AssetDoc, dispatched by kind
  | 'richdoc' // renders a RichDocMeta (compact preview or inline editor)
  | 'code' // renders a CodeDocMeta (compact info or read-only editor)
  | 'sheet' // renders a SpreadsheetDocMeta (compact info or mini grid)
  | 'presentation' // renders a PresentationDocMeta (compact info or slide preview)
  | 'section' // Figma-like frame that groups cards (Phase 6)
  | 'webembed' // sandboxed website embed / link preview (Phase 6)
  | 'photo' // live preview of the project's Photo-mode set (no payload)

export type CardColor =
  | 'gray'
  | 'blue'
  | 'purple'
  | 'green'
  | 'orange'
  | 'red'
  | 'yellow'

export const CARD_COLORS: Record<CardColor, string> = {
  gray: '#8a8f98',
  blue: '#0d99ff',
  purple: '#9747ff',
  green: '#14ae5c',
  orange: '#ffa629',
  red: '#f24822',
  yellow: '#ffcd29',
}

/**
 * A Figma-like section (frame) on a board. Persisted inside the board
 * JSON: geometry lives on the React Flow node (position/width/height),
 * everything else lives here in node.data.section. Cards inside a section
 * reference it through the node's parentId, and childCardIds is kept as a
 * digested mirror of that relationship for the serialized board format.
 */
export interface BoardSection {
  id: string
  title: string
  x: number
  y: number
  width: number
  height: number
  color: CardColor
  collapsed: boolean
  childCardIds: string[]
  metadata: Record<string, unknown>
}

/**
 * A website embedded on a board (WebEmbedCard). URLs are sanitized on
 * creation — only http(s) survives; javascript:/data:/file: are rejected.
 * fallbackMode 'preview' renders a link preview instead of the iframe
 * (either by user choice or because the site refuses to be framed).
 */
export interface WebEmbed {
  id: string
  url: string
  title: string
  faviconUrl: string
  embedAllowed: boolean
  fallbackMode: 'iframe' | 'preview'
  createdAt: number
  updatedAt: number
}

/**
 * Payload carried by every board card (React Flow node.data).
 * Which fields are used depends on the card type:
 *  - note:   noteId (references a NoteDoc)
 *  - asset:  assetId (references an AssetDoc)
 *  - presentation: presentId (references a PresentationDocMeta)
 *  - image:  src (data URL or remote URL), caption
 *  - video:  url (YouTube / Vimeo / direct file / data URL)
 *  - link:   url, title
 *  - file:   src (data URL), fileName, mime, size   (legacy pre-asset cards)
 *  - embed3d: (self-contained placeholder scene)
 *  - section: section (BoardSection metadata; geometry mirrors the node)
 *  - webembed: embed (WebEmbed payload)
 */
export interface CardData extends Record<string, unknown> {
  type: CardType
  color: CardColor
  noteId?: string
  assetId?: string
  docId?: string
  codeId?: string
  sheetId?: string
  presentId?: string
  mode?: RichDocCardMode
  title?: string
  src?: string
  url?: string
  caption?: string
  fileName?: string
  mime?: string
  size?: number
  section?: BoardSection
  embed?: WebEmbed
}

export type BoardNode = Node<CardData>

export interface Board {
  id: string
  name: string
  nodes: BoardNode[]
  edges: Edge[]
  projectId?: string
  /** sidebar folder inside its category; unset = unfiled */
  folderId?: string
}

/**
 * Top navigation modes:
 *  board · graph (Phase 9.5 — automatic relationship browser, placed right
 *  after Board) · split (workspace + board side-by-side) · doc (rich
 *  text/notes) · sheet (spreadsheet workspace) · presentation (slide
 *  workspace) · code (Monaco workspace).
 *
 * Note: the Document mode's internal value stays 'doc' (its persisted value
 * and hundreds of call sites) while its visible label is "Document".
 */
export type ViewMode =
  | 'board'
  | 'graph'
  | 'split'
  | 'doc'
  | 'sheet'
  | 'presentation'
  | 'code'
  | 'photo'
export type Theme = 'dark' | 'light'

/** A recently opened entity, newest first. */
export interface RecentEntry {
  kind: 'note' | 'doc' | 'sheet' | 'code' | 'asset' | 'board' | 'present'
  id: string
  at: number
}

/**
 * Shape of an exported .lattice.json project file.
 * v1: boards + notes only. v2 adds assets; binaries travel base64-encoded
 * in assetData so a project file is fully self-contained. v3 adds rich
 * documents: metadata in docs, Tiptap JSON bodies in docData. v4 adds
 * code documents. v5 adds spreadsheets: metadata in sheetDocs,
 * SpreadsheetBody JSON workbooks in sheetData. v6 adds projects. v7 adds
 * presentations: metadata in presentDocs, PresentationBody JSON in
 * presentData.
 */
export interface VaultExport {
  app: 'lattice'
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7
  exportedAt: number
  boards: Record<string, Board>
  boardOrder: string[]
  notes: Record<string, NoteDoc>
  assets?: Record<string, AssetDoc>
  assetData?: Record<string, string> // asset id → data URL
  docs?: Record<string, RichDocMeta>
  docData?: Record<string, unknown> // doc id → Tiptap JSON body
  codeDocs?: Record<string, CodeDocMeta> // v4
  codeData?: Record<string, string> // code id → source text
  sheetDocs?: Record<string, SpreadsheetDocMeta> // v5
  sheetData?: Record<string, unknown> // sheet id → SpreadsheetBody JSON
  projects?: Record<string, Project> // v6
  activeProjectId?: string // v6
  presentDocs?: Record<string, PresentationDocMeta> // v7
  presentData?: Record<string, unknown> // present id → PresentationBody JSON
}
