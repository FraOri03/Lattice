import type {
  AssetDoc,
  Board,
  BoardNode,
  CodeDocMeta,
  NoteDoc,
  PresentationDocMeta,
  RichDocMeta,
  SpreadsheetDocMeta,
} from '@/types/model'
import type { Edge } from '@xyflow/react'
import type { GraphSourceSnapshot } from '../graphSource'

/**
 * Test fixtures for the graph library. Small hand-authored builders plus a
 * scalable synthetic-project generator used by the performance fixtures.
 */

let seq = 0
const uid = (p: string) => `${p}_${(seq++).toString(36)}`

export function note(partial: Partial<NoteDoc> & { title: string }): NoteDoc {
  return {
    id: partial.id ?? uid('note'),
    title: partial.title,
    content: partial.content ?? '',
    tags: partial.tags ?? [],
    createdAt: partial.createdAt ?? 1,
    updatedAt: partial.updatedAt ?? 1,
    projectId: partial.projectId ?? 'proj_test',
  }
}

export function doc(partial: Partial<RichDocMeta> & { title: string }): RichDocMeta {
  return {
    id: partial.id ?? uid('doc'),
    title: partial.title,
    type: 'rich-document',
    createdAt: 1,
    updatedAt: 1,
    linkedAssets: partial.linkedAssets ?? [],
    outgoingLinks: partial.outgoingLinks ?? [],
    sourceAssetId: partial.sourceAssetId,
    snippet: '',
    wordCount: 0,
    outline: [],
    tags: partial.tags ?? [],
    metadata: {},
    projectId: partial.projectId ?? 'proj_test',
  }
}

export function code(partial: Partial<CodeDocMeta> & { title: string }): CodeDocMeta {
  return {
    id: partial.id ?? uid('code'),
    title: partial.title,
    type: 'code',
    language: partial.language ?? 'typescript',
    extension: partial.extension ?? 'ts',
    sourceAssetId: partial.sourceAssetId,
    createdAt: 1,
    updatedAt: 1,
    snippet: '',
    lineCount: 0,
    size: 0,
    outgoingLinks: partial.outgoingLinks ?? [],
    tags: partial.tags ?? [],
    metadata: {},
    projectId: partial.projectId ?? 'proj_test',
  }
}

export function sheet(
  partial: Partial<SpreadsheetDocMeta> & { title: string },
): SpreadsheetDocMeta {
  return {
    id: partial.id ?? uid('sheet'),
    title: partial.title,
    type: 'sheet',
    createdAt: 1,
    updatedAt: 1,
    sourceAssetId: partial.sourceAssetId,
    sheetNames: ['Sheet1'],
    cellCount: 0,
    preview: [],
    snippet: '',
    tags: partial.tags ?? [],
    metadata: {},
    projectId: partial.projectId ?? 'proj_test',
  }
}

export function present(
  partial: Partial<PresentationDocMeta> & { title: string },
): PresentationDocMeta {
  return {
    id: partial.id ?? uid('present'),
    title: partial.title,
    type: 'presentation',
    createdAt: 1,
    updatedAt: 1,
    sourceAssetId: partial.sourceAssetId,
    slideCount: 1,
    snippet: '',
    tags: partial.tags ?? [],
    metadata: {},
    projectId: partial.projectId ?? 'proj_test',
  }
}

export function asset(partial: Partial<AssetDoc> & { name: string }): AssetDoc {
  return {
    id: partial.id ?? uid('asset'),
    name: partial.name,
    kind: partial.kind ?? 'pdf',
    ext: partial.ext ?? 'pdf',
    mime: partial.mime ?? 'application/pdf',
    size: partial.size ?? 100,
    originalName: partial.name,
    importedAt: 1,
    assetPath: `assets/${partial.name}`,
    importPath: `imports/${partial.name}`,
    projectId: partial.projectId ?? 'proj_test',
    bundle: partial.bundle,
  }
}

export function boardCard(
  id: string,
  type: BoardNode['data']['type'],
  data: Partial<BoardNode['data']> = {},
): BoardNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    width: 200,
    height: 150,
    data: { color: 'gray', ...data, type },
  }
}

export function boardEdge(id: string, source: string, target: string, label?: string): Edge {
  return { id, source, target, label }
}

export function board(partial: Partial<Board> & { id: string }): Board {
  return {
    id: partial.id,
    name: partial.name ?? 'Board',
    nodes: partial.nodes ?? [],
    edges: partial.edges ?? [],
    projectId: partial.projectId ?? 'proj_test',
  }
}

export function snapshot(partial: Partial<GraphSourceSnapshot> = {}): GraphSourceSnapshot {
  return {
    projectId: partial.projectId ?? 'proj_test',
    project: partial.project,
    notes: partial.notes ?? [],
    docs: partial.docs ?? [],
    codeDocs: partial.codeDocs ?? [],
    sheetDocs: partial.sheetDocs ?? [],
    presentDocs: partial.presentDocs ?? [],
    assets: partial.assets ?? [],
    boards: partial.boards ?? [],
  }
}

/**
 * Deterministic synthetic project of ~`nodeCount` entities with realistic
 * wikilink density, used for the performance fixtures. Every note links to a
 * few earlier notes so the graph is connected and non-trivial to lay out.
 */
export function syntheticSnapshot(nodeCount: number): GraphSourceSnapshot {
  const notes: NoteDoc[] = []
  const titleFor = (i: number) => `Node ${i}`
  for (let i = 0; i < nodeCount; i++) {
    const links: string[] = []
    // link back to up to 3 earlier nodes — deterministic pseudo-random
    for (let j = 1; j <= 3; j++) {
      const target = i - ((i * 7 + j * 13) % Math.max(1, Math.min(i, 50))) - 1
      if (target >= 0 && target < i) links.push(titleFor(target))
    }
    notes.push({
      id: `n${i}`,
      title: titleFor(i),
      content: links.map((l) => `[[${l}]]`).join(' '),
      tags: i % 20 === 0 ? ['cluster'] : [],
      createdAt: 1,
      updatedAt: 1,
      projectId: 'proj_perf',
    })
  }
  return snapshot({ projectId: 'proj_perf', notes })
}
