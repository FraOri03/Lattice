import type { Board, BoardNode, NoteDoc, Project } from '@/types/model'
import type { Edge } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'

const now = Date.now()

/** The project that owns all pre-Phase-6 content and fresh installs. */
export const DEFAULT_PROJECT_ID = 'proj_default'

export function makeDefaultProject(): Project {
  return {
    id: DEFAULT_PROJECT_ID,
    name: 'My Workspace',
    description: 'Your personal space — boards, notes and files live here.',
    icon: '🗂️',
    color: 'blue',
    createdAt: now,
    updatedAt: now,
    archived: false,
    starred: true,
    storageRoot: `projects/${DEFAULT_PROJECT_ID}`,
    settings: {},
  }
}

export const seedProjects: Record<string, Project> = {
  [DEFAULT_PROJECT_ID]: makeDefaultProject(),
}

const note = (id: string, title: string, content: string, tags: string[] = []): NoteDoc => ({
  id,
  title,
  content,
  tags,
  createdAt: now,
  updatedAt: now,
  projectId: DEFAULT_PROJECT_ID,
})

export const seedNotes: Record<string, NoteDoc> = {
  n_welcome: note(
    'n_welcome',
    'Welcome to Lattice',
    `# Welcome to Lattice

Lattice is a **local-first thinking canvas** — write structured notes like in Obsidian, arrange them spatially like in Figma.

## Try this
- Drag any card by its **header bar**
- Select a card and **resize** it from the corners
- **Double-click** a note card to open it in the editor
- Hover a card and drag the **right dot** onto another card to link them
- Drop **images or files** from your desktop straight onto the canvas

Connected ideas: [[Canvas basics]] and [[Roadmap]]`,
    ['howto'],
  ),
  n_canvas: note(
    'n_canvas',
    'Canvas basics',
    `# Canvas basics

- **Pan**: drag empty canvas space
- **Zoom**: mouse wheel / pinch
- **Multi-select**: hold \`Shift\` and drag a box
- **Delete**: select and press \`Delete\`
- **Link cards**: drag from the dot on a card's right edge

> Cards are *views* of your notes — the same note can live on several boards. Editing it anywhere updates it everywhere.

Back to [[Welcome to Lattice]]`,
    ['howto'],
  ),
  n_roadmap: note(
    'n_roadmap',
    'Roadmap',
    `# Roadmap

## Shipped in this prototype
- [x] Infinite canvas with movable, resizable cards
- [x] Markdown notes with [[wikilinks]] and backlinks
- [x] Image, video, link, file and 3D cards
- [x] Visual connections between cards
- [x] Tags, search, JSON export/import

## Next
- [ ] File System Access API vault (real .md files on disk)
- [ ] Tiptap WYSIWYG editing
- [ ] Card grouping / frames
- [ ] PDF & PNG board export
- [ ] Plugin API`,
    ['planning'],
  ),
  n_ideas: note(
    'n_ideas',
    'Research inbox',
    `# Research inbox

A scratchpad note. Some markdown to play with:

\`\`\`ts
const vault = loadVault('local')
vault.search('canvas')
\`\`\`

1. Collect references on the board
2. Cluster them spatially
3. Write the synthesis as a note`,
    ['research', 'moodboard'],
  ),
}

const seedImage = (() => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='420'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#0d99ff'/><stop offset='1' stop-color='#9747ff'/></linearGradient></defs><rect width='640' height='420' fill='url(#g)'/><g fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='2'><circle cx='140' cy='120' r='9' fill='rgba(255,255,255,0.9)' stroke='none'/><circle cx='330' cy='210' r='9' fill='rgba(255,255,255,0.9)' stroke='none'/><circle cx='500' cy='110' r='9' fill='rgba(255,255,255,0.9)' stroke='none'/><circle cx='450' cy='330' r='9' fill='rgba(255,255,255,0.9)' stroke='none'/><circle cx='180' cy='320' r='9' fill='rgba(255,255,255,0.9)' stroke='none'/><path d='M140 120 330 210 500 110M330 210 450 330M330 210 180 320'/></g><text x='32' y='390' font-family='sans-serif' font-size='20' fill='rgba(255,255,255,0.85)'>drop your own images here</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
})()

const card = (
  id: string,
  type: BoardNode['data']['type'],
  x: number,
  y: number,
  w: number,
  h: number,
  data: Partial<BoardNode['data']> = {},
): BoardNode => ({
  id,
  type,
  position: { x, y },
  width: w,
  height: h,
  dragHandle: '.drag-handle',
  data: { color: 'gray', ...data, type },
})

const seedNodes: BoardNode[] = [
  card('c_welcome', 'note', 0, 0, 340, 320, { noteId: 'n_welcome', color: 'blue' }),
  card('c_canvas', 'note', 470, -60, 320, 280, { noteId: 'n_canvas', color: 'purple' }),
  card('c_roadmap', 'note', 470, 290, 320, 260, { noteId: 'n_roadmap', color: 'green' }),
  card('c_image', 'image', -420, -40, 340, 250, {
    src: seedImage,
    title: 'moodboard.svg',
    caption: 'Images live on the board too',
    color: 'purple',
  }),
  card('c_video', 'video', -420, 280, 360, 250, {
    url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    title: 'Big Buck Bunny',
    color: 'red',
  }),
  card('c_3d', 'embed3d', 60, 400, 320, 260, { title: '3D embed', color: 'orange' }),
  card('c_link', 'link', 60, 720, 300, 100, {
    url: 'https://obsidian.md',
    title: 'Obsidian — inspiration',
    color: 'yellow',
  }),
]

const edge = (id: string, source: string, target: string, label?: string): Edge => ({
  id,
  source,
  target,
  label,
  type: 'default',
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
})

const seedEdges: Edge[] = [
  edge('e_w_c', 'c_welcome', 'c_canvas', 'how it works'),
  edge('e_w_r', 'c_welcome', 'c_roadmap'),
  edge('e_w_3d', 'c_welcome', 'c_3d', 'yes, real 3D'),
]

export const SEED_BOARD_ID = 'b_welcome'

export const seedBoards: Record<string, Board> = {
  [SEED_BOARD_ID]: {
    id: SEED_BOARD_ID,
    name: 'Welcome board',
    nodes: seedNodes,
    edges: seedEdges,
    projectId: DEFAULT_PROJECT_ID,
  },
  b_scratch: {
    id: 'b_scratch',
    name: 'Scratch board',
    nodes: [],
    edges: [],
    projectId: DEFAULT_PROJECT_ID,
  },
}

export const seedBoardOrder = [SEED_BOARD_ID, 'b_scratch']
